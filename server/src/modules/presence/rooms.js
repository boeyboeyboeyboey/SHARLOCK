import { Types } from 'mongoose'
import { cohortModel } from '../../models/Cohort.js'
import { institutionModel } from '../../models/Institution.js'
import { membershipModel } from '../../models/Membership.js'
import { instructorAssignmentModel } from '../../models/InstructorAssignment.js'

// room lookups: a room is a class (cohort) id, always decided by the server
export function createRoomResolver(database) {
  const Cohort = cohortModel(database)
  const Institution = institutionModel(database)
  const Membership = membershipModel(database)
  const InstructorAssignment = instructorAssignmentModel(database)

  async function cohortIsActive(cohortId) {
    const cohort = await Cohort.findOne({ _id: cohortId, status: 'active' })
      .select('institutionId')
      .lean()
    if (!cohort) return false
    return Boolean(await Institution.exists({ _id: cohort.institutionId, status: 'active' }))
  }

  // a student has one active class; a legacy student with several gets the latest approved
  async function studentRoom(userId) {
    const memberships = await Membership.find({
      userId: new Types.ObjectId(userId),
      status: 'active',
    })
      .sort({ approvedAt: -1, _id: -1 })
      .select('cohortId')
      .lean()
    for (const { cohortId } of memberships) {
      if (await cohortIsActive(cohortId)) return cohortId.toString()
    }
    return null
  }

  // admins may enter any active class, instructors only an actively assigned one
  async function staffMayJoin(user, cohortId) {
    if (!Types.ObjectId.isValid(cohortId) || !(await cohortIsActive(cohortId))) return false
    if (user.globalRoles.includes('admin')) return true
    if (!user.globalRoles.includes('instructor')) return false
    return Boolean(
      await InstructorAssignment.exists({
        userId: new Types.ObjectId(user.id),
        cohortId: new Types.ObjectId(cohortId),
        status: 'active',
      }),
    )
  }

  return Object.freeze({ studentRoom, staffMayJoin })
}
