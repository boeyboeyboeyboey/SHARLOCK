import { createServer } from 'node:http'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { WebSocket } from 'ws'
import { Types } from 'mongoose'
import { connectDatabase } from '../../../src/config/database.js'
import { loadEnvironment } from '../../../src/config/env.js'
import { cohortModel } from '../../../src/models/Cohort.js'
import { institutionModel } from '../../../src/models/Institution.js'
import { instructorAssignmentModel } from '../../../src/models/InstructorAssignment.js'
import { membershipModel } from '../../../src/models/Membership.js'
import { userModel } from '../../../src/models/User.js'
import {
  createTestApp,
  disposeTestAuthApps,
  initializeTestAuth,
  registerTestStudent,
} from '../auth/helpers.js'

let database
let authOptions
let app
let server
let port
const sockets = []

beforeAll(async () => {
  const config = loadEnvironment()
  if (config.nodeEnv !== 'test')
    throw new Error('Presence integration tests require NODE_ENV=test.')
  database = await connectDatabase(config.databaseUri)
  authOptions = await initializeTestAuth(database, config)
})

beforeEach(async () => {
  if (!database?.name?.endsWith('_test')) {
    throw new Error('Refusing presence fixture cleanup outside a disposable _test database.')
  }
  await Promise.all(
    [
      'users',
      'auth_sessions',
      'memberships',
      'cohorts',
      'institutions',
      'instructor_assignments',
    ].map((name) => database.db.collection(name).deleteMany({})),
  )
  app = createTestApp(database, authOptions)
  server = createServer(app)
  server.on('upgrade', (request, socket, head) =>
    app.locals.presence.handleUpgrade(request, socket, head),
  )
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = server.address().port
})

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate()
  app.locals.presence.close()
  await new Promise((resolve) => server.close(resolve))
})

afterAll(async () => {
  await disposeTestAuthApps()
  await database?.close()
})

async function makeClass(name) {
  const institution = await institutionModel(database).create({
    name: `School ${name}`,
    slug: `school-${name}-${Date.now()}`,
    status: 'active',
  })
  return cohortModel(database).create({
    institutionId: institution._id,
    name: `Class ${name}`,
    term: '2026 T2',
    status: 'active',
  })
}

async function enrol(account, cohort, approvedAt = new Date()) {
  return membershipModel(database).create({
    userId: new Types.ObjectId(account.user.id),
    cohortId: cohort._id,
    status: 'active',
    decision: 'approved',
    approvedAt,
  })
}

async function student(cohort) {
  const account = await registerTestStudent(app)
  if (cohort) await enrol(account, cohort)
  return account
}

async function staff(role, assignedTo) {
  const account = await registerTestStudent(app)
  await userModel(database).updateOne(
    { _id: new Types.ObjectId(account.user.id) },
    { $set: { globalRoles: [role] } },
  )
  if (assignedTo) {
    await instructorAssignmentModel(database).create({
      userId: new Types.ObjectId(account.user.id),
      cohortId: assignedTo._id,
      status: 'active',
    })
  }
  return account
}

function cookieOf(account) {
  const jar = account.agent.jar.getCookies({
    domain: '127.0.0.1',
    path: '/api',
    secure: false,
    script: false,
  })
  return jar.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
}

// resolves with the open socket, or { status } when the upgrade is refused
function connect(account, { origin = authOptions.clientOrigin, cookie = cookieOf(account) } = {}) {
  return new Promise((resolve) => {
    const headers = {}
    if (origin) headers.Origin = origin
    if (cookie) headers.Cookie = cookie
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/presence`, { headers })
    ws.messages = []
    ws.on('message', (raw) => ws.messages.push(JSON.parse(raw.toString())))
    ws.closed = new Promise((done) =>
      ws.on('close', (code, reason) => {
        ws.closeReason = reason.toString()
        done(code)
      }),
    )
    sockets.push(ws)
    ws.on('open', () => resolve(ws))
    ws.on('unexpected-response', (_request, response) => {
      resolve({ status: response.statusCode })
      ws.terminate()
    })
    ws.on('error', () => {})
  })
}

async function until(check, label = 'condition') {
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    const value = check()
    if (value) return value
    await new Promise((resolve) => setTimeout(resolve, 15))
  }
  throw new Error(`Timed out waiting for ${label}.`)
}

const find = (ws, type) => ws.messages.find((message) => message.type === type)
const move = (ws, x = 3, z = 4) =>
  ws.send(JSON.stringify({ type: 'move', x, z, yaw: 1, moving: true }))

describe('presence upgrade checks', () => {
  it('rejects a wrong origin and a missing origin', async () => {
    const cohort = await makeClass('a')
    const account = await student(cohort)
    expect((await connect(account, { origin: 'http://evil.test' })).status).toBe(403)
    expect((await connect(account, { origin: null })).status).toBe(403)
  })

  it('rejects a missing or forged session cookie', async () => {
    const cohort = await makeClass('a')
    const account = await student(cohort)
    expect((await connect(account, { cookie: '' })).status).toBe(401)
    expect((await connect(account, { cookie: 'sharlock.sid=s%3Aforged.sig' })).status).toBe(401)
  })

  it('closes a student with no active class using 4403', async () => {
    const account = await student(null)
    const ws = await connect(account)
    expect(await ws.closed).toBe(4403)
  })

  it('closes the older socket with 4409 when the same user connects again', async () => {
    const cohort = await makeClass('a')
    const account = await student(cohort)
    const mate = await student(cohort)
    const watcher = await connect(mate)
    const first = await connect(account)
    move(first)
    await until(() => watcher.messages.some((m) => m.type === 'state'), 'first seen')
    const second = await connect(account)
    expect(await first.closed).toBe(4409)
    expect(first.closeReason).toBe('superseded')
    await until(() => watcher.messages.some((m) => m.type === 'leave'), 'leave')
    move(second)
    await until(() => watcher.messages.filter((m) => m.type === 'state').length > 1, 'second seen')
    const sids = new Set(watcher.messages.filter((m) => m.type === 'state').map((m) => m.sid))
    expect(sids.size).toBe(2)
    expect(second.readyState).toBe(1)
  })
})

describe('presence rooms', () => {
  it('shows classmates to each other and hides other classes', async () => {
    const classA = await makeClass('a')
    const classB = await makeClass('b')
    const [one, two, other] = [await student(classA), await student(classA), await student(classB)]
    const wsOne = await connect(one)
    const wsOther = await connect(other)
    const wsTwo = await connect(two)
    await until(() => find(wsTwo, 'snapshot'), 'snapshot')
    move(wsOne)
    const seen = await until(() => find(wsTwo, 'state'), 'state')
    expect(seen).toMatchObject({ x: 3, z: 4, yaw: 1, moving: true, role: 'student' })
    expect(seen.sid).toBe(find(wsOne, 'snapshot').you)
    move(wsTwo)
    await until(() => find(wsOne, 'state'), 'reverse state')
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(wsOther.messages.filter((message) => message.type === 'state')).toEqual([])
    wsOne.close()
    expect(await until(() => find(wsTwo, 'leave'), 'leave')).toEqual({
      type: 'leave',
      sid: seen.sid,
    })
  })

  it('sends a late joiner a snapshot of positioned peers', async () => {
    const cohort = await makeClass('a')
    const [one, two] = [await student(cohort), await student(cohort)]
    const wsOne = await connect(one)
    move(wsOne)
    await new Promise((resolve) => setTimeout(resolve, 120))
    const wsTwo = await connect(two)
    const snapshot = await until(() => find(wsTwo, 'snapshot'), 'snapshot')
    expect(snapshot.peers).toHaveLength(1)
    expect(snapshot.peers[0].username).toBe(one.user.username)
  })

  it('leaks no email, user id, or roster fields', async () => {
    const cohort = await makeClass('a')
    const [one, two] = [await student(cohort), await student(cohort)]
    const wsOne = await connect(one)
    const wsTwo = await connect(two)
    move(wsOne)
    await until(() => find(wsTwo, 'state'), 'state')
    const wire = JSON.stringify([...wsOne.messages, ...wsTwo.messages])
    expect(wire).not.toContain(one.email)
    expect(wire).not.toContain(one.user.id)
    expect(wire).not.toContain(two.user.id)
    expect(Object.keys(find(wsTwo, 'state')).sort()).toEqual(
      ['avatarId', 'look', 'moving', 'role', 'sid', 'type', 'username', 'x', 'yaw', 'z'].sort(),
    )
    expect(Object.keys(find(wsTwo, 'state').look).sort()).toEqual(
      ['accessory', 'hat', 'monocle', 'scarf'].sort(),
    )
  })

  it('places a legacy multi-class student in the latest approved class', async () => {
    const [older, newer] = [await makeClass('old'), await makeClass('new')]
    const account = await student(null)
    await enrol(account, older, new Date('2026-01-01'))
    await enrol(account, newer, new Date('2026-06-01'))
    const mate = await student(newer)
    const wsMate = await connect(mate)
    const wsLegacy = await connect(account)
    move(wsLegacy)
    expect(await until(() => find(wsMate, 'state'), 'state')).toMatchObject({ x: 3 })
  })

  it('ignores invalid and oversized messages, and closes abusers', async () => {
    const cohort = await makeClass('a')
    const [one, two] = [await student(cohort), await student(cohort)]
    const wsOne = await connect(one)
    const wsTwo = await connect(two)
    wsOne.send('{nope')
    wsOne.send(JSON.stringify({ type: 'move', x: 'a', z: 0, yaw: 0, moving: true }))
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(find(wsTwo, 'state')).toBeUndefined()
    for (let index = 0; index < 40; index += 1) wsOne.send('{nope')
    expect(await wsOne.closed).toBe(4408)
    const wsBig = await connect(await student(cohort))
    wsBig.send('x'.repeat(1000))
    expect(await wsBig.closed).toBe(1009)
  })

  it('drops moves faster than 10 Hz', async () => {
    const cohort = await makeClass('a')
    const [one, two] = [await student(cohort), await student(cohort)]
    const wsOne = await connect(one)
    const wsTwo = await connect(two)
    for (let index = 0; index < 5; index += 1) move(wsOne, index, 0)
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(wsTwo.messages.filter((message) => message.type === 'state')).toHaveLength(1)
  })
})

describe('presence staff', () => {
  it('admits an instructor to an assigned class and refuses an unassigned one', async () => {
    const [classA, classB] = [await makeClass('a'), await makeClass('b')]
    const learner = await student(classA)
    const teacher = await staff('instructor', classA)
    const wsLearner = await connect(learner)
    const wsTeacher = await connect(teacher)
    wsTeacher.send(JSON.stringify({ type: 'join', cohortId: classA._id.toString() }))
    await until(() => find(wsTeacher, 'snapshot'), 'staff snapshot')
    move(wsTeacher)
    expect(await until(() => find(wsLearner, 'state'), 'staff state')).toMatchObject({
      role: 'staff',
    })
    const wsDenied = await connect(teacher)
    wsDenied.send(JSON.stringify({ type: 'join', cohortId: classB._id.toString() }))
    expect(await wsDenied.closed).toBe(4403)
  })

  it('lets an admin join any active class and ignores student join attempts', async () => {
    const classA = await makeClass('a')
    const admin = await staff('admin')
    const wsAdmin = await connect(admin)
    wsAdmin.send(JSON.stringify({ type: 'join', cohortId: classA._id.toString() }))
    await until(() => find(wsAdmin, 'snapshot'), 'admin snapshot')
    const learner = await student(classA)
    const wsLearner = await connect(learner)
    wsLearner.send(JSON.stringify({ type: 'join', cohortId: new Types.ObjectId().toString() }))
    move(wsLearner)
    expect(await until(() => find(wsAdmin, 'state'), 'student still in own class')).toMatchObject({
      role: 'student',
    })
  })
})

describe('presence disconnects', () => {
  it('disconnects when the membership is removed', async () => {
    const cohort = await makeClass('a')
    const account = await student(cohort)
    const ws = await connect(account)
    await membershipModel(database).updateOne(
      { userId: new Types.ObjectId(account.user.id) },
      { $set: { status: 'removed', decision: 'removed' } },
    )
    await app.locals.presence.refresh()
    expect(await ws.closed).toBe(4403)
  })

  it('disconnects immediately on logout', async () => {
    const cohort = await makeClass('a')
    const account = await student(cohort)
    const ws = await connect(account)
    await account.agent
      .post('/api/auth/logout')
      .set('Origin', authOptions.clientOrigin)
      .set('X-CSRF-Token', account.csrfToken)
      .expect(204)
    expect(await ws.closed).toBe(4401)
    expect(ws.closeReason).not.toBe('replaced')
  })

  it('disconnects with 4401 when the same account signs in again elsewhere', async () => {
    const cohort = await makeClass('a')
    const account = await student(cohort)
    const ws = await connect(account)
    const other = request.agent(app)
    const csrf = await other
      .get('/api/auth/csrf')
      .set('Origin', authOptions.clientOrigin)
      .expect(200)
    await other
      .post('/api/auth/login')
      .set('Origin', authOptions.clientOrigin)
      .set('X-CSRF-Token', csrf.body.csrfToken)
      .send({ identifier: account.email, password: account.password })
      .expect(200)
    expect(await ws.closed).toBe(4401)
    expect(ws.closeReason).toBe('replaced')
    await other.get('/api/auth/me').expect(200)
  })

  it('disconnects when the account is deactivated', async () => {
    const cohort = await makeClass('a')
    const account = await student(cohort)
    const ws = await connect(account)
    await userModel(database).updateOne(
      { _id: new Types.ObjectId(account.user.id) },
      { $set: { accountStatus: 'disabled' } },
    )
    await app.locals.presence.refresh()
    expect(await ws.closed).toBe(4401)
  })

  it('destroys upgrade requests for other paths', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/other`, {
      headers: { Origin: authOptions.clientOrigin },
    })
    sockets.push(ws)
    const result = await new Promise((resolve) => {
      ws.on('error', (error) => resolve(error.message))
      ws.on('open', () => resolve('open'))
    })
    expect(result).not.toBe('open')
  })
})
