import { Types } from 'mongoose'
import { userModel } from '../../models/User.js'
import { hashPassword } from './password.js'
import { serializeUser } from './service.js'
import { AuthError } from './policy.js'
import {
  attemptsExceededError,
  CODE_TTL_MS,
  expiredCodeError,
  generateCode,
  hashCode,
  hashesMatch,
  invalidCodeError,
  MAX_ATTEMPTS,
  nextVerificationState,
  notPendingError,
  publicVerification,
  resendBlock,
  resendLimitedError,
} from './verification.js'

const duplicateAccountError = () =>
  new AuthError('ACCOUNT_UNAVAILABLE', 'An account could not be created with those details.', 409)

export function createVerificationService(database, { now = Date.now, secret, mailer } = {}) {
  if (typeof secret !== 'string' || !secret) {
    throw new TypeError('A verification secret is required.')
  }
  if (typeof mailer?.sendVerificationCode !== 'function') {
    throw new TypeError('A mailer is required.')
  }
  const User = userModel(database)

  // mail failure never rolls back the account: the learner can use resend
  async function deliver(user, code) {
    try {
      await mailer.sendVerificationCode({
        to: user.emailNormalized,
        username: user.username,
        code,
        expiresInMinutes: CODE_TTL_MS / 60_000,
      })
      return 'sent'
    } catch {
      console.error('Verification email could not be sent.')
      return 'failed'
    }
  }

  // a failed send must not start the resend cooldown
  async function deliverAndDescribe(user, state, code) {
    const delivery = await deliver(user, code)
    if (delivery === 'failed') {
      await User.updateOne(
        { _id: user._id, emailVerification: { $ne: null } },
        { $set: { 'emailVerification.lastSentAt': new Date(0) } },
      )
      return publicVerification(
        user.emailNormalized,
        { expiresAt: state.expiresAt, lastSentAt: new Date(0) },
        delivery,
        now(),
      )
    }
    return publicVerification(user.emailNormalized, state, delivery, now())
  }

  async function registerPending(input) {
    const passwordHash = await hashPassword(input.password)
    const currentTime = now()
    const userId = new Types.ObjectId()
    const code = generateCode()
    const state = nextVerificationState({
      secret,
      userId: userId.toString(),
      code,
      previous: null,
      currentTime,
    })

    let user
    let sentCode = code
    try {
      user = await User.create({
        _id: userId,
        emailNormalized: input.emailNormalized,
        username: input.username.display,
        usernameNormalized: input.username.normalized,
        avatarId: input.avatarId,
        passwordHash,
        globalRoles: ['student'],
        accountStatus: 'active',
        authVersion: 1,
        passwordChangedAt: new Date(currentTime),
        emailVerification: state,
      })
    } catch (error) {
      if (error?.code !== 11000) throw error
      ;({ user, code: sentCode } = await takeOverUnverified(input, passwordHash, currentTime))
    }

    return {
      userId: user._id.toString(),
      authVersion: user.authVersion,
      verification: await deliverAndDescribe(user, user.emailVerification, sentCode),
    }
  }

  // an abandoned registration may be replaced once its code has expired, never while it is live
  async function takeOverUnverified(input, passwordHash, currentTime) {
    const existing = await User.findOne({ emailNormalized: input.emailNormalized }).select(
      '+emailVerification',
    )
    if (!existing?.emailVerification) throw duplicateAccountError()
    if (new Date(existing.emailVerification.expiresAt).getTime() > currentTime) {
      throw duplicateAccountError()
    }

    const code = generateCode()
    const state = nextVerificationState({
      secret,
      userId: existing._id.toString(),
      code,
      previous: null,
      currentTime,
    })
    try {
      const updated = await User.findOneAndUpdate(
        {
          _id: existing._id,
          emailVerification: { $ne: null },
          'emailVerification.expiresAt': { $lte: new Date(currentTime) },
        },
        {
          $set: {
            username: input.username.display,
            usernameNormalized: input.username.normalized,
            avatarId: input.avatarId,
            passwordHash,
            passwordChangedAt: new Date(currentTime),
            emailVerification: state,
          },
          $inc: { authVersion: 1 },
        },
        { returnDocument: 'after' },
      ).select('+emailVerification')
      if (!updated) throw duplicateAccountError()
      return { user: updated, code }
    } catch (error) {
      if (error?.code === 11000) throw duplicateAccountError()
      throw error
    }
  }

  const isPendingReference = (userId, authVersion) =>
    Types.ObjectId.isValid(userId) && Number.isInteger(authVersion)

  // the session's auth version goes stale when a takeover replaces the registration it started
  function isPending(user, authVersion) {
    return (
      user?.accountStatus === 'active' &&
      Boolean(user.emailVerification) &&
      user.authVersion === authVersion
    )
  }

  // strict for resend (surfaces limits), lenient for sign-in (reuses the code already sent)
  async function issue({ userId, authVersion }, { strict }) {
    if (!isPendingReference(userId, authVersion)) throw notPendingError()
    const user = await User.findById(userId).select('+emailVerification')
    if (!isPending(user, authVersion)) throw notPendingError()

    const currentTime = now()
    const previous = user.emailVerification
    const blockedFor = resendBlock(previous, currentTime)
    const expired = new Date(previous.expiresAt).getTime() <= currentTime
    if (blockedFor !== null && (strict || !expired)) {
      if (strict) throw resendLimitedError(blockedFor)
      return publicVerification(user.emailNormalized, previous, 'recent', currentTime)
    }
    if (blockedFor !== null) throw resendLimitedError(blockedFor)

    const code = generateCode()
    const state = nextVerificationState({
      secret,
      userId: user._id.toString(),
      code,
      previous,
      currentTime,
    })
    // compare-and-set on lastSentAt so two concurrent requests cannot both send
    const swapped = await User.findOneAndUpdate(
      {
        _id: user._id,
        emailVerification: { $ne: null },
        'emailVerification.lastSentAt': previous.lastSentAt,
      },
      { $set: { emailVerification: state } },
      { returnDocument: 'after' },
    ).select('+emailVerification')
    if (!swapped) throw resendLimitedError(1000)

    return deliverAndDescribe(user, swapped.emailVerification, code)
  }

  const resend = (pending) => issue(pending, { strict: true })
  const issueForLogin = (pending) => issue(pending, { strict: false })

  // what a refreshed code screen needs; sends nothing and spends no attempt
  async function describePending({ userId, authVersion }) {
    if (!isPendingReference(userId, authVersion)) return null
    const user = await User.findById(userId).select('+emailVerification')
    if (!isPending(user, authVersion)) return null
    // a failed send leaves the last-sent time at epoch 0 so it does not start the cooldown
    const lastSent = new Date(user.emailVerification.lastSentAt).getTime()
    const delivery = lastSent === 0 ? 'failed' : 'recent'
    return publicVerification(user.emailNormalized, user.emailVerification, delivery, now())
  }

  async function verify({ userId, authVersion }, code) {
    if (!isPendingReference(userId, authVersion)) throw notPendingError()

    // reserve an attempt atomically before comparing, so parallel guesses all count
    const reserved = await User.findOneAndUpdate(
      {
        _id: userId,
        accountStatus: 'active',
        authVersion,
        emailVerification: { $ne: null },
        'emailVerification.attempts': { $lt: MAX_ATTEMPTS },
      },
      { $inc: { 'emailVerification.attempts': 1 } },
      { returnDocument: 'before' },
    ).select('+emailVerification')

    if (!reserved) {
      const current = await User.findById(userId).select('+emailVerification')
      if (!isPending(current, authVersion)) throw notPendingError()
      throw attemptsExceededError()
    }

    const state = reserved.emailVerification
    if (new Date(state.expiresAt).getTime() <= now()) throw expiredCodeError()

    const submittedHash = hashCode(secret, reserved._id.toString(), code)
    if (!hashesMatch(state.codeHash, submittedHash)) throw invalidCodeError()

    const verified = await User.findOneAndUpdate(
      {
        _id: reserved._id,
        accountStatus: 'active',
        'emailVerification.codeHash': state.codeHash,
      },
      { $set: { emailVerifiedAt: new Date(now()), emailVerification: null } },
      { returnDocument: 'after' },
    )
    // a resend that lands between the check and this write replaces the hash
    if (!verified) throw invalidCodeError()

    return {
      user: serializeUser(verified),
      userId: verified._id.toString(),
      authVersion: verified.authVersion,
    }
  }

  return Object.freeze({ registerPending, issueForLogin, resend, verify, describePending })
}
