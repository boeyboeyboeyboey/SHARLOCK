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
import { initializeAttemptStorage } from '../../../src/modules/attempts/storage.js'
import { createProductionAttemptRegistry } from '../../../src/modules/attempts/production-registry.js'
import { BOTNET_TAG_PATH } from '../../../src/modules/games/botnet-tag/protocol.js'
import { createRng } from '../../../src/modules/games/botnet-tag/rules.js'
import {
  COUNTDOWN_MS,
  ROUND_MS,
  STATION_LOCKOUT_MS,
} from '../../../src/modules/games/botnet-tag/rules.js'
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
let clock
const sockets = []

beforeAll(async () => {
  const config = loadEnvironment()
  if (config.nodeEnv !== 'test') throw new Error('Botnet tag tests require NODE_ENV=test.')
  database = await connectDatabase(config.databaseUri)
  authOptions = await initializeTestAuth(database, config)
  await initializeAttemptStorage(database, createProductionAttemptRegistry())
})

beforeEach(async () => {
  if (!database?.name?.endsWith('_test')) {
    throw new Error('Refusing botnet tag fixture cleanup outside a disposable _test database.')
  }
  await Promise.all(
    [
      'users',
      'auth_sessions',
      'memberships',
      'cohorts',
      'institutions',
      'instructor_assignments',
      'game_attempts',
    ].map((name) => database.db.collection(name).deleteMany({})),
  )
  clock = 1_000_000
  // the tick interval is parked: tests step the rounds themselves with tickAll and a fake clock
  app = createTestApp(database, authOptions, {
    botnetTag: { now: () => clock, tickMs: 3_600_000, rng: createRng(7) },
  })
  server = createServer(app)
  server.on('upgrade', (req, socket, head) => {
    const service =
      req.url.split('?')[0] === BOTNET_TAG_PATH ? app.locals.botnetTag : app.locals.presence
    service.handleUpgrade(req, socket, head)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = server.address().port
})

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate()
  app.locals.botnetTag.close()
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

async function enrol(account, cohort) {
  return membershipModel(database).create({
    userId: new Types.ObjectId(account.user.id),
    cohortId: cohort._id,
    status: 'active',
    decision: 'approved',
    approvedAt: new Date(),
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

function connect(account, { origin = authOptions.clientOrigin, cookie = cookieOf(account) } = {}) {
  return new Promise((resolve) => {
    const headers = {}
    if (origin) headers.Origin = origin
    if (cookie) headers.Cookie = cookie
    const ws = new WebSocket(`ws://127.0.0.1:${port}${BOTNET_TAG_PATH}`, { headers })
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
  const deadline = Date.now() + 4000
  while (Date.now() < deadline) {
    const value = check()
    if (value) return value
    await new Promise((resolve) => setTimeout(resolve, 15))
  }
  throw new Error(`Timed out waiting for ${label}.`)
}

const send = (ws, message) => ws.send(JSON.stringify(message))
const last = (ws, type) => ws.messages.findLast((message) => message.type === type)
const lastSnapshot = (ws) => last(ws, 'snapshot')
const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms))

// waits for a snapshot newer than the ones already received
async function freshSnapshot(ws, label = 'snapshot') {
  const seen = ws.messages.filter((message) => message.type === 'snapshot').length
  return until(() => {
    const all = ws.messages.filter((message) => message.type === 'snapshot')
    return all.length > seen ? all.at(-1) : null
  }, label)
}

const advance = (ms) => {
  clock += ms
  app.locals.botnetTag.tickAll()
}

// one human readies up, bots fill, the countdown runs and the round starts
async function startRound(ws) {
  send(ws, { type: 'ready', ready: true })
  await until(() => lastSnapshot(ws)?.phase === 'countdown', 'countdown')
  advance(COUNTDOWN_MS + 10)
  return until(() => lastSnapshot(ws)?.phase === 'playing', 'playing')
}

const liveRound = () => app.locals.botnetTag.inspectRounds()[0]
const humanOf = (ws) => liveRound().getPlayer(lastSnapshot(ws).sid)

describe('botnet tag upgrade checks', () => {
  it('rejects a wrong or missing origin', async () => {
    const account = await student(await makeClass('a'))
    expect((await connect(account, { origin: 'http://evil.test' })).status).toBe(403)
    expect((await connect(account, { origin: null })).status).toBe(403)
  })

  it('rejects a missing or forged session cookie', async () => {
    const account = await student(await makeClass('a'))
    expect((await connect(account, { cookie: '' })).status).toBe(401)
    expect((await connect(account, { cookie: 'sharlock.sid=s%3Aforged.sig' })).status).toBe(401)
  })

  it('closes a student with no active class using 4403', async () => {
    const ws = await connect(await student(null))
    expect(await ws.closed).toBe(4403)
  })

  it('closes the older socket with 4409 when the same user connects again', async () => {
    const account = await student(await makeClass('a'))
    const first = await connect(account)
    await until(() => lastSnapshot(first), 'first snapshot')
    const second = await connect(account)
    expect(await first.closed).toBe(4409)
    await until(() => lastSnapshot(second), 'second snapshot')
    expect(app.locals.botnetTag.roundCount()).toBe(1)
  })

  it('closes game sockets when a newer login replaces the session (SESS-01)', async () => {
    const account = await student(await makeClass('a'))
    const ws = await connect(account)
    await until(() => lastSnapshot(ws), 'snapshot')
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
  })
})

describe('botnet tag lobby and countdown', () => {
  it('puts classmates in one lobby and fills with bots once someone is ready', async () => {
    const cohort = await makeClass('a')
    const [one, two] = [await student(cohort), await student(cohort)]
    const wsOne = await connect(one)
    const wsTwo = await connect(two)
    await until(() => lastSnapshot(wsTwo)?.players.length === 2, 'both in lobby')
    expect(lastSnapshot(wsTwo).id).toBe(lastSnapshot(wsOne).id)
    expect(lastSnapshot(wsTwo).players.some((player) => player.isBot)).toBe(false)
    send(wsOne, { type: 'ready', ready: true })
    send(wsTwo, { type: 'ready', ready: true })
    await until(() => lastSnapshot(wsTwo)?.phase === 'countdown', 'countdown')
    const snapshot = lastSnapshot(wsTwo)
    expect(snapshot.players.length).toBe(3)
    expect(snapshot.players.filter((player) => player.isBot)).toHaveLength(1)
  })

  it('keeps other classes in separate rounds', async () => {
    const [classA, classB] = [await makeClass('a'), await makeClass('b')]
    const wsA = await connect(await student(classA))
    const wsB = await connect(await student(classB))
    await until(() => lastSnapshot(wsA) && lastSnapshot(wsB), 'snapshots')
    expect(lastSnapshot(wsA).id).not.toBe(lastSnapshot(wsB).id)
    expect(app.locals.botnetTag.roundCount()).toBe(2)
  })

  it('opens a new round when the first is full of humans', async () => {
    const cohort = await makeClass('a')
    const accounts = []
    for (let i = 0; i < 9; i += 1) accounts.push(await student(cohort))
    const wss = []
    for (const account of accounts) wss.push(await connect(account))
    await until(() => wss.every((ws) => lastSnapshot(ws)), 'all placed')
    const ids = new Set(wss.map((ws) => lastSnapshot(ws).id))
    expect(ids.size).toBe(2)
    expect(app.locals.botnetTag.roundCount()).toBe(2)
  })
})

describe('botnet tag play rules', () => {
  it('rejects a teleport and accepts a normal step', async () => {
    const ws = await connect(await student(await makeClass('a')))
    await until(() => lastSnapshot(ws), 'snapshot')
    await startRound(ws)
    const me = humanOf(ws)
    const start = { x: me.x, z: me.z }
    advance(1000)
    send(ws, { type: 'move', x: start.x + 30, z: start.z, yaw: 0 })
    await settle()
    expect({ x: humanOf(ws).x, z: humanOf(ws).z }).toEqual(start)
    clock += 1000
    send(ws, { type: 'move', x: start.x + 0.5, z: start.z, yaw: 0 })
    await until(() => humanOf(ws).x === start.x + 0.5, 'accepted step')
  })

  it('rejects a fake tag at distance and accepts a close one', async () => {
    const cohort = await makeClass('a')
    const [one, two, three] = [await student(cohort), await student(cohort), await student(cohort)]
    const sockets3 = [await connect(one), await connect(two), await connect(three)]
    await until(() => sockets3.every((ws) => lastSnapshot(ws)?.players.length === 3), 'lobby')
    for (const ws of sockets3) send(ws, { type: 'ready', ready: true })
    await until(() => lastSnapshot(sockets3[0])?.phase === 'countdown', 'countdown')
    advance(COUNTDOWN_MS + 10)
    await until(() => lastSnapshot(sockets3[0])?.phase === 'playing', 'playing')
    const round = liveRound()
    const zero = round.players().find((player) => player.infected)
    const target = round.players().find((player) => !player.infected)
    const zeroSocket = sockets3.find((ws) => lastSnapshot(ws).sid === zero.sid)
    Object.assign(zero, { x: -8, z: 0 })
    Object.assign(target, { x: 8, z: 0, immuneUntil: 0 })
    send(zeroSocket, { type: 'tag', target: target.sid })
    await settle()
    expect(round.getPlayer(target.sid).infected).toBe(false)
    Object.assign(target, { x: -7.5, z: 0 })
    send(zeroSocket, { type: 'tag', target: target.sid })
    await until(() => round.getPlayer(target.sid).infected, 'tag lands')
  })

  it('checks a puzzle submission on the server and keeps answers private', async () => {
    const ws = await connect(await student(await makeClass('a')))
    await until(() => lastSnapshot(ws), 'snapshot')
    await startRound(ws)
    const round = liveRound()
    const me = humanOf(ws)
    // a bot may be patient zero; make sure this player is clean and at a station
    me.infected = false
    const station = round.stationList().find((item) => item.kind === 'hash')
    Object.assign(me, { x: station.x, z: station.z })
    send(ws, { type: 'station', id: station.id })
    const withPuzzle = await until(
      () => lastSnapshot(ws)?.you?.puzzle && lastSnapshot(ws),
      'puzzle',
    )
    expect(withPuzzle.you.puzzle.kind).toBe('hash')
    expect(JSON.stringify(withPuzzle)).not.toContain('"answer"')
    let solved = false
    for (let guess = 0; guess < 3 && !solved; guess += 1) {
      send(ws, { type: 'submit', submission: { index: guess } })
      await settle(60)
      if (me.patches > 0) solved = true
      else {
        clock += STATION_LOCKOUT_MS + 100
        send(ws, { type: 'station', id: station.id })
        await until(() => lastSnapshot(ws)?.you?.puzzle, 'next puzzle')
      }
    }
    expect(me.patches).toBe(1)
    expect(me.immuneUntil).toBeGreaterThan(clock)
  })

  it('shows no other player puzzle and no email or user id on the wire', async () => {
    const cohort = await makeClass('a')
    const [one, two] = [await student(cohort), await student(cohort)]
    const [wsOne, wsTwo] = [await connect(one), await connect(two)]
    await until(() => lastSnapshot(wsTwo)?.players.length === 2, 'lobby')
    for (const ws of [wsOne, wsTwo]) send(ws, { type: 'ready', ready: true })
    await until(() => lastSnapshot(wsTwo)?.phase === 'countdown', 'countdown')
    advance(COUNTDOWN_MS + 10)
    await until(() => lastSnapshot(wsOne)?.phase === 'playing', 'playing')
    const round = liveRound()
    const mine = round.getPlayer(lastSnapshot(wsOne).sid)
    mine.infected = false
    const station = round.stationList()[0]
    Object.assign(mine, { x: station.x, z: station.z })
    send(wsOne, { type: 'station', id: station.id })
    await until(() => lastSnapshot(wsOne)?.you?.puzzle, 'puzzle')
    advance(70)
    const other = await freshSnapshot(wsTwo)
    expect(other.you.puzzle).toBeNull()
    const wire = JSON.stringify([...wsOne.messages, ...wsTwo.messages])
    for (const account of [one, two]) {
      expect(wire).not.toContain(account.email)
      expect(wire).not.toContain(account.user.id)
    }
    expect(Object.keys(other.players[0]).sort()).toEqual(
      [
        'avatarId',
        'infected',
        'immuneUntil',
        'isBot',
        'isStaff',
        'ready',
        'sid',
        'sprinting',
        'username',
        'x',
        'yaw',
        'z',
      ].sort(),
    )
  })

  it('ignores bad messages and closes abusers', async () => {
    const ws = await connect(await student(await makeClass('a')))
    await until(() => lastSnapshot(ws), 'snapshot')
    for (let i = 0; i < 40; i += 1) ws.send('{nope')
    expect(await ws.closed).toBe(4408)
    const big = await connect(await student(await makeClass('b')))
    big.send('x'.repeat(5000))
    expect(await big.closed).toBe(1009)
  })
})

describe('botnet tag saving', () => {
  async function finishRound(sockets3) {
    for (const ws of sockets3) send(ws, { type: 'ready', ready: true })
    await until(() => lastSnapshot(sockets3[0])?.phase === 'countdown', 'countdown')
    advance(COUNTDOWN_MS + 10)
    await until(() => lastSnapshot(sockets3[0])?.phase === 'playing', 'playing')
    advance(ROUND_MS + 10)
    await until(() => last(sockets3[0], 'results'), 'results')
    await app.locals.botnetTag.settleSaves()
  }

  it('saves one attempt per human student and none for staff or bots', async () => {
    const cohort = await makeClass('a')
    const [one, two] = [await student(cohort), await student(cohort)]
    const teacher = await staff('instructor', cohort)
    const wsOne = await connect(one)
    const wsTwo = await connect(two)
    const wsTeacher = await connect(teacher)
    send(wsTeacher, { type: 'join', cohortId: cohort._id.toString() })
    await until(() => lastSnapshot(wsTeacher), 'staff in lobby')
    await until(() => lastSnapshot(wsOne)?.players.length === 3, 'three in lobby')
    await finishRound([wsOne, wsTwo, wsTeacher])
    await until(() => last(wsTwo, 'saved'), 'saved notice')
    await settle()
    const attempts = await database.db.collection('game_attempts').find({}).toArray()
    expect(attempts).toHaveLength(2)
    expect(new Set(attempts.map((item) => item.playerId.toString()))).toEqual(
      new Set([one.user.id, two.user.id]),
    )
    for (const item of attempts) {
      expect(item).toMatchObject({ gameId: 'botnet-tag', mode: 'practice', status: 'completed' })
      expect(item.context.cohortId.toString()).toBe(cohort._id.toString())
      expect(item.competitiveEligible).toBe(false)
    }
    expect(last(wsTeacher, 'saved')).toBeUndefined()
    expect(last(wsOne, 'saved')).toMatchObject({ saved: true })
    // results carry no ids beyond the per connection sid
    const results = last(wsOne, 'results')
    expect(JSON.stringify(results)).not.toContain(one.user.id)
    expect(results.sideWon).toBe('survivors')
  })

  it('does not save the same round twice', async () => {
    const cohort = await makeClass('a')
    const wsOne = await connect(await student(cohort))
    await until(() => lastSnapshot(wsOne), 'snapshot')
    await startRound(wsOne)
    advance(ROUND_MS + 10)
    await until(() => last(wsOne, 'results'), 'results')
    await app.locals.botnetTag.settleSaves()
    advance(100)
    advance(100)
    await settle()
    expect(await database.db.collection('game_attempts').countDocuments({})).toBe(1)
  })
})

describe('botnet tag staff and rechecks', () => {
  it('admits an assigned instructor and refuses an unassigned class', async () => {
    const [classA, classB] = [await makeClass('a'), await makeClass('b')]
    const teacher = await staff('instructor', classA)
    const wsTeacher = await connect(teacher)
    send(wsTeacher, { type: 'join', cohortId: classA._id.toString() })
    const snapshot = await until(() => lastSnapshot(wsTeacher), 'staff snapshot')
    expect(snapshot.players.find((player) => player.sid === snapshot.sid).isStaff).toBe(true)
    const wsDenied = await connect(teacher)
    send(wsDenied, { type: 'join', cohortId: classB._id.toString() })
    expect(await wsDenied.closed).toBe(4403)
  })

  it('closes a student whose class membership was removed', async () => {
    const cohort = await makeClass('a')
    const account = await student(cohort)
    const ws = await connect(account)
    await until(() => lastSnapshot(ws), 'snapshot')
    await membershipModel(database).updateMany(
      { userId: new Types.ObjectId(account.user.id) },
      { $set: { status: 'removed' } },
    )
    await app.locals.botnetTag.refresh()
    expect(await ws.closed).toBe(4403)
  })

  it('closes a game socket when its session ends', async () => {
    const account = await student(await makeClass('a'))
    const ws = await connect(account)
    await until(() => lastSnapshot(ws), 'snapshot')
    await account.agent
      .post('/api/auth/logout')
      .set('Origin', authOptions.clientOrigin)
      .set('X-CSRF-Token', account.csrfToken)
      .expect(204)
    expect(await ws.closed).toBe(4401)
  })
})
