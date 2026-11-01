import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash, randomBytes } from 'node:crypto'
import { Types } from 'mongoose'
import { connectDatabase } from '../../../src/config/database.js'
import { assertSafeTestDatabaseUri } from '../../../src/config/database-uri.js'
import { validateEnvironment } from '../../../src/config/env.js'
import { initializeAuditStorage } from '../../../src/modules/audit/storage.js'
import { initializeRecoveryStorage } from '../../../src/modules/recovery/storage.js'
import { createRecoveryService } from '../../../src/modules/recovery/service.js'
import { PasswordBusyError } from '../../../src/modules/auth/password.js'
import { passwordResetModel } from '../../../src/modules/recovery/model.js'

// a full password queue is the only failure these cases simulate
const queue = vi.hoisted(() => ({ full: false }))
vi.mock('../../../src/modules/auth/password.js', async () => {
  const actual = await vi.importActual('../../../src/modules/auth/password.js')
  return {
    ...actual,
    hashPassword: async (...args) => {
      if (queue.full) throw new actual.PasswordBusyError()
      return actual.hashPassword(...args)
    },
  }
})

const password = 'New-Student-Password-2026!'
const replicaSetOnly = process.env.SHARLOCK_TEST_REPLICA_SET === '1' ? describe : describe.skip
let database
let service

async function storedLink(purpose) {
  const token = randomBytes(32).toString('base64url')
  await passwordResetModel(database).create({
    userId: new Types.ObjectId(),
    purpose,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    authVersion: 1,
    initiatedBy: new Types.ObjectId(),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
  })
  return token
}

replicaSetOnly('a busy password service during recovery', () => {
  beforeAll(async () => {
    const config = validateEnvironment(process.env)
    assertSafeTestDatabaseUri(config.databaseUri, process.env.MONGO_URI)
    database = await connectDatabase(config.databaseUri)
    if (process.env.NODE_ENV !== 'test' || !database.name.endsWith('_test')) {
      throw new Error('Recovery tests require a disposable _test database.')
    }
    await initializeAuditStorage(database)
    await initializeRecoveryStorage(database)
    service = createRecoveryService(database, { clientOrigin: config.clientOrigin })
  })

  beforeEach(async () => {
    queue.full = true
    await database.db.collection('password_resets').deleteMany({})
  })

  afterAll(async () => {
    await database?.db.collection('password_resets').deleteMany({})
    await database?.close()
  })

  it('tells a student to retry and leaves the reset token unspent', async () => {
    const token = await storedLink('student-password-reset')
    await expect(service.resetStudentPassword({ token, password })).rejects.toBeInstanceOf(
      PasswordBusyError,
    )
    const stored = await database.db.collection('password_resets').findOne({})
    expect(stored.consumedAt ?? null).toBeNull()
  })

  it('tells a new staff member to retry and leaves the activation link unspent', async () => {
    const token = await storedLink('activation')
    await expect(service.activateAccount({ token, password })).rejects.toBeInstanceOf(
      PasswordBusyError,
    )
    const stored = await database.db.collection('password_resets').findOne({})
    expect(stored.consumedAt ?? null).toBeNull()
  })
})
