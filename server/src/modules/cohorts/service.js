import { randomUUID } from 'node:crypto'
import { Types } from 'mongoose'
import { cohortModel } from '../../models/Cohort.js'
import { instructorAssignmentModel } from '../../models/InstructorAssignment.js'
import { institutionModel } from '../../models/Institution.js'
import { membershipModel } from '../../models/Membership.js'
import { userModel } from '../../models/User.js'
import { createAuditService } from '../audit/service.js'
import { assertTransactionSupport } from '../admin/bootstrap.js'
import { createPermissionService } from '../../services/permissions.js'
import { enrollmentCodeModel } from './enrollment-code-model.js'
import {
  CohortError,
  createEnrollmentCode,
  enrollmentCodeExpiry,
  hashEnrollmentCode,
  parseCodeRevisionInput,
  parseDecisionInput,
  parseEnrollmentInput,
  parsePagination,
  parseListQuery,
  parseMemberListQuery,
  parseObjectId,
  parseOnboardingInput,
} from './policy.js'

const transactionOptions = {
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' },
  maxCommitTimeMS: 5000,
  timeoutMS: 10000,
}

function idString(value) {
  return value?.toString?.() ?? null
}

function actorId(actor) {
  return new Types.ObjectId(actor.id)
}

function recoveryRevisionFilter(revision) {
  return revision === 0
    ? { $or: [{ recoveryRevision: 0 }, { recoveryRevision: { $exists: false } }] }
    : { recoveryRevision: revision }
}

async function acquireRecoveryRevision(Model, record, filter, session) {
  const revision = record.recoveryRevision ?? 0
  if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) {
    throw conflict()
  }
  const changed = await Model.updateOne(
    {
      $and: [{ _id: record._id, ...filter }, recoveryRevisionFilter(revision)],
    },
    { $set: { recoveryRevision: revision + 1 } },
    { session, runValidators: true },
  )
  if (!changed.modifiedCount) throw notFound()
}

async function acquireActiveClassGuards(Cohort, Institution, cohort, institution, session) {
  await acquireRecoveryRevision(Institution, institution, { status: 'active' }, session)
  await acquireRecoveryRevision(
    Cohort,
    cohort,
    { status: 'active', institutionId: institution._id },
    session,
  )
}

async function loadParents(database, cohortIds) {
  if (!cohortIds.length) return { cohorts: new Map(), institutions: new Map() }

  const Cohort = cohortModel(database)
  const Institution = institutionModel(database)
  const cohorts = await Cohort.find({ _id: { $in: cohortIds } })
    .select('_id name institutionId status')
    .lean()
  const institutionIds = [
    ...new Set(cohorts.map(({ institutionId }) => idString(institutionId)).filter(Boolean)),
  ]
  const institutions = institutionIds.length
    ? await Institution.find({ _id: { $in: institutionIds } })
        .select('_id name status')
        .lean()
    : []

  return {
    cohorts: new Map(cohorts.map((cohort) => [idString(cohort._id), cohort])),
    institutions: new Map(
      institutions.map((institution) => [idString(institution._id), institution]),
    ),
  }
}

function notFound() {
  return new CohortError('COHORT_NOT_FOUND', 'This class is unavailable.', 404)
}

function conflict(code = 'COHORT_CONFLICT', message = 'Refresh and try again.') {
  return new CohortError(code, message, 409)
}

function unavailable() {
  return new CohortError(
    'COHORT_UNAVAILABLE',
    'This change could not be completed. Try again later.',
    503,
  )
}

function alreadyInClass(staffFacing = false) {
  return conflict(
    'COHORT_ALREADY_IN_CLASS',
    staffFacing
      ? 'This student is already in another class.'
      : "You're already in a class. Leave it before joining another.",
  )
}

function assertEmptyQuery(query) {
  if (
    !query ||
    typeof query !== 'object' ||
    Array.isArray(query) ||
    Reflect.ownKeys(query).length
  ) {
    throw new CohortError('VALIDATION_ERROR', 'Check the request fields and try again.')
  }
}

function relationshipDto(relationship, cohorts, institutions) {
  const cohortId = idString(relationship.cohortId)
  const cohort = cohorts.get(cohortId)
  const institution = cohort ? institutions.get(idString(cohort.institutionId)) : null
  return {
    id: idString(relationship._id),
    cohortId,
    cohortName: cohort?.name ?? null,
    institutionName: institution?.name ?? null,
    status: relationship.status,
    cohortStatus: cohort?.status ?? 'unavailable',
    institutionStatus: institution?.status ?? 'unavailable',
  }
}

function codeDto(code) {
  if (!code) return null
  return {
    id: idString(code._id),
    expiresAt: code.expiresAt.toISOString(),
    revokedAt: code.revokedAt ? code.revokedAt.toISOString() : null,
    revision: code.revision ?? 0,
  }
}

export function createCohortService(
  database,
  { now = Date.now, clientOrigin = 'http://localhost:5173', recordAuditEvent } = {},
) {
  const User = userModel(database)
  const Cohort = cohortModel(database)
  const Institution = institutionModel(database)
  const Membership = membershipModel(database)
  const InstructorAssignment = instructorAssignmentModel(database)
  const EnrollmentCode = enrollmentCodeModel(database)
  const permissions = createPermissionService(database)
  const auditWriter = recordAuditEvent || createAuditService(database, { now }).recordAuditEvent

  async function withTransaction(work) {
    try {
      await assertTransactionSupport(database)
    } catch {
      throw unavailable()
    }
    let session
    let result
    try {
      session = await database.startSession()
      result = await session.withTransaction(() => work(session), transactionOptions)
    } catch (error) {
      if (error instanceof CohortError) throw error
      if (error?.code === 11000 || error?.code === 112 || error?.codeName === 'WriteConflict') {
        throw conflict()
      }
      throw unavailable()
    } finally {
      await session?.endSession().catch(() => {})
    }
    return result
  }

  async function assertNoOtherClass(userId, cohortId, session, staffFacing = false) {
    const other = await Membership.exists({
      userId,
      cohortId: { $ne: cohortId },
      status: { $in: ['active', 'pending'] },
    }).session(session)
    if (other) throw alreadyInClass(staffFacing)
  }

  async function currentActor(actor, session) {
    let id
    try {
      id = parseObjectId(actor?.id)
    } catch {
      throw new CohortError('AUTHENTICATION_REQUIRED', 'Sign in to continue.', 401)
    }
    let query = User.findOne({ _id: id, accountStatus: 'active' }).select(
      '_id globalRoles classOnboardingCompletedAt',
    )
    if (session) query = query.session(session)
    const user = await query.lean()
    if (!user) throw new CohortError('AUTHENTICATION_REQUIRED', 'Sign in to continue.', 401)
    return user
  }

  async function assertManagedCohort(actor, cohortId, session) {
    const current = await currentActor(actor, session)
    const cohort = await Cohort.findOne({ _id: cohortId, status: 'active' })
      .select('_id institutionId +recoveryRevision')
      .session(session)
      .lean()
    if (!cohort) throw notFound()
    const institution = await Institution.findOne({ _id: cohort.institutionId, status: 'active' })
      .session(session)
      .select('_id recoveryRevision')
      .lean()
    if (!institution) throw notFound()
    await acquireActiveClassGuards(Cohort, Institution, cohort, institution, session)
    if (current.globalRoles.includes('admin')) return { current, cohort }
    if (!current.globalRoles.includes('instructor')) throw notFound()
    const assignment = await InstructorAssignment.exists({
      userId: current._id,
      cohortId,
      status: 'active',
    }).session(session)
    if (!assignment) throw notFound()
    return { current, cohort }
  }

  async function record(actorId, eventType, targetId, scopeCohortId, session) {
    await auditWriter(
      {
        eventType,
        actorKind: 'user',
        actorId: idString(actorId),
        targetId: idString(targetId),
        scopeCohortId: idString(scopeCohortId),
        outcome: 'success',
        requestId: randomUUID(),
      },
      { session },
    )
  }

  async function listMemberships(actor, pagination = {}) {
    const current = await permissions.resolveActor(actor)
    const user = actorId(current)
    const { page, limit, skip } = parsePagination(pagination)
    const filter = { userId: user }
    const [memberships, total] = await Promise.all([
      Membership.find(filter).sort({ _id: 1 }).skip(skip).limit(limit).lean(),
      Membership.countDocuments(filter),
    ])
    const cohortIds = [
      ...new Set(memberships.map(({ cohortId }) => idString(cohortId)).filter(Boolean)),
    ]
    const parents = await loadParents(database, cohortIds)
    return {
      memberships: memberships.map((membership) => ({
        ...relationshipDto(membership, parents.cohorts, parents.institutions),
        decision: membership.decision ?? null,
      })),
      page,
      total,
    }
  }

  async function listTeachingAssignments(actor, pagination = {}) {
    const current = await permissions.resolveActor(actor)
    const { page, limit, skip } = parsePagination(pagination)
    if (!current.globalRoles.includes('instructor') && !current.globalRoles.includes('admin')) {
      return { assignments: [], page, total: 0 }
    }
    const filter = { userId: actorId(current), status: 'active' }
    const [assignments, total] = await Promise.all([
      InstructorAssignment.find(filter).sort({ _id: 1 }).skip(skip).limit(limit).lean(),
      InstructorAssignment.countDocuments(filter),
    ])
    const cohortIds = [
      ...new Set(assignments.map(({ cohortId }) => idString(cohortId)).filter(Boolean)),
    ]
    const parents = await loadParents(database, cohortIds)
    return {
      assignments: assignments.map((assignment) =>
        relationshipDto(assignment, parents.cohorts, parents.institutions),
      ),
      page,
      total,
    }
  }

  async function getEnrollment(actor, query = {}) {
    assertEmptyQuery(query)
    const current = await currentActor(actor)
    return {
      onboardingCompleted:
        !current.globalRoles.includes('student') || Boolean(current.classOnboardingCompletedAt),
    }
  }

  async function completeOnboarding(actor, input, query = {}) {
    assertEmptyQuery(query)
    parseOnboardingInput(input)
    return withTransaction(async (session) => {
      const current = await currentActor(actor, session)
      if (!current.globalRoles.includes('student')) return { completed: true }
      if (!current.classOnboardingCompletedAt) {
        const occurredAt = new Date(now())
        await User.updateOne(
          {
            _id: current._id,
            accountStatus: 'active',
            globalRoles: 'student',
            classOnboardingCompletedAt: null,
          },
          { $set: { classOnboardingCompletedAt: occurredAt } },
          { session },
        )
        await record(current._id, 'cohort.onboarding.complete', current._id, null, session)
      }
      return { completed: true }
    })
  }

  async function join(actor, input, { invitationHash = null, query = {} } = {}) {
    assertEmptyQuery(query)
    const parsed = parseEnrollmentInput(input, { invitationHash })
    await permissions.resolveActor(actor)
    return withTransaction(async (session) => {
      const current = await currentActor(actor, session)
      if (!current.globalRoles.includes('student'))
        throw new CohortError('COHORT_FORBIDDEN', 'This action is unavailable.', 403)
      const timestamp = new Date(now())
      const code = await EnrollmentCode.findOne({
        codeHash: parsed.codeHash,
        revokedAt: null,
        expiresAt: { $gt: timestamp },
      }).session(session)
      if (!code)
        throw new CohortError('COHORT_CODE_UNAVAILABLE', 'This class code is unavailable.', 404)
      const cohort = await Cohort.findOne({ _id: code.cohortId, status: 'active' })
        .select('_id institutionId name +recoveryRevision')
        .session(session)
        .lean()
      const institution =
        cohort &&
          (await Institution.findOne({ _id: cohort.institutionId, status: 'active' })
            .select('_id name +recoveryRevision')
          .session(session)
          .lean())
      if (!cohort || !institution)
        throw new CohortError('COHORT_CODE_UNAVAILABLE', 'This class code is unavailable.', 404)
      await acquireActiveClassGuards(Cohort, Institution, cohort, institution, session)
      await assertNoOtherClass(current._id, cohort._id, session)
      const claimed = await EnrollmentCode.updateOne(
        {
          _id: code._id,
          revision: code.revision ?? 0,
          revokedAt: null,
          expiresAt: { $gt: timestamp },
          useCount: { $lt: Number.MAX_SAFE_INTEGER },
        },
        { $inc: { useCount: 1 } },
        { session },
      )
      if (!claimed.modifiedCount)
        throw new CohortError('COHORT_CODE_UNAVAILABLE', 'This class code is unavailable.', 404)
      const existing = await Membership.findOne({
        userId: current._id,
        cohortId: cohort._id,
      }).session(session)
      let membership
      let requested = false
      if (existing && existing.status !== 'removed') {
        membership = existing
      } else if (existing) {
        requested = true
        existing.status = 'pending'
        existing.decision = null
        existing.requestedAt = timestamp
        existing.approvedAt = null
        existing.approvedBy = null
        existing.removedAt = null
        existing.removedBy = null
        existing.revision = (existing.revision ?? 0) + 1
        membership = await existing.save({ session })
      } else {
        requested = true
        ;[membership] = await Membership.create(
          [
            {
              userId: current._id,
              cohortId: cohort._id,
              status: 'pending',
              requestedAt: timestamp,
            },
          ],
          { session },
        )
      }
      if (requested) {
        await record(current._id, 'cohort.membership.request', membership._id, cohort._id, session)
      }
      if (!current.classOnboardingCompletedAt) {
        await User.updateOne(
          { _id: current._id, classOnboardingCompletedAt: null },
          { $set: { classOnboardingCompletedAt: timestamp } },
          { session },
        )
        await record(current._id, 'cohort.onboarding.complete', current._id, null, session)
      }
      const row = membership.toObject ? membership.toObject() : membership
      return {
        membership: {
          id: idString(row._id),
          cohortId: idString(row.cohortId),
          cohortName: cohort.name,
          institutionName: institution.name,
          status: row.status,
          cohortStatus: cohort.status,
          institutionStatus: institution.status,
        },
      }
    })
  }

  async function listManaged(actor, query = {}) {
    const current = await permissions.resolveActor(actor)
    if (!current.globalRoles.includes('instructor') && !current.globalRoles.includes('admin'))
      throw new CohortError('CAPABILITY_FORBIDDEN', 'This action is unavailable.', 403)
    const { page, limit } = parseListQuery(query)
    const result = await permissions.listEligibleCohorts(actor, { page, limit })
    return {
      cohorts: result.cohorts.map(({ cohortId, cohortName, institutionName }) => ({
        cohortId,
        cohortName,
        institutionName,
      })),
      page: result.page,
      total: result.total,
    }
  }

  async function listMembers(actor, cohortId, query = {}) {
    const parsedId = parseObjectId(cohortId)
    await permissions.requireCapability(actor, 'cohort:teach', { cohortId: parsedId })
    const { page, limit, skip, status } = parseMemberListQuery(query)
    const [result] = await Membership.aggregate([
      { $match: { cohortId: new Types.ObjectId(parsedId), status } },
      {
        $lookup: {
          from: 'cohorts',
          localField: 'cohortId',
          foreignField: '_id',
          pipeline: [{ $match: { status: 'active' } }, { $project: { institutionId: 1 } }],
          as: 'cohort',
        },
      },
      { $unwind: '$cohort' },
      {
        $lookup: {
          from: 'institutions',
          localField: 'cohort.institutionId',
          foreignField: '_id',
          pipeline: [{ $match: { status: 'active' } }, { $project: { _id: 1 } }],
          as: 'institution',
        },
      },
      { $unwind: '$institution' },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      { $match: { 'user.accountStatus': 'active', 'user.globalRoles': 'student' } },
      {
        $facet: {
          rows: [
            { $sort: { requestedAt: 1, _id: 1 } },
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                _id: 1,
                'user._id': 1,
                status: 1,
                decision: 1,
                revision: 1,
                requestedAt: 1,
                'user.username': 1,
                'user.emailNormalized': 1,
                'user.avatarId': 1,
              },
            },
          ],
          count: [{ $count: 'total' }],
        },
      },
    ])
    return {
      memberships: result.rows.map((row) => ({
        id: idString(row._id),
        studentId: idString(row.user._id),
        username: row.user.username,
        email: row.user.emailNormalized,
        avatarId: row.user.avatarId,
        status: row.status,
        decision: row.decision ?? null,
        revision: row.revision ?? 0,
        requestedAt: row.requestedAt.toISOString(),
      })),
      page,
      total: result.count[0]?.total ?? 0,
    }
  }

  async function decide(actor, cohortId, membershipId, input, query = {}) {
    assertEmptyQuery(query)
    const parsedCohortId = parseObjectId(cohortId)
    const parsedMembershipId = parseObjectId(membershipId)
    const parsed = parseDecisionInput(input)
    await permissions.requireCapability(actor, 'cohort:teach', { cohortId: parsedCohortId })
    return withTransaction(async (session) => {
      const { current } = await assertManagedCohort(actor, parsedCohortId, session)
      const membership = await Membership.findOne({
        _id: parsedMembershipId,
        cohortId: parsedCohortId,
      }).session(session)
      if (!membership) throw notFound()
      const revision = membership.revision ?? 0
      if (revision !== parsed.expectedRevision)
        throw conflict('COHORT_STALE_REQUEST', 'Refresh the membership request before deciding.')
      if (parsed.status === 'active') {
        const eligibleStudent = await User.exists({
          _id: membership.userId,
          accountStatus: 'active',
          globalRoles: 'student',
        }).session(session)
        if (!eligibleStudent) throw notFound()
        if (membership.status === 'pending')
          await assertNoOtherClass(membership.userId, parsedCohortId, session, true)
      }
      let decision
      if (membership.status === 'pending' && parsed.status === 'active') decision = 'approved'
      else if (membership.status === 'pending' && parsed.status === 'removed') decision = 'declined'
      else if (membership.status === 'active' && parsed.status === 'removed') decision = 'removed'
      else throw conflict()
      const nextRevision = revision + 1
      const filter = { _id: membership._id, cohortId: parsedCohortId, status: membership.status }
      if (revision === 0) filter.$or = [{ revision: 0 }, { revision: { $exists: false } }]
      else filter.revision = revision
      const timestamp = new Date(now())
      const update = {
        $set: {
          status: parsed.status,
          decision,
          revision: nextRevision,
          ...(decision === 'approved' ? { approvedAt: timestamp, approvedBy: current._id } : {}),
          ...(parsed.status === 'removed' ? { removedAt: timestamp, removedBy: current._id } : {}),
        },
      }
      if (decision === 'approved') update.$unset = { removedAt: 1, removedBy: 1 }
      const changed = await Membership.findOneAndUpdate(filter, update, {
        new: true,
        session,
        runValidators: true,
      }).lean()
      if (!changed)
        throw conflict('COHORT_STALE_REQUEST', 'Refresh the membership request before deciding.')
      const eventByDecision = {
        approved: 'cohort.membership.approve',
        declined: 'cohort.membership.decline',
        removed: 'cohort.membership.remove',
      }
      const event = eventByDecision[decision]
      await record(current._id, event, changed._id, parsedCohortId, session)
      return {
        membership: {
          id: idString(changed._id),
          status: changed.status,
          decision: changed.decision ?? null,
          revision: changed.revision ?? 0,
        },
      }
    })
  }

  async function getCode(actor, cohortId, query = {}) {
    assertEmptyQuery(query)
    const parsedCohortId = parseObjectId(cohortId)
    await permissions.requireCapability(actor, 'cohort:teach', { cohortId: parsedCohortId })
    const code = await EnrollmentCode.findOne({ cohortId: parsedCohortId })
      .select('_id expiresAt revokedAt revision')
      .lean()
    const revision = code?.revision ?? 0
    return { code: codeDto(code), revision }
  }

  async function issueCode(actor, cohortId, input, query = {}) {
    assertEmptyQuery(query)
    const parsedCohortId = parseObjectId(cohortId)
    const parsed = parseCodeRevisionInput(input)
    await permissions.requireCapability(actor, 'cohort:teach', { cohortId: parsedCohortId })
    const raw = createEnrollmentCode()
    const expiresAt = enrollmentCodeExpiry(now)
    const result = await withTransaction(async (session) => {
      const { current } = await assertManagedCohort(actor, parsedCohortId, session)
      const existing = await EnrollmentCode.findOne({ cohortId: parsedCohortId }).session(session)
      const revision = existing?.revision ?? 0
      if (revision !== parsed.expectedRevision)
        throw conflict('COHORT_STALE_CODE', 'Refresh the class code before replacing it.')
      let code
      if (existing) {
        const filter = { _id: existing._id }
        if (revision === 0) filter.$or = [{ revision: 0 }, { revision: { $exists: false } }]
        else filter.revision = revision
        code = await EnrollmentCode.findOneAndUpdate(
          filter,
          {
            $set: {
              codeHash: hashEnrollmentCode(raw.code),
              expiresAt,
              revokedAt: null,
              createdBy: current._id,
              useCount: 0,
              revision: revision + 1,
            },
          },
          { new: true, session, runValidators: true },
        ).lean()
        if (!code)
          throw conflict('COHORT_STALE_CODE', 'Refresh the class code before replacing it.')
      } else {
        try {
          ;[code] = await EnrollmentCode.create(
            [
              {
                cohortId: parsedCohortId,
                codeHash: hashEnrollmentCode(raw.code),
                expiresAt,
                revokedAt: null,
                createdBy: current._id,
                revision: 1,
                useCount: 0,
              },
            ],
            { session },
          )
          code = code.toObject()
        } catch (error) {
          if (error?.code === 11000)
            throw conflict('COHORT_STALE_CODE', 'Refresh the class code before replacing it.')
          throw error
        }
      }
      await record(current._id, 'cohort.code.issue', code._id, parsedCohortId, session)
      return code
    })
    const metadata = codeDto(result)
    const invitationUrl = new URL('/join-class', clientOrigin)
    invitationUrl.hash = `code=${encodeURIComponent(raw.formatted)}`
    return {
      code: metadata,
      revision: metadata.revision,
      rawCode: raw.formatted,
      invitationUrl: invitationUrl.toString(),
    }
  }

  async function revokeCode(actor, cohortId, codeId, input, query = {}) {
    assertEmptyQuery(query)
    const parsedCohortId = parseObjectId(cohortId)
    const parsedCodeId = parseObjectId(codeId)
    const parsed = parseCodeRevisionInput(input)
    await permissions.requireCapability(actor, 'cohort:teach', { cohortId: parsedCohortId })
    return withTransaction(async (session) => {
      const { current } = await assertManagedCohort(actor, parsedCohortId, session)
      const code = await EnrollmentCode.findOne({
        _id: parsedCodeId,
        cohortId: parsedCohortId,
      }).session(session)
      if (!code) throw notFound()
      const revision = code.revision ?? 0
      if (revision !== parsed.expectedRevision)
        throw conflict('COHORT_STALE_CODE', 'Refresh the class code before revoking it.')
      const timestamp = new Date(now())
      const filter = { _id: code._id, cohortId: parsedCohortId, revokedAt: null }
      if (revision === 0) filter.$or = [{ revision: 0 }, { revision: { $exists: false } }]
      else filter.revision = revision
      const changed = await EnrollmentCode.findOneAndUpdate(
        filter,
        {
          $set: { revokedAt: timestamp, revision: revision + 1 },
        },
        { new: true, session, runValidators: true },
      ).lean()
      if (!changed)
        throw conflict('COHORT_STALE_CODE', 'Refresh the class code before revoking it.')
      await record(current._id, 'cohort.code.revoke', changed._id, parsedCohortId, session)
      return { code: codeDto(changed), revision: changed.revision }
    })
  }

  return Object.freeze({
    listMemberships,
    listTeachingAssignments,
    getEnrollment,
    completeOnboarding,
    join,
    listManaged,
    listMembers,
    decide,
    getCode,
    issueCode,
    revokeCode,
  })
}
