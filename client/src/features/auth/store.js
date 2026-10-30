import { defineStore } from 'pinia'
import { ref } from 'vue'
import { parseLoginInput, parseRegistrationInput } from './validation.js'
import {
  requestCsrfToken,
  requestCurrentUser,
  requestLogin,
  requestLogout,
  requestRegistration,
  requestResendVerification,
  requestVerifyEmail,
  SafeAuthError,
  toSafeAuthError,
} from './api.js'
import { setHowToPlayDismissed as requestHowToPlayDismissed } from '../profile/api.js'

const DELIVERY_STATES = ['sent', 'failed', 'recent']
const CODE_PATTERN = /^\d{6}$/

function verificationDto(value) {
  if (
    !value ||
    typeof value.email !== 'string' ||
    !DELIVERY_STATES.includes(value.delivery) ||
    typeof value.expiresAt !== 'string' ||
    typeof value.resendAvailableAt !== 'string'
  ) {
    throw new SafeAuthError({ message: 'Sharlock returned an incomplete response. Try again.' })
  }
  const { email, delivery, expiresAt, resendAvailableAt } = value
  return Object.freeze({ email, delivery, expiresAt, resendAvailableAt })
}

function isAuthenticationRequired(error) {
  return error.status === 401 && error.code === 'AUTHENTICATION_REQUIRED'
}

function userDto(value) {
  if (!value || typeof value !== 'object') {
    throw new SafeAuthError({ message: 'Sharlock returned an incomplete account. Try again.' })
  }

  const { id, email, username, avatarId, globalRoles, howToPlayDismissed = [], wardrobe = null } = value
  if (
    typeof id !== 'string' ||
    typeof email !== 'string' ||
    typeof username !== 'string' ||
    typeof avatarId !== 'string' ||
    !Array.isArray(globalRoles) ||
    !Array.isArray(howToPlayDismissed) ||
    howToPlayDismissed.some((gameId) => typeof gameId !== 'string')
  ) {
    throw new SafeAuthError({ message: 'Sharlock returned an incomplete account. Try again.' })
  }

  return Object.freeze({
    id,
    email,
    username,
    avatarId,
    globalRoles: [...globalRoles],
    howToPlayDismissed: [...howToPlayDismissed],
    ...(wardrobe && typeof wardrobe === 'object' ? { wardrobe: Object.freeze({ ...wardrobe }) } : {}),
  })
}

export const useAuthStore = defineStore('auth', () => {
  const status = ref('unknown')
  const user = ref(null)
  const csrfToken = ref(null)
  const requestError = ref(null)
  const logoutPending = ref(false)
  // set while an account exists but its email address is not confirmed yet. Memory only: a
  // refresh returns to the form, and signing in again sends a fresh code.
  const pendingVerification = ref(null)

  let generation = 0
  let restoreRequest = null
  let csrfRequest = null
  let mutationPending = false

  function isCurrent(operation) {
    return generation === operation && !logoutPending.value
  }

  function accountActionBusy() {
    return new SafeAuthError({
      code: 'ACCOUNT_ACTION_PENDING',
      status: 409,
      message: 'Please wait for the current account request to finish.',
    })
  }

  function settledRestoreResult() {
    if (logoutPending.value || mutationPending) throw accountActionBusy()
    return status.value === 'authenticated' && user.value ? user.value : null
  }

  function clearIdentity(nextStatus = 'anonymous') {
    user.value = null
    csrfToken.value = null
    status.value = nextStatus
  }

  function beginMutation() {
    if (logoutPending.value || mutationPending) {
      throw new SafeAuthError({ message: 'Please wait for the current account request to finish.' })
    }
    mutationPending = true
    const operation = ++generation
    requestError.value = null
    restoreRequest = null
    return operation
  }

  async function getCsrf(operation, { force = false } = {}) {
    if (!force && csrfToken.value) return csrfToken.value
    if (csrfRequest?.generation === operation) return csrfRequest.promise

    const request = { generation: operation }
    request.promise = requestCsrfToken()
      .then((token) => {
        if (generation === operation) csrfToken.value = token
        return token
      })
      .finally(() => {
        if (csrfRequest === request) csrfRequest = null
      })
    csrfRequest = request
    return request.promise
  }

  async function refreshCsrfAfterRejection(operation) {
    try {
      await getCsrf(operation, { force: true })
    } catch {
      // preserve the original safe mutation error for the form
    }
  }

  function storeMutationError(error, operation) {
    const safeError = toSafeAuthError(error)
    if (!isCurrent(operation)) return safeError
    requestError.value = safeError
    return safeError
  }

  function validate(parser, value) {
    try {
      return parser(value)
    } catch (error) {
      const safeError = toSafeAuthError(error)
      requestError.value = safeError
      throw safeError
    }
  }

  async function restoreSession({ force = false } = {}) {
    if (logoutPending.value || mutationPending) throw accountActionBusy()
    if (!force && status.value === 'authenticated' && user.value) return user.value
    if (restoreRequest?.generation === generation) return restoreRequest.promise

    const operation = generation
    const hadIdentity = status.value === 'authenticated' && Boolean(user.value)
    if (!hadIdentity) status.value = 'loading'
    requestError.value = null

    const request = { generation: operation }
    request.promise = (async () => {
      let accountVerified = false
      try {
        const restoredUser = userDto(await requestCurrentUser())
        if (!isCurrent(operation)) return settledRestoreResult()
        user.value = restoredUser
        status.value = 'authenticated'
        accountVerified = true
        await getCsrf(operation)
        return isCurrent(operation) ? user.value : settledRestoreResult()
      } catch (error) {
        const safeError = toSafeAuthError(error)
        if (!isCurrent(operation)) return settledRestoreResult()
        if (isAuthenticationRequired(safeError)) {
          clearIdentity('anonymous')
          requestError.value = null
          return null
        }
        requestError.value = safeError
        if (!hadIdentity && !accountVerified) status.value = 'unknown'
        throw safeError
      } finally {
        if (restoreRequest === request) restoreRequest = null
      }
    })()
    restoreRequest = request
    return request.promise
  }

  function requireCsrfToken(response) {
    if (typeof response.csrfToken !== 'string' || !response.csrfToken) {
      throw new SafeAuthError({ message: 'Sign-in could not be completed. Please try again.' })
    }
  }

  function completeSignIn(response, operation) {
    const authenticatedUser = userDto(response?.user)
    if (!isCurrent(operation)) return null
    requireCsrfToken(response)
    user.value = authenticatedUser
    csrfToken.value = response.csrfToken
    status.value = 'authenticated'
    pendingVerification.value = null
    requestError.value = null
    return authenticatedUser
  }

  async function authenticate(kind, payload) {
    const operation = beginMutation()
    try {
      const token = await getCsrf(operation)
      const response =
        kind === 'register'
          ? await requestRegistration(payload, token)
          : await requestLogin(payload, token)
      if (response?.verification && !response.user) {
        // correct details, but the email address still needs its code: no identity yet
        const verification = verificationDto(response.verification)
        if (!isCurrent(operation)) return null
        requireCsrfToken(response)
        pendingVerification.value = verification
        csrfToken.value = response.csrfToken
        requestError.value = null
        return null
      }
      return completeSignIn(response, operation)
    } catch (error) {
      const safeError = storeMutationError(error, operation)
      if (safeError.status === 403) await refreshCsrfAfterRejection(operation)
      throw safeError
    } finally {
      mutationPending = false
    }
  }

  async function login({ identifier, password }) {
    const input = validate(parseLoginInput, { identifier, password })
    return authenticate('login', {
      identifier: input.identifier.normalized,
      password: input.password,
    })
  }

  async function register({ email, username, password, avatarId }) {
    const input = validate(parseRegistrationInput, { email, username, password, avatarId })
    return authenticate('register', {
      email: input.emailNormalized,
      username: input.username.display,
      password: input.password,
      avatarId: input.avatarId,
    })
  }

  async function verifyEmail(code) {
    const submitted = typeof code === 'string' ? code.replace(/\s/g, '') : ''
    if (!CODE_PATTERN.test(submitted)) {
      const safeError = new SafeAuthError({
        code: 'VALIDATION_ERROR',
        status: 400,
        message: 'Enter the 6-digit code.',
        fieldErrors: { code: 'Enter the 6-digit code.' },
      })
      requestError.value = safeError
      throw safeError
    }
    if (!pendingVerification.value) {
      const safeError = new SafeAuthError({
        code: 'VERIFICATION_NOT_PENDING',
        status: 409,
        message: 'Your sign-up session ended. Sign in to get a new code.',
      })
      requestError.value = safeError
      throw safeError
    }

    const operation = beginMutation()
    try {
      const token = await getCsrf(operation)
      const response = await requestVerifyEmail({ code: submitted }, token)
      return completeSignIn(response, operation)
    } catch (error) {
      const safeError = storeMutationError(error, operation)
      if (safeError.status === 403) await refreshCsrfAfterRejection(operation)
      // the server no longer holds a pending sign-up for this browser: start over
      if (isCurrent(operation) && safeError.code === 'VERIFICATION_NOT_PENDING') {
        pendingVerification.value = null
      }
      throw safeError
    } finally {
      mutationPending = false
    }
  }

  async function resendVerification() {
    if (!pendingVerification.value) return null
    const operation = beginMutation()
    try {
      const token = await getCsrf(operation)
      const response = await requestResendVerification(token)
      const verification = verificationDto(response?.verification)
      if (isCurrent(operation)) {
        pendingVerification.value = verification
        requestError.value = null
      }
      return verification
    } catch (error) {
      const safeError = storeMutationError(error, operation)
      if (safeError.status === 403) await refreshCsrfAfterRejection(operation)
      if (isCurrent(operation) && safeError.code === 'VERIFICATION_NOT_PENDING') {
        pendingVerification.value = null
      }
      throw safeError
    } finally {
      mutationPending = false
    }
  }

  function cancelVerification() {
    pendingVerification.value = null
    requestError.value = null
  }

  async function logout() {
    if (status.value !== 'authenticated' || !user.value) {
      invalidateSession()
      return
    }

    if (logoutPending.value) return
    const operation = ++generation
    logoutPending.value = true
    requestError.value = null
    restoreRequest = null

    try {
      const token = csrfToken.value || (await getCsrf(operation))
      try {
        await requestLogout(token)
      } catch (error) {
        // a lapsed session cookie makes the cached token stale: refetch once and retry
        const rejected = toSafeAuthError(error)
        if (rejected.status !== 403 || rejected.code !== 'CSRF_INVALID') throw error
        if (generation !== operation) throw error
        await requestLogout(await getCsrf(operation, { force: true }))
      }
      if (generation === operation) {
        clearIdentity('anonymous')
        requestError.value = null
      }
    } catch (error) {
      const safeError = toSafeAuthError(error)
      if (generation !== operation) return
      if (isAuthenticationRequired(safeError)) {
        clearIdentity('anonymous')
        requestError.value = null
        return
      }
      requestError.value = safeError
      if (safeError.status === 403) await refreshCsrfAfterRejection(operation)
      throw safeError
    } finally {
      if (generation === operation) logoutPending.value = false
    }
  }

  function invalidateSession() {
    generation += 1
    restoreRequest = null
    csrfRequest = null
    mutationPending = false
    logoutPending.value = false
    requestError.value = null
    pendingVerification.value = null
    clearIdentity('anonymous')
  }

  // optimistic: the dialog hides at once, the server list replaces it, a failure restores it
  async function setHowToPlayDismissed(gameId, dismissed) {
    // a choice made while the session is still loading waits for it instead of being dropped
    if (status.value === 'loading' && restoreRequest) await restoreRequest.promise.catch(() => null)
    const current = user.value
    if (status.value !== 'authenticated' || !current) return
    const previous = current.howToPlayDismissed
    const optimistic = dismissed
      ? [...new Set([...previous, gameId])]
      : previous.filter((id) => id !== gameId)
    user.value = Object.freeze({ ...current, howToPlayDismissed: optimistic })
    try {
      const saved = await requestHowToPlayDismissed(gameId, dismissed)
      if (user.value?.id === current.id) {
        user.value = Object.freeze({ ...user.value, howToPlayDismissed: [...saved] })
      }
    } catch (error) {
      if (user.value?.id === current.id) {
        user.value = Object.freeze({ ...user.value, howToPlayDismissed: previous })
      }
      throw error
    }
  }

  // the picker has already saved on the server, this only mirrors the equipped ids
  function setWardrobe(equipped) {
    if (!user.value || !equipped || typeof equipped !== 'object') return
    user.value = Object.freeze({ ...user.value, wardrobe: Object.freeze({ ...equipped }) })
  }

  return {
    status,
    user,
    csrfToken,
    requestError,
    logoutPending,
    pendingVerification,
    restoreSession,
    login,
    register,
    verifyEmail,
    resendVerification,
    cancelVerification,
    logout,
    invalidateSession,
    setHowToPlayDismissed,
    setWardrobe,
  }
})
