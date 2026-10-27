import { Types } from 'mongoose'
import { userModel } from '../../models/User.js'
import { ProfileError } from './policy.js'

function currentAccountFilter(actor) {
  if (
    !actor ||
    typeof actor.id !== 'string' ||
    !Types.ObjectId.isValid(actor.id) ||
    !Number.isSafeInteger(actor.authVersion)
  ) {
    throw new ProfileError('AUTHENTICATION_REQUIRED', 'Sign in to continue.', 401)
  }

  return {
    _id: new Types.ObjectId(actor.id),
    accountStatus: 'active',
    authVersion: actor.authVersion,
  }
}

function profileDto(user) {
  return { username: user.username, avatarId: user.avatarId }
}

function accountUnavailable() {
  return new ProfileError('AUTHENTICATION_REQUIRED', 'Sign in to continue.', 401)
}

export function createProfileService(database) {
  const User = userModel(database)

  async function getProfile(actor) {
    const user = await User.findOne(currentAccountFilter(actor)).select('username avatarId').lean()
    if (!user) throw accountUnavailable()
    return profileDto(user)
  }

  async function updateProfile(actor, input) {
    const filter = currentAccountFilter(actor)
    try {
      const user = await User.findOneAndUpdate(
        filter,
        {
          $set: {
            username: input.username.display,
            usernameNormalized: input.username.normalized,
            avatarId: input.avatarId,
          },
        },
        {
          returnDocument: 'after',
          runValidators: true,
          context: 'query',
          projection: 'username avatarId',
        },
      ).lean()
      if (!user) throw accountUnavailable()
      return profileDto(user)
    } catch (error) {
      if (error?.code === 11000) {
        throw new ProfileError(
          'PROFILE_CONFLICT',
          'The profile could not be updated. Review your changes and try again.',
          409,
        )
      }
      throw error
    }
  }

  async function setHowToPlayDismissed(actor, { gameId, dismissed }) {
    const user = await User.findOneAndUpdate(
      currentAccountFilter(actor),
      dismissed
        ? { $addToSet: { howToPlayDismissed: gameId } }
        : { $pull: { howToPlayDismissed: gameId } },
      { returnDocument: 'after', projection: 'howToPlayDismissed' },
    ).lean()
    if (!user) throw accountUnavailable()
    return { howToPlayDismissed: [...(user.howToPlayDismissed ?? [])] }
  }

  return Object.freeze({ getProfile, updateProfile, setHowToPlayDismissed })
}
