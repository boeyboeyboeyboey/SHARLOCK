import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { userModel } from '../../models/User.js'
import { assertTransactionSupport } from '../admin/bootstrap.js'
import { createAuditService } from '../audit/service.js'
import { hashPassword } from '../auth/password.js'
import { AuthError } from '../auth/policy.js'
import { createPermissionService } from '../../services/permissions.js'
import { createStudentRecoveryGuards } from './guards.js'
import {
  activationLifetimeMs,
  activationObjectId,
  ActivationError,
  parseActivationInput,
  parseStudentPasswordResetInput,
  parseStudentRecoveryIssue,
  parseStudentRecoveryLookup,
  recoveryObjectId,
  StudentRecoveryError,
  studentResetLifetimeMs,
} from './policy.js'
import { passwordResetModel } from './model.js'

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex')
}

// the stored role decides which staff account an activation link may finish
const provisionedRoleFilter = [{ globalRoles: ['instructor'] }, { globalRoles: ['admin'] }]

export function createRecoveryService(
  database,
  {
    now = Date.now,
    clientOrigin = 'http://localhost:5173',
    recordAuditEvent,
    consumeStudentIssueLimit = () => {},
    beforeRecoveryGuards = () => {},
  } = {},
) {
  const User = userModel(database)
  const PasswordReset = passwordResetModel(database)
  const permissions = createPermissionService(database)
  const guards = createStudentRecoveryGuards(database)
  const writeAudit = recordAuditEvent || createAuditService(database, { now }).recordAuditEvent
  const origin = new URL(clientOrigin)
  if (
    origin.origin !== clientOrigin ||
    origin.username ||
    origin.password ||
    origin.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
  ) {
    throw new TypeError('A validated localhost client origin is required.')
  }

  const transactionOptions = {
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority' },
    maxCommitTimeMS: 5000,
    timeoutMS: 10000,
  }

  async function withStudentTransaction(work) {
    let session
    let result
    let cleanupFailed = false
    try {
      await assertTransactionSupport(database)
      session = await database.startSession()
      result = await session.withTransaction(() => work(session), transactionOptions)
    } catch (error) {
      if (
        error instanceof StudentRecoveryError ||
        (error instanceof AuthError && error.status === 429)
      ) {
        throw error
      }
      throw new StudentRecoveryError('RECOVERY_FAILED', 503)
    } finally {
      try {
        await session?.endSession()
      } catch {
        cleanupFailed = true
      }
    }
    if (cleanupFailed) throw new StudentRecoveryError('RECOVERY_FAILED', 503)
    return result
  }

  async function recoveryEligibility(operation, input, session, expectedAuthVersion) {
    const eligibility = await guards.readEligibility(input, session)
    if (
      expectedAuthVersion !== undefined &&
      eligibility.target.authVersion !== expectedAuthVersion
    ) {
      throw new StudentRecoveryError()
    }
    await beforeRecoveryGuards({
      operation,
      issuerId: eligibility.issuer._id.toString(),
      targetId: eligibility.target._id.toString(),
      scopeCohortId: input.scopeCohortId?.toString() ?? null,
    })
    return eligibility
  }

  async function recordStudentEvent(eventType, eligibility, session) {
    await writeAudit(
      {
        eventType,
        actorKind: 'user',
        actorId: eligibility.issuer._id.toString(),
        targetId: eligibility.target._id.toString(),
        scopeCohortId: eligibility.scopeCohortId?.toString() ?? null,
        outcome: 'success',
        requestId: randomUUID(),
      },
      { session },
    )
  }

  async function issueStudentReset(input) {
    let admission
    return withStudentTransaction(async (session) => {
      const eligibility = await recoveryEligibility('issue', input, session)
      await guards.acquireEligibility(eligibility, session)
      // the request owns admission so transaction retries cannot charge it again
      admission ??= Promise.resolve().then(() => consumeStudentIssueLimit(input.targetId))
      await admission

      const occurredAt = new Date(now())
      const expiresAt = new Date(occurredAt.getTime() + studentResetLifetimeMs)
      const token = randomBytes(32).toString('base64url')
      await PasswordReset.updateMany(
        {
          userId: eligibility.target._id,
          purpose: 'student-password-reset',
          consumedAt: null,
          revokedAt: null,
        },
        { $set: { revokedAt: occurredAt } },
        { session },
      )
      await PasswordReset.create(
        [
          {
            userId: eligibility.target._id,
            purpose: 'student-password-reset',
            tokenHash: tokenHash(token),
            authVersion: eligibility.target.authVersion,
            initiatedBy: eligibility.issuer._id,
            scopeCohortId: input.scopeCohortId ?? null,
            createdAt: occurredAt,
            expiresAt,
          },
        ],
        { session },
      )
      await recordStudentEvent(
        input.scopeCohortId ? 'cohort.student.recovery.issue' : 'admin.student.recovery.issue',
        eligibility,
        session,
      )
      return {
        resetUrl: `${clientOrigin}/reset-password#token=${token}`,
        expiresAt: expiresAt.toISOString(),
      }
    })
  }

  async function lookupStudent(actor, input) {
    await permissions.requireCapability(actor, 'admin:recovery:manage')
    const { emailNormalized } = parseStudentRecoveryLookup(input)
    const student = await User.findOne({
      emailNormalized,
      accountStatus: 'active',
      globalRoles: ['student'],
    })
      .select('_id username emailNormalized avatarId')
      .lean()
    return {
      student: student
        ? {
            id: student._id.toString(),
            username: student.username,
            email: student.emailNormalized,
            avatarId: student.avatarId,
          }
        : null,
    }
  }

  async function issueInstructorStudentReset(actor, cohortId, studentId, input) {
    parseStudentRecoveryIssue(input)
    const issuerId = recoveryObjectId(actor?.id)
    const scopeCohortId = recoveryObjectId(cohortId)
    const targetId = recoveryObjectId(studentId)
    const current = await permissions.resolveActor(actor)
    if (current.globalRoles.includes('admin') || !current.globalRoles.includes('instructor')) {
      throw new StudentRecoveryError('RECOVERY_FORBIDDEN', 403)
    }
    return issueStudentReset({ issuerId, targetId, scopeCohortId })
  }

  async function issueAdminStudentReset(actor, studentId, input) {
    parseStudentRecoveryIssue(input)
    const issuerId = recoveryObjectId(actor?.id)
    const targetId = recoveryObjectId(studentId)
    await permissions.requireCapability(actor, 'admin:recovery:manage')
    return issueStudentReset({ issuerId, targetId, scopeCohortId: null })
  }

  async function resetStudentPassword(input) {
    const parsed = parseStudentPasswordResetInput(input)
    try {
      const hash = tokenHash(parsed.token)
      const candidate = await PasswordReset.findOne({
        tokenHash: hash,
        purpose: 'student-password-reset',
        consumedAt: null,
        revokedAt: null,
        expiresAt: { $gt: new Date(now()) },
      })
        .select('_id')
        .lean()
      if (!candidate) throw new StudentRecoveryError()
      const passwordHash = await hashPassword(parsed.password)
      await withStudentTransaction(async (session) => {
        const reset = await PasswordReset.findOne({
          _id: candidate._id,
          tokenHash: hash,
          purpose: 'student-password-reset',
          consumedAt: null,
          revokedAt: null,
          expiresAt: { $gt: new Date(now()) },
        })
          .session(session)
          .lean()
        if (!reset) throw new StudentRecoveryError()
        const eligibility = await recoveryEligibility(
          'redeem',
          {
            issuerId: reset.initiatedBy,
            targetId: reset.userId,
            scopeCohortId: reset.scopeCohortId,
          },
          session,
          reset.authVersion,
        )
        const targetRevision = await guards.acquireEligibility(eligibility, session)
        const occurredAt = new Date(now())
        const consumed = await PasswordReset.findOneAndUpdate(
          {
            _id: reset._id,
            tokenHash: hash,
            purpose: 'student-password-reset',
            consumedAt: null,
            revokedAt: null,
            expiresAt: { $gt: occurredAt },
          },
          { $set: { consumedAt: occurredAt } },
          { session, new: true },
        ).select('_id')
        if (!consumed) throw new StudentRecoveryError()
        const changed = await User.findOneAndUpdate(
          {
            _id: eligibility.target._id,
            accountStatus: 'active',
            globalRoles: ['student'],
            authVersion: reset.authVersion,
            recoveryRevision: targetRevision,
          },
          { $set: { passwordHash, passwordChangedAt: occurredAt }, $inc: { authVersion: 1 } },
          { session, new: true, runValidators: true },
        ).select('_id')
        if (!changed) throw new StudentRecoveryError()
        await PasswordReset.updateMany(
          {
            userId: eligibility.target._id,
            purpose: 'student-password-reset',
            _id: { $ne: reset._id },
            consumedAt: null,
            revokedAt: null,
          },
          { $set: { revokedAt: occurredAt } },
          { session },
        )
        await database.db
          .collection('auth_sessions')
          .deleteMany({ 'session.userId': eligibility.target._id.toString() }, { session })
        await recordStudentEvent('account.student.password_reset', eligibility, session)
      })
    } catch (error) {
      if (error instanceof StudentRecoveryError) throw error
      throw new StudentRecoveryError('RECOVERY_FAILED', 503)
    } finally {
      parsed.password = undefined
      parsed.token = undefined
    }
  }

  async function issueActivation({ userId, actorId }, { session } = {}) {
    if (!session) throw new TypeError('Activation issuing requires a transaction session.')
    const targetId = activationObjectId(userId)
    const administratorId = activationObjectId(actorId)
    const administrator = await User.exists({
      _id: administratorId,
      accountStatus: 'active',
      globalRoles: 'admin',
    }).session(session)
    if (!administrator) throw new ActivationError('ACTIVATION_UNAVAILABLE', 403)
    const target = await User.findOneAndUpdate(
      { _id: targetId, accountStatus: 'disabled', $or: provisionedRoleFilter },
      { $inc: { authVersion: 1 } },
      { new: true, session, runValidators: true },
    ).select('_id authVersion globalRoles')
    if (!target) throw new ActivationError()
    const occurredAt = new Date(now())
    const expiresAt = new Date(occurredAt.getTime() + activationLifetimeMs)
    const token = randomBytes(32).toString('base64url')
    await PasswordReset.updateMany(
      { userId: targetId, purpose: 'activation', consumedAt: null, revokedAt: null },
      { $set: { revokedAt: occurredAt } },
      { session },
    )
    await PasswordReset.create(
      [
        {
          userId: targetId,
          purpose: 'activation',
          tokenHash: tokenHash(token),
          authVersion: target.authVersion,
          initiatedBy: administratorId,
          activationRole: target.globalRoles[0],
          scopeCohortId: null,
          createdAt: occurredAt,
          expiresAt,
        },
      ],
      { session },
    )
    await writeAudit(
      {
        eventType: target.globalRoles.includes('admin')
          ? 'admin.administrator.activation.issue'
          : 'admin.instructor.activation.issue',
        actorKind: 'user',
        actorId: administratorId,
        targetId,
        scopeCohortId: null,
        outcome: 'success',
        requestId: randomUUID(),
      },
      { session },
    )
    return {
      activationUrl: `${clientOrigin}/activate-account#token=${token}`,
      expiresAt: expiresAt.toISOString(),
    }
  }

  async function activateAccount(input) {
    const parsed = parseActivationInput(input)
    const hash = tokenHash(parsed.token)
    let session
    let cleanupFailed = false
    try {
      await assertTransactionSupport(database)
      const candidate = await PasswordReset.findOne({
        tokenHash: hash,
        purpose: 'activation',
        consumedAt: null,
        revokedAt: null,
        expiresAt: { $gt: new Date(now()) },
      })
        .select('_id')
        .lean()
      if (!candidate) throw new ActivationError()
      const passwordHash = await hashPassword(parsed.password)
      session = await database.startSession()
      await session.withTransaction(
        async () => {
          const occurredAt = new Date(now())
          const reset = await PasswordReset.findOneAndUpdate(
            {
              _id: candidate._id,
              tokenHash: hash,
              purpose: 'activation',
              consumedAt: null,
              revokedAt: null,
              expiresAt: { $gt: occurredAt },
            },
            { $set: { consumedAt: occurredAt } },
            { new: true, session },
          )
          if (!reset) throw new ActivationError()
          const target = await User.findOneAndUpdate(
            {
              _id: reset.userId,
              accountStatus: 'disabled',
              globalRoles: [reset.activationRole ?? 'instructor'],
              authVersion: reset.authVersion,
            },
            {
              $set: { passwordHash, passwordChangedAt: occurredAt, accountStatus: 'active' },
              $inc: { authVersion: 1 },
            },
            { new: true, session, runValidators: true },
          ).select('_id globalRoles')
          if (!target) throw new ActivationError()
          const userId = target._id.toString()
          await PasswordReset.updateMany(
            {
              userId,
              purpose: 'activation',
              _id: { $ne: reset._id },
              consumedAt: null,
              revokedAt: null,
            },
            { $set: { revokedAt: occurredAt } },
            { session },
          )
          await database.db
            .collection('auth_sessions')
            .deleteMany({ 'session.userId': userId }, { session })
          await writeAudit(
            {
              eventType: target.globalRoles.includes('admin')
                ? 'account.administrator.activate'
                : 'account.instructor.activate',
              actorKind: 'user',
              actorId: userId,
              targetId: userId,
              scopeCohortId: null,
              outcome: 'success',
              requestId: randomUUID(),
            },
            { session },
          )
        },
        {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          maxCommitTimeMS: 5000,
          timeoutMS: 10000,
        },
      )
    } catch (error) {
      if (error instanceof ActivationError) throw error
      throw new ActivationError('ACTIVATION_FAILED', 503)
    } finally {
      parsed.password = undefined
      parsed.token = undefined
      try {
        await session?.endSession()
      } catch {
        cleanupFailed = true
      }
    }
    if (cleanupFailed) throw new ActivationError('ACTIVATION_FAILED', 503)
  }

  return Object.freeze({
    issueActivation,
    activateAccount,
    lookupStudent,
    issueInstructorStudentReset,
    issueAdminStudentReset,
    resetStudentPassword,
  })
}
