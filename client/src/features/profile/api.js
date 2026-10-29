import { api } from '../../services/api.js'
import { avatarPresets } from '../auth/avatars.js'
import { requestCsrfToken } from '../auth/api.js'

const AVATAR_IDS = new Set(avatarPresets.map((preset) => preset.id))
const GAME_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/
const USERNAME_PATTERN = /^[a-z0-9_-]{3,32}$/i

const SAFE_MESSAGES = Object.freeze({
  AUTHENTICATION_REQUIRED: 'Your session has ended. Sign in again to continue.',
  CSRF_INVALID: 'Your security check expired. Review your changes and try again.',
  ORIGIN_FORBIDDEN: 'This request could not be verified. Refresh and try again.',
  PROFILE_USERNAME_TAKEN: 'That username is already in use. Choose another one.',
  USERNAME_TAKEN: 'That username is already in use. Choose another one.',
  VALIDATION_ERROR: 'Check the highlighted fields and try again.',
})

const FIELD_MESSAGES = Object.freeze({
  username: 'Use 3 to 32 letters, numbers, underscores or hyphens.',
  avatarId: 'Choose one of the available avatars.',
})

export class ProfileApiError extends Error {
  constructor({ code = 'REQUEST_FAILED', status = 0, message, fieldErrors }) {
    super(message || 'Sharlock could not complete that request. Please try again.')
    this.name = 'ProfileApiError'
    this.code = code
    this.status = status
    this.fieldErrors = fieldErrors || Object.freeze({})
  }
}

function exactProfile(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2 ||
    !Object.hasOwn(value, 'username') ||
    !Object.hasOwn(value, 'avatarId')
  ) {
    throw new ProfileApiError({ message: 'Sharlock returned an incomplete profile. Try again.' })
  }

  const username = typeof value.username === 'string' ? value.username.trim() : ''
  if (!USERNAME_PATTERN.test(username) || !AVATAR_IDS.has(value.avatarId)) {
    throw new ProfileApiError({ message: 'Sharlock returned an incomplete profile. Try again.' })
  }

  return Object.freeze({ username, avatarId: value.avatarId })
}

function exactInput(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2 ||
    !Object.hasOwn(value, 'username') ||
    !Object.hasOwn(value, 'avatarId')
  ) {
    throw new ProfileApiError({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: SAFE_MESSAGES.VALIDATION_ERROR,
      fieldErrors: Object.freeze({ _: SAFE_MESSAGES.VALIDATION_ERROR }),
    })
  }

  const username = typeof value.username === 'string' ? value.username.trim() : ''
  if (!USERNAME_PATTERN.test(username)) {
    throw new ProfileApiError({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: SAFE_MESSAGES.VALIDATION_ERROR,
      fieldErrors: Object.freeze({ username: FIELD_MESSAGES.username }),
    })
  }
  if (!AVATAR_IDS.has(value.avatarId)) {
    throw new ProfileApiError({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: SAFE_MESSAGES.VALIDATION_ERROR,
      fieldErrors: Object.freeze({ avatarId: FIELD_MESSAGES.avatarId }),
    })
  }

  return { username, avatarId: value.avatarId }
}

function safeError(error) {
  if (error instanceof ProfileApiError) return error

  const status = Number.isInteger(error?.response?.status) ? error.response.status : 0
  const payload = error?.response?.data?.error
  const code = typeof payload?.code === 'string' ? payload.code : 'REQUEST_FAILED'
  const knownMessage = Object.hasOwn(SAFE_MESSAGES, code) ? SAFE_MESSAGES[code] : null
  const message =
    knownMessage ||
    (status === 409
      ? 'That username is unavailable. Refresh and try again.'
      : status === 429
        ? 'Too many profile changes. Please wait and try again.'
        : status >= 500
          ? 'Sharlock is temporarily unavailable. Try again shortly.'
          : status === 0
            ? 'We could not reach Sharlock. Check your connection and try again.'
            : 'Sharlock could not complete that request. Review your changes and try again.')

  const fieldErrors = Object.create(null)
  if (status === 409) fieldErrors.username = 'That username is already in use. Choose another one.'
  if (payload?.fieldErrors && typeof payload.fieldErrors === 'object') {
    for (const key of Object.keys(FIELD_MESSAGES)) {
      if (Object.hasOwn(payload.fieldErrors, key)) fieldErrors[key] = FIELD_MESSAGES[key]
    }
  }

  return new ProfileApiError({
    code,
    status,
    message,
    fieldErrors: Object.freeze(fieldErrors),
  })
}

export async function getOwnProfile({ signal } = {}) {
  try {
    const response = await api.get('/me/profile', { signal })
    return exactProfile(response.data)
  } catch (error) {
    throw safeError(error)
  }
}

export async function updateOwnProfile(input, { signal } = {}) {
  try {
    const payload = exactInput(input)
    const csrfToken = await requestCsrfToken()
    signal?.throwIfAborted()
    const response = await api.patch('/me/profile', payload, {
      signal,
      headers: { 'X-CSRF-Token': csrfToken },
    })
    return exactProfile(response.data)
  } catch (error) {
    throw safeError(error)
  }
}

export async function setHowToPlayDismissed(gameId, dismissed, { signal } = {}) {
  try {
    if (
      typeof gameId !== 'string' ||
      !GAME_ID_PATTERN.test(gameId) ||
      typeof dismissed !== 'boolean'
    ) {
      throw new ProfileApiError({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: SAFE_MESSAGES.VALIDATION_ERROR,
      })
    }
    const csrfToken = await requestCsrfToken()
    signal?.throwIfAborted()
    const response = await api.put(
      `/me/how-to-play/${gameId}`,
      { dismissed },
      { signal, headers: { 'X-CSRF-Token': csrfToken } },
    )
    const list = response.data?.howToPlayDismissed
    if (
      Object.keys(response.data ?? {}).length !== 1 ||
      !Array.isArray(list) ||
      list.some((id) => typeof id !== 'string')
    ) {
      throw new ProfileApiError({ message: 'Sharlock returned an incomplete response. Try again.' })
    }
    return Object.freeze([...list])
  } catch (error) {
    throw safeError(error)
  }
}

export async function getWardrobe({ signal } = {}) {
  try {
    const { data } = await api.get('/me/wardrobe', { signal })
    if (!data || !Array.isArray(data.items) || !data.equipped || typeof data.equipped !== 'object') {
      throw new ProfileApiError({ message: 'Sharlock returned an incomplete wardrobe. Try again.' })
    }
    return { items: data.items, equipped: data.equipped }
  } catch (error) {
    throw safeError(error)
  }
}

export async function equipWardrobeItem(slot, itemId, { signal } = {}) {
  try {
    const csrfToken = await requestCsrfToken()
    signal?.throwIfAborted()
    const { data } = await api.put(
      `/me/wardrobe/${slot}`,
      { itemId },
      { signal, headers: { 'X-CSRF-Token': csrfToken } },
    )
    if (!data?.equipped || typeof data.equipped !== 'object') {
      throw new ProfileApiError({ message: 'Sharlock returned an incomplete wardrobe. Try again.' })
    }
    return data.equipped
  } catch (error) {
    const safe = safeError(error)
    if (safe.code === 'WARDROBE_ITEM_LOCKED') {
      throw new ProfileApiError({ code: safe.code, status: safe.status, message: 'That item is not available yet.' })
    }
    throw safe
  }
}

export { safeError }
