import { randomBytes, randomUUID } from 'node:crypto'
import { Types } from 'mongoose'
import { cohortModel } from '../../models/Cohort.js'
import { instructorAssignmentModel } from '../../models/InstructorAssignment.js'
import { institutionModel } from '../../models/Institution.js'
import { userModel } from '../../models/User.js'
import { createAuditService } from '../audit/service.js'
import { hashPassword } from '../auth/password.js'
import { assertTransactionSupport } from './bootstrap.js'
import { enrollmentCodeModel } from '../cohorts/enrollment-code-model.js'
import { passwordResetModel } from '../recovery/model.js'
import {
  AdminError,
  parseAdminListQuery,
  parseAdminObjectId,
  assertEmptyAdminQuery,
  assertEmptyAdminBody,
  parseAssignmentsInput,
  parseAccountStatusInput,
  parseCohortInput,
  parseCohortUpdateInput,
  parseInstitutionInput,
  parseInstitutionUpdateInput,
  parseInstructorInput,
} from './policy.js'
import { createPermissionService } from '../../services/permissions.js'

const transactionOptions = {
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' },
  maxCommitTimeMS: 5000,
  timeoutMS: 10000,
}

function objectId(value) {
  return new Types.ObjectId(value)
}

function idString(value) {
  return value?.toString?.() ?? null
}

function revisionFilter(field, revision) {
  return revision === 0
    ? { $or: [{ [field]: 0 }, { [field]: { $exists: false } }] }
    : { [field]: revision }
}

function revisionConditions(...conditions) {
  return { $and: conditions }
}

function nextRevision(value) {
  const revision = value ?? 0
  if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) {
    throw new AdminError('ADMIN_CONFLICT')
  }
  return revision + 1
}

async function touchRecoveryGuard(Model, record, filter, session) {
  const revision = record.recoveryRevision ?? 0
  const changed = await Model.updateOne(
    revisionConditions(
      { _id: record._id, ...filter },
      revisionFilter('recoveryRevision', revision),
    ),
    { $set: { recoveryRevision: nextRevision(revision) } },
    { session },
  )
  if (!changed.modifiedCount) throw new AdminError('ADMIN_CONFLICT')
}

function institutionDto(institution) {
  return {
    id: idString(institution._id),
    name: institution.name,
    slug: institution.slug,
    status: institution.status,
    revision: institution.adminRevision ?? 0,
  }
}

function cohortDto(cohort, institutions) {
  return {
    id: idString(cohort._id),
    institutionId: idString(cohort.institutionId),
    institutionName: institutions.get(idString(cohort.institutionId))?.name ?? null,
    institutionStatus: institutions.get(idString(cohort.institutionId))?.status ?? null,
    name: cohort.name,
    term: cohort.term,
    status: cohort.status,
    revision: cohort.adminRevision ?? 0,
  }
}

function instructorDto(instructor, cohortIds = [], assignedCohorts = []) {
  return {
    id: idString(instructor._id),
    email: instructor.emailNormalized,
    username: instructor.username,
    avatarId: instructor.avatarId,
    accountStatus: instructor.accountStatus,
    assignmentRevision: instructor.instructorAssignmentRevision ?? 0,
    cohortIds: cohortIds.map(idString),
    assignedCohorts,
  }
}

function duplicateConflict(error) {
  return error?.code === 11000
}

export function createAdminService(
  database,
  {
    now = Date.now,
    clientOrigin = 'http://localhost:5173',
    recordAuditEvent,
    activationService: providedActivationService,
  } = {},
) {
  const User = userModel(database)
  const Institution = institutionModel(database)
  const Cohort = cohortModel(database)
  const InstructorAssignment = instructorAssignmentModel(database)
  const EnrollmentCode = enrollmentCodeModel(database)
  const PasswordReset = passwordResetModel(database)
  const permissions = createPermissionService(database)
  const auditWriter = recordAuditEvent || createAuditService(database, { now }).recordAuditEvent
  let activationService = providedActivationService

  async function requireAdmin(actor, capability) {
    return permissions.requireCapability(actor, capability)
  }

  async function assertTransactionAdministrator(actor, session) {
    const activeAdministrator = await User.exists({
      _id: objectId(actor.id),
      accountStatus: 'active',
      globalRoles: 'admin',
    }).session(session)
    if (!activeAdministrator) throw new AdminError('ADMIN_FORBIDDEN')
  }

  async function recordAdminEvent(actor, eventType, targetId, session) {
    await auditWriter(
      {
        eventType,
        actorKind: 'user',
        actorId: actor.id,
        targetId: idString(targetId),
        scopeCohortId: null,
        outcome: 'success',
        requestId: randomUUID(),
      },
      { session },
    )
  }

  async function issueActivation(input, { session }) {
    if (!activationService) {
      const { createRecoveryService } = await import('../recovery/service.js')
      activationService = createRecoveryService(database, {
        now,
        clientOrigin,
        recordAuditEvent: auditWriter,
      })
    }
    return activationService.issueActivation(input, { session })
  }

  async function withTransaction(work, prepare) {
    let session
    let result
    let preparation
    let cleanupFailed = false
    try {
      await assertTransactionSupport(database)
    } catch {
      throw new AdminError('ADMIN_UNAVAILABLE')
    }
    try {
      preparation = await prepare?.()
      session = await database.startSession()
      result = await session.withTransaction(() => work(session, preparation), transactionOptions)
    } catch (error) {
      if (error instanceof AdminError) throw error
      if (duplicateConflict(error)) throw new AdminError('ADMIN_CONFLICT')
      throw new AdminError('ADMIN_UNAVAILABLE')
    } finally {
      try {
        await session?.endSession()
      } catch {
        cleanupFailed = true
      }
    }
    if (cleanupFailed) throw new AdminError('ADMIN_UNAVAILABLE')
    return result
  }

  async function listInstitutions(actor, query) {
    await requireAdmin(actor, 'admin:classes:manage')
    const { page, limit } = parseAdminListQuery(query)
    const skip = (page - 1) * limit
    const [institutions, total] = await Promise.all([
      Institution.find({}).sort({ _id: 1 }).skip(skip).limit(limit).lean(),
      Institution.countDocuments({}),
    ])
    return { institutions: institutions.map(institutionDto), page, total }
  }

  function accountDto(account) {
    return {
      id: idString(account._id),
      username: account.username,
      avatarId: account.avatarId,
      globalRoles: [...account.globalRoles],
      accountStatus: account.accountStatus,
      revision: account.authVersion ?? 0,
    }
  }

  async function listUsers(actor, query) {
    await requireAdmin(actor, 'admin:accounts:manage')
    const { page, limit, role, accountStatus } = parseAdminListQuery(query, { users: true })
    const filter = {
      ...(role
        ? { globalRoles: [role] }
        : { $or: [{ globalRoles: ['student'] }, { globalRoles: ['instructor'] }] }),
      ...(accountStatus ? { accountStatus } : {}),
    }
    const skip = (page - 1) * limit
    const [users, total] = await Promise.all([
      User.find(filter)
        .select('_id username avatarId globalRoles accountStatus authVersion')
        .sort({ _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ])
    return { users: users.map(accountDto), page, total }
  }

  async function updateUserStatus(actor, userId, input, query = {}) {
    const currentActor = await requireAdmin(actor, 'admin:accounts:manage')
    assertEmptyAdminQuery(query)
    const targetId = objectId(parseAdminObjectId(userId, 'userId'))
    const parsed = parseAccountStatusInput(input)
    if (currentActor.id === idString(targetId)) throw new AdminError('ADMIN_FORBIDDEN')
    return withTransaction(async (session) => {
      await assertTransactionAdministrator(currentActor, session)
      const target = await User.findById(targetId)
        .select('_id username avatarId globalRoles accountStatus authVersion +recoveryRevision')
        .session(session)
        .lean()
      if (!target || !['student', 'instructor'].some((role) =>
        target.globalRoles.length === 1 && target.globalRoles[0] === role,
      )) {
        throw new AdminError('ADMIN_NOT_FOUND')
      }
      const currentAuthVersion = target.authVersion ?? 0
      if (currentAuthVersion !== parsed.expectedRevision) {
        throw new AdminError('ADMIN_STALE_ACCOUNT')
      }
      if (target.globalRoles[0] === 'instructor' &&
        target.accountStatus === 'disabled' && parsed.accountStatus === 'active') {
        throw new AdminError('ADMIN_INSTRUCTOR_ACTIVATION_REQUIRED')
      }
      if (target.accountStatus === parsed.accountStatus) throw new AdminError('ADMIN_CONFLICT')

      const currentRecoveryRevision = target.recoveryRevision ?? 0
      const updated = await User.findOneAndUpdate(
        revisionConditions(
          {
            _id: targetId,
            globalRoles: target.globalRoles,
            accountStatus: target.accountStatus,
          },
          revisionFilter('authVersion', currentAuthVersion),
          revisionFilter('recoveryRevision', currentRecoveryRevision),
        ),
        {
          $set: { accountStatus: parsed.accountStatus },
          $inc: { authVersion: 1, recoveryRevision: 1 },
        },
        { session, new: true, runValidators: true },
      )
        .select('_id username avatarId globalRoles accountStatus authVersion')
        .lean()
      if (!updated) throw new AdminError('ADMIN_STALE_ACCOUNT')

      const occurredAt = new Date(now())
      if (!Number.isFinite(occurredAt.getTime())) throw new AdminError('ADMIN_UNAVAILABLE')
      await PasswordReset.updateMany(
        { userId: targetId, consumedAt: null, revokedAt: null },
        { $set: { revokedAt: occurredAt } },
        { session },
      )
      await database.db.collection('auth_sessions').deleteMany(
        { 'session.userId': idString(targetId) },
        { session },
      )
      await recordAdminEvent(
        currentActor,
        parsed.accountStatus === 'disabled' ? 'admin.user.disable' : 'admin.user.enable',
        targetId,
        session,
      )
      return { user: accountDto(updated) }
    })
  }

  async function createInstitution(actor, input, query = {}) {
    const currentActor = await requireAdmin(actor, 'admin:classes:manage')
    assertEmptyAdminQuery(query)
    const parsed = parseInstitutionInput(input)
    return withTransaction(async (session) => {
      await assertTransactionAdministrator(currentActor, session)
      const [institution] = await Institution.create([{ ...parsed, status: 'active' }], { session })
      await recordAdminEvent(currentActor, 'admin.institution.create', institution._id, session)
      return institutionDto(institution.toObject())
    })
  }

  async function listCohorts(actor, query) {
    await requireAdmin(actor, 'admin:classes:manage')
    const { page, limit, institutionId } = parseAdminListQuery(query, { institution: true })
    const filter = institutionId ? { institutionId: objectId(institutionId) } : {}
    const skip = (page - 1) * limit
    const [cohorts, total] = await Promise.all([
      Cohort.find(filter).sort({ _id: 1 }).skip(skip).limit(limit).lean(),
      Cohort.countDocuments(filter),
    ])
    const institutionIds = [...new Set(cohorts.map(({ institutionId: id }) => idString(id)))]
    const institutions = institutionIds.length
      ? await Institution.find({ _id: { $in: institutionIds } })
          .select('_id name status')
          .lean()
      : []
    const institutionById = new Map(
      institutions.map((institution) => [idString(institution._id), institution]),
    )
    return { cohorts: cohorts.map((cohort) => cohortDto(cohort, institutionById)), page, total }
  }

  async function createCohort(actor, input, query = {}) {
    const currentActor = await requireAdmin(actor, 'admin:classes:manage')
    assertEmptyAdminQuery(query)
    const parsed = parseCohortInput(input)
    return withTransaction(async (session) => {
      await assertTransactionAdministrator(currentActor, session)
      const institutionId = objectId(parsed.institutionId)
      const institution = await Institution.findOne({ _id: institutionId, status: 'active' })
        .select('_id name slug status adminRevision +recoveryRevision')
        .session(session)
        .lean()
      if (!institution) throw new AdminError('ADMIN_NOT_FOUND')
      await touchRecoveryGuard(Institution, institution, { status: 'active' }, session)
      const [cohort] = await Cohort.create(
        [
          {
            institutionId,
            name: parsed.name,
            term: parsed.term,
            status: 'active',
          },
        ],
        { session },
      )
      await recordAdminEvent(currentActor, 'admin.cohort.create', cohort._id, session)
      return cohortDto(cohort.toObject(), new Map([[idString(institution._id), institution]]))
    })
  }

  async function updateInstitution(actor, institutionId, input, query = {}) {
    const currentActor = await requireAdmin(actor, 'admin:classes:manage')
    assertEmptyAdminQuery(query)
    const id = parseAdminObjectId(institutionId)
    const parsed = parseInstitutionUpdateInput(input)
    return withTransaction(async (session) => {
      await assertTransactionAdministrator(currentActor, session)
      const current = await Institution.findOne({ _id: objectId(id) })
        .select('_id name slug status adminRevision +recoveryRevision')
        .session(session)
        .lean()
      if (!current) throw new AdminError('ADMIN_NOT_FOUND')
      const revision = current.adminRevision ?? 0
      if (revision !== parsed.expectedRevision) throw new AdminError('ADMIN_STALE_INSTITUTION')
      const name = parsed.name ?? current.name
      const status = parsed.status ?? current.status
      if (current.name === name && current.status === status)
        throw new AdminError('ADMIN_CONFLICT')
      if (current.status !== status && status === 'inactive') {
        const activeCohort = await Cohort.exists({ institutionId: current._id, status: 'active' })
          .session(session)
        if (activeCohort) throw new AdminError('ADMIN_CONFLICT')
      }
      const changesStatus = current.status !== status
      const nextAdminRevision = nextRevision(revision)
      const expectedRecoveryRevision = current.recoveryRevision ?? 0
      const filter = revisionConditions(
        { _id: current._id, status: current.status },
        revisionFilter('adminRevision', revision),
        ...(changesStatus
          ? [revisionFilter('recoveryRevision', expectedRecoveryRevision)]
          : []),
      )
      const update = {
        $set: {
          name,
          status,
          adminRevision: nextAdminRevision,
          ...(changesStatus
            ? { recoveryRevision: nextRevision(expectedRecoveryRevision) }
            : {}),
        },
      }
      const changed = await Institution.findOneAndUpdate(filter, update, {
        new: true,
        session,
        runValidators: true,
      }).lean()
      if (!changed) throw new AdminError('ADMIN_STALE_INSTITUTION')
      await recordAdminEvent(currentActor, 'admin.institution.update', changed._id, session)
      return { institution: institutionDto(changed) }
    })
  }

  async function updateCohort(actor, cohortId, input, query = {}) {
    const currentActor = await requireAdmin(actor, 'admin:classes:manage')
    assertEmptyAdminQuery(query)
    const id = parseAdminObjectId(cohortId)
    const parsed = parseCohortUpdateInput(input)
    return withTransaction(async (session) => {
      await assertTransactionAdministrator(currentActor, session)
      const current = await Cohort.findOne({ _id: objectId(id) })
        .select('_id institutionId name term status adminRevision +recoveryRevision')
        .session(session)
        .lean()
      if (!current) throw new AdminError('ADMIN_NOT_FOUND')
      const revision = current.adminRevision ?? 0
      if (revision !== parsed.expectedRevision) throw new AdminError('ADMIN_STALE_COHORT')
      const name = parsed.name ?? current.name
      const term = parsed.term ?? current.term
      const status = parsed.status ?? current.status
      if (
        current.name === name &&
        current.term === term &&
        current.status === status
      )
        throw new AdminError('ADMIN_CONFLICT')
      const changesStatus = current.status !== status
      const institutionId = current.institutionId
      const parent = await Institution.findById(institutionId)
        .select('_id status +recoveryRevision')
        .session(session)
        .lean()
      if (!parent) throw new AdminError('ADMIN_NOT_FOUND')
      if (changesStatus && status === 'active' && parent.status !== 'active') {
        throw new AdminError('ADMIN_NOT_FOUND')
      }
      if (changesStatus && parent.status === 'active') {
        const parentGuard = await Institution.updateOne(
          revisionConditions(
            { _id: institutionId, status: 'active' },
            revisionFilter('recoveryRevision', parent.recoveryRevision ?? 0),
          ),
          { $set: { recoveryRevision: nextRevision(parent.recoveryRevision) } },
          { session },
        )
        if (!parentGuard.modifiedCount) throw new AdminError('ADMIN_CONFLICT')
      }

      const nextAdminRevision = nextRevision(revision)
      const expectedRecoveryRevision = current.recoveryRevision ?? 0
      const filter = revisionConditions(
        { _id: current._id, institutionId, status: current.status },
        revisionFilter('adminRevision', revision),
        ...(changesStatus
          ? [revisionFilter('recoveryRevision', expectedRecoveryRevision)]
          : []),
      )
      const update = {
        $set: {
          name,
          term,
          status,
          adminRevision: nextAdminRevision,
          ...(changesStatus
            ? { recoveryRevision: nextRevision(expectedRecoveryRevision) }
            : {}),
        },
      }
      const changed = await Cohort.findOneAndUpdate(filter, update, {
        new: true,
        session,
        runValidators: true,
      }).lean()
      if (!changed) throw new AdminError('ADMIN_STALE_COHORT')
      if (changesStatus && status === 'inactive') {
        const code = await EnrollmentCode.findOne({ cohortId: current._id, revokedAt: null })
          .select('_id revision')
          .session(session)
          .lean()
        if (code) {
          const codeRevision = code.revision ?? 0
          if (
            !Number.isSafeInteger(codeRevision) ||
            codeRevision < 0 ||
            codeRevision >= Number.MAX_SAFE_INTEGER
          )
            throw new AdminError('ADMIN_CONFLICT')
          const codeFilter = revisionConditions(
            { _id: code._id, cohortId: current._id, revokedAt: null },
            revisionFilter('revision', codeRevision),
          )
          const revoked = await EnrollmentCode.updateOne(
            codeFilter,
            { $set: { revokedAt: new Date(now()), revision: codeRevision + 1 } },
            { session, runValidators: true },
          )
          if (!revoked.modifiedCount) throw new AdminError('ADMIN_CONFLICT')
        }
      }
      await recordAdminEvent(currentActor, 'admin.cohort.update', changed._id, session)
      const institution = await Institution.findById(institutionId)
        .select('_id name status')
        .session(session)
        .lean()
      return { cohort: cohortDto(changed, new Map([[idString(institutionId), institution]])) }
    })
  }

  async function listInstructors(actor, query) {
    await requireAdmin(actor, 'admin:instructors:manage')
    const { page, limit } = parseAdminListQuery(query)
    const filter = { globalRoles: ['instructor'] }
    const skip = (page - 1) * limit
    const [instructors, total] = await Promise.all([
      User.find(filter)
        .select('_id emailNormalized username avatarId accountStatus instructorAssignmentRevision')
        .sort({ _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ])
    const ids = instructors.map(({ _id }) => _id)
    const assignmentCounts = ids.length
      ? await InstructorAssignment.aggregate([
          { $match: { userId: { $in: ids }, status: 'active' } },
          { $group: { _id: '$userId', total: { $sum: 1 } } },
        ])
      : []
    if (assignmentCounts.some(({ total }) => total > 50)) throw new AdminError('ADMIN_UNAVAILABLE')
    const assignments = ids.length
      ? await InstructorAssignment.find({ userId: { $in: ids }, status: 'active' })
          .select('userId cohortId')
          .limit(ids.length * 50)
          .lean()
      : []
    const assignedCohortIds = [...new Set(assignments.map(({ cohortId }) => idString(cohortId)))]
    const assignedCohortRows = assignedCohortIds.length
      ? await Cohort.find({ _id: { $in: assignedCohortIds } })
          .select('_id institutionId name term status adminRevision')
          .lean()
      : []
    const assignedInstitutionIds = [
      ...new Set(assignedCohortRows.map(({ institutionId }) => idString(institutionId))),
    ]
    const assignedInstitutions = assignedInstitutionIds.length
      ? await Institution.find({ _id: { $in: assignedInstitutionIds } })
          .select('_id name status')
          .lean()
      : []
    const assignedInstitutionsById = new Map(
      assignedInstitutions.map((institution) => [idString(institution._id), institution]),
    )
    const assignedCohortsById = new Map(
      assignedCohortRows.map((cohort) => [
        idString(cohort._id),
        cohortDto(cohort, assignedInstitutionsById),
      ]),
    )
    const cohortIdsByUser = new Map(instructors.map(({ _id }) => [idString(_id), []]))
    const assignedCohortsByUser = new Map(instructors.map(({ _id }) => [idString(_id), []]))
    for (const assignment of assignments) {
      const userId = idString(assignment.userId)
      const cohortId = idString(assignment.cohortId)
      cohortIdsByUser.get(userId)?.push(cohortId)
      const cohort = assignedCohortsById.get(cohortId)
      if (cohort) assignedCohortsByUser.get(userId)?.push(cohort)
    }
    return {
      instructors: instructors.map((instructor) =>
        instructorDto(
          instructor,
          cohortIdsByUser.get(idString(instructor._id)),
          assignedCohortsByUser.get(idString(instructor._id)),
        ),
      ),
      page,
      total,
    }
  }

  async function provisionInstructor(actor, input, query = {}) {
    const currentActor = await requireAdmin(actor, 'admin:instructors:manage')
    assertEmptyAdminQuery(query)
    const parsed = parseInstructorInput(input)
    const created = await withTransaction(
      async (session, passwordHash) => {
        await assertTransactionAdministrator(currentActor, session)
        const collision = await User.exists({
          $or: [
            { emailNormalized: parsed.emailNormalized },
            { usernameNormalized: parsed.username.normalized },
          ],
        }).session(session)
        if (collision) throw new AdminError('ADMIN_CONFLICT')
        const [instructor] = await User.create(
          [
            {
              emailNormalized: parsed.emailNormalized,
              username: parsed.username.display,
              usernameNormalized: parsed.username.normalized,
              avatarId: parsed.avatarId,
              passwordHash,
              globalRoles: ['instructor'],
              accountStatus: 'disabled',
              authVersion: 1,
              instructorAssignmentRevision: 0,
              passwordChangedAt: new Date(now()),
            },
          ],
          { session },
        )
        const activation = await issueActivation(
          { userId: idString(instructor._id), actorId: currentActor.id },
          { session },
        )
        await recordAdminEvent(currentActor, 'admin.instructor.provision', instructor._id, session)
        return { instructor: instructorDto(instructor.toObject()), ...activation }
      },
      async () => {
        const randomPassword = randomBytes(32).toString('hex')
        return hashPassword(randomPassword)
      },
    )
    return created
  }

  async function provisionAdministrator(actor, input, query = {}) {
    const currentActor = await requireAdmin(actor, 'admin:instructors:manage')
    assertEmptyAdminQuery(query)
    const parsed = parseInstructorInput(input)
    return withTransaction(
      async (session, passwordHash) => {
        await assertTransactionAdministrator(currentActor, session)
        const collision = await User.exists({
          $or: [
            { emailNormalized: parsed.emailNormalized },
            { usernameNormalized: parsed.username.normalized },
          ],
        }).session(session)
        if (collision) throw new AdminError('ADMIN_CONFLICT')
        const [administrator] = await User.create(
          [
            {
              emailNormalized: parsed.emailNormalized,
              username: parsed.username.display,
              usernameNormalized: parsed.username.normalized,
              avatarId: parsed.avatarId,
              passwordHash,
              globalRoles: ['admin'],
              accountStatus: 'disabled',
              authVersion: 1,
              instructorAssignmentRevision: 0,
              passwordChangedAt: new Date(now()),
            },
          ],
          { session },
        )
        const activation = await issueActivation(
          { userId: idString(administrator._id), actorId: currentActor.id },
          { session },
        )
        await recordAdminEvent(
          currentActor,
          'admin.administrator.provision',
          administrator._id,
          session,
        )
        return {
          administrator: {
            id: idString(administrator._id),
            email: administrator.emailNormalized,
            username: administrator.username,
            avatarId: administrator.avatarId,
            accountStatus: administrator.accountStatus,
          },
          ...activation,
        }
      },
      async () => hashPassword(randomBytes(32).toString('hex')),
    )
  }

  async function reissueActivation(actor, userId, input, query = {}) {
    const currentActor = await requireAdmin(actor, 'admin:instructors:manage')
    assertEmptyAdminQuery(query)
    assertEmptyAdminBody(input)
    const id = parseAdminObjectId(userId)
    return withTransaction(async (session) => {
      await assertTransactionAdministrator(currentActor, session)
      const instructor = await User.findOne({ _id: objectId(id), globalRoles: ['instructor'] })
        .select('_id accountStatus')
        .session(session)
        .lean()
      if (!instructor) throw new AdminError('ADMIN_NOT_FOUND')
      if (instructor.accountStatus !== 'disabled') throw new AdminError('ADMIN_CONFLICT')
      return issueActivation({ userId: id, actorId: currentActor.id }, { session })
    })
  }

  async function setAssignments(actor, userId, input, query = {}) {
    const currentActor = await requireAdmin(actor, 'admin:instructors:manage')
    assertEmptyAdminQuery(query)
    const id = parseAdminObjectId(userId)
    const parsed = parseAssignmentsInput(input)
    const instructorId = objectId(id)
    return withTransaction(async (session) => {
      await assertTransactionAdministrator(currentActor, session)
      const instructor = await User.findOne({
        _id: instructorId,
        globalRoles: ['instructor'],
        accountStatus: 'active',
      })
        .select('_id instructorAssignmentRevision')
        .session(session)
        .lean()
      if (!instructor) throw new AdminError('ADMIN_NOT_FOUND')
      const currentRevision = instructor.instructorAssignmentRevision ?? 0
      if (currentRevision !== parsed.expectedRevision)
        throw new AdminError('ADMIN_STALE_ASSIGNMENTS')

      const cohortObjectIds = parsed.cohortIds.map(objectId)
      const existingAssignments = await InstructorAssignment.find({
        userId: instructorId,
        status: 'active',
      })
        .select('cohortId')
        .session(session)
        .lean()
      if (existingAssignments.length > 50) throw new AdminError('ADMIN_UNAVAILABLE')
      const existingIds = new Set(existingAssignments.map(({ cohortId }) => idString(cohortId)))
      const cohorts = cohortObjectIds.length
        ? await Cohort.find({ _id: { $in: cohortObjectIds } })
            .select('_id institutionId name term status adminRevision +recoveryRevision')
            .session(session)
            .lean()
        : []
      if (cohorts.length !== cohortObjectIds.length) throw new AdminError('ADMIN_NOT_FOUND')
      const institutionIds = [...new Set(cohorts.map(({ institutionId }) => idString(institutionId)))]
      const institutions = institutionIds.length
        ? await Institution.find({ _id: { $in: institutionIds } })
            .select('_id name status +recoveryRevision')
            .session(session)
            .lean()
        : []
      const institutionById = new Map(institutions.map((row) => [idString(row._id), row]))
      const eligibleIds = new Set(
        cohorts
          .filter(
            (cohort) =>
              cohort.status === 'active' &&
              institutionById.get(idString(cohort.institutionId))?.status === 'active',
          )
          .map((cohort) => idString(cohort._id)),
      )
      for (const cohortId of parsed.cohortIds) {
        if (!eligibleIds.has(cohortId) && !existingIds.has(cohortId)) {
          throw new AdminError('ADMIN_NOT_FOUND')
        }
      }
      const cohortByIdForWrites = new Map(cohorts.map((cohort) => [idString(cohort._id), cohort]))
      const guardedInstitutions = new Set()
      for (const cohortId of parsed.cohortIds) {
        if (existingIds.has(cohortId)) continue
        const cohort = cohortByIdForWrites.get(cohortId)
        const institution = institutionById.get(idString(cohort.institutionId))
        const institutionId = idString(institution._id)
        if (!guardedInstitutions.has(institutionId)) {
          await touchRecoveryGuard(Institution, institution, { status: 'active' }, session)
          guardedInstitutions.add(institutionId)
        }
        await touchRecoveryGuard(
          Cohort,
          cohort,
          { status: 'active', institutionId: institution._id },
          session,
        )
      }

      const revisionFilter =
        currentRevision === 0
          ? {
              $or: [
                { instructorAssignmentRevision: 0 },
                { instructorAssignmentRevision: { $exists: false } },
              ],
            }
          : { instructorAssignmentRevision: currentRevision }
      const updated = await User.findOneAndUpdate(
        {
          _id: instructorId,
          globalRoles: ['instructor'],
          accountStatus: 'active',
          ...revisionFilter,
        },
        { $inc: { instructorAssignmentRevision: 1 } },
        { new: true, session, runValidators: true },
      )
        .select('_id emailNormalized username avatarId accountStatus instructorAssignmentRevision')
        .lean()
      if (!updated) {
        const stillInstructor = await User.exists({
          _id: instructorId,
          globalRoles: ['instructor'],
          accountStatus: 'active',
        }).session(session)
        if (!stillInstructor) throw new AdminError('ADMIN_NOT_FOUND')
        throw new AdminError('ADMIN_STALE_ASSIGNMENTS')
      }

      await InstructorAssignment.updateMany(
        { userId: instructorId, status: 'active', cohortId: { $nin: cohortObjectIds } },
        { $set: { status: 'removed' } },
        { session },
      )
      for (const cohortId of cohortObjectIds) {
        if (existingIds.has(idString(cohortId))) continue
        await InstructorAssignment.updateOne(
          { userId: instructorId, cohortId },
          { $set: { status: 'active' }, $setOnInsert: { userId: instructorId, cohortId } },
          { upsert: true, session, runValidators: true },
        )
      }
      await recordAdminEvent(
        currentActor,
        'admin.instructor.assignments.update',
        instructorId,
        session,
      )
      return {
        instructor: instructorDto(
          updated,
          parsed.cohortIds,
          parsed.cohortIds.map((cohortId) =>
            cohortDto(
              cohortByIdForWrites.get(cohortId),
              institutionById,
            ),
          ),
        ),
      }
    })
  }

  return Object.freeze({
    listUsers,
    updateUserStatus,
    listInstitutions,
    createInstitution,
    updateInstitution,
    listCohorts,
    createCohort,
    updateCohort,
    listInstructors,
    provisionInstructor,
    provisionAdministrator,
    reissueActivation,
    setAssignments,
  })
}
