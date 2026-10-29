import { Types } from 'mongoose'
import { userModel } from '../../models/User.js'
import { AuthError } from './policy.js'
import { equippedFrom } from '../wardrobe/catalog.js'
import { hashPassword, verifyDummyPassword, verifyPassword } from './password.js'

export const invalidCredentialsError = () =>
  new AuthError('INVALID_CREDENTIALS', 'Email, username or password is incorrect.', 401)

const duplicateAccountError = () =>
  new AuthError('ACCOUNT_UNAVAILABLE', 'An account could not be created with those details.', 409)

export function serializeUser(user) {
  return {
    id: user._id.toString(),
    email: user.emailNormalized,
    username: user.username,
    avatarId: user.avatarId,
    globalRoles: [...user.globalRoles],
    howToPlayDismissed: [...(user.howToPlayDismissed ?? [])],
    wardrobe: equippedFrom(user),
  }
}

export function createAuthService(database, { now = Date.now } = {}) {
  const User = userModel(database)

  async function register(input) {
    const passwordHash = await hashPassword(input.password)
    try {
      const user = await User.create({
        emailNormalized: input.emailNormalized,
        username: input.username.display,
        usernameNormalized: input.username.normalized,
        avatarId: input.avatarId,
        passwordHash,
        globalRoles: ['student'],
        accountStatus: 'active',
        authVersion: 1,
        passwordChangedAt: new Date(now()),
      })
      return {
        user: serializeUser(user),
        userId: user._id.toString(),
        authVersion: user.authVersion,
      }
    } catch (error) {
      if (error?.code === 11000) throw duplicateAccountError()
      throw error
    }
  }

  function findLoginAccount(identifier) {
    const filter =
      identifier.kind === 'email'
        ? { emailNormalized: identifier.normalized }
        : { usernameNormalized: identifier.normalized }
    return User.findOne(filter).select('+passwordHash +emailVerification')
  }

  async function login(input, account) {
    const user = account === undefined ? await findLoginAccount(input.identifier) : account
    if (!user) {
      await verifyDummyPassword(input.password)
      throw invalidCredentialsError()
    }

    const passwordMatches = await verifyPassword(user.passwordHash, input.password)
    if (!passwordMatches || user.accountStatus !== 'active') throw invalidCredentialsError()

    // correct password but the email address was never confirmed: no session yet
    if (user.emailVerification) return { pendingVerification: true, userId: user._id.toString() }

    const currentUser = await User.findById(user._id)
    if (
      !currentUser ||
      currentUser.accountStatus !== 'active' ||
      currentUser.authVersion !== user.authVersion
    ) {
      throw invalidCredentialsError()
    }
    return {
      user: serializeUser(currentUser),
      userId: currentUser._id.toString(),
      authVersion: currentUser.authVersion,
    }
  }

  async function findActiveSessionUser(userId, authVersion) {
    if (!Types.ObjectId.isValid(userId)) return null
    const user = await User.findById(userId).select('+emailVerification')
    if (!user || user.accountStatus !== 'active' || user.authVersion !== authVersion) return null
    if (user.emailVerification) return null
    return serializeUser(user)
  }

  return Object.freeze({ register, findLoginAccount, login, findActiveSessionUser })
}
