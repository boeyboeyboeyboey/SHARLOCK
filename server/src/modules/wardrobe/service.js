import { Types } from 'mongoose'
import { userModel } from '../../models/User.js'
import { ProfileError } from '../profile/policy.js'
import { achievementNames } from '../progress/achievements.js'
import { createProgressService } from '../progress/service.js'
import { WARDROBE_ITEMS, equippedFrom, findWardrobeItem } from './catalog.js'

function accountUnavailable() {
  return new ProfileError('AUTHENTICATION_REQUIRED', 'Sign in to continue.', 401)
}

function currentAccountFilter(actor) {
  if (
    !actor ||
    typeof actor.id !== 'string' ||
    !Types.ObjectId.isValid(actor.id) ||
    !Number.isSafeInteger(actor.authVersion)
  ) {
    throw accountUnavailable()
  }
  return {
    _id: new Types.ObjectId(actor.id),
    accountStatus: 'active',
    authVersion: actor.authVersion,
  }
}

export function createWardrobeService(database, { registry, now } = {}) {
  const User = userModel(database)
  const progress = createProgressService(database, { registry, now })

  // unlocks are re-derived from the actor's own completed attempts on every call
  async function earnedKeys(playerId) {
    const achievements = await progress.listAchievements(playerId)
    return new Set(achievements.map(({ key }) => key))
  }

  const isUnlocked = (entry, earned) => entry.unlockedBy === null || earned.has(entry.unlockedBy)

  async function getWardrobe(actor) {
    const filter = currentAccountFilter(actor)
    const user = await User.findOne(filter).select('wardrobe').lean()
    if (!user) throw accountUnavailable()
    const earned = await earnedKeys(actor.id)
    return {
      items: WARDROBE_ITEMS.map((entry) => ({
        id: entry.id,
        slot: entry.slot,
        name: entry.name,
        unlocked: isUnlocked(entry, earned),
        unlockedBy: entry.unlockedBy,
        unlockedByName: entry.unlockedBy ? achievementNames[entry.unlockedBy] : null,
      })),
      equipped: equippedFrom(user),
    }
  }

  async function equip(actor, { slot, itemId }) {
    const filter = currentAccountFilter(actor)
    const earned = await earnedKeys(actor.id)
    if (!isUnlocked(findWardrobeItem(itemId), earned)) {
      throw new ProfileError('WARDROBE_ITEM_LOCKED', 'That item is not available yet.', 403)
    }
    const user = await User.findOneAndUpdate(
      filter,
      { $set: { [`wardrobe.${slot}`]: itemId } },
      { returnDocument: 'after', projection: 'wardrobe' },
    ).lean()
    if (!user) throw accountUnavailable()
    return { equipped: equippedFrom(user) }
  }

  return Object.freeze({ getWardrobe, equip })
}
