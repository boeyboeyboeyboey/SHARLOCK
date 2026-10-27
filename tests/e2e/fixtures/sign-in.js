import { setTimeout as delay } from 'node:timers/promises'

// the password gate answers 503 PASSWORD_SERVICE_BUSY when too many hashes run at once, so only
// that transient response is retried; the csrf token stays valid because the gate runs before rotation
const BUSY_STATUS = 503
const BUSY_CODE = 'PASSWORD_SERVICE_BUSY'
const MAXIMUM_RETRIES = 3
const BACKOFF_STEP_MS = 200

async function readErrorCode(response) {
  try {
    const body = await response.json()
    const code = body?.error?.code
    return typeof code === 'string' && /^[A-Z_]{1,64}$/.test(code) ? code : 'NO_ERROR_CODE'
  } catch {
    return 'NO_ERROR_CODE'
  }
}

export async function postFixtureLogin(
  request,
  { loginUrl, origin, csrfToken, email, password, message },
) {
  for (let attempt = 0; ; attempt += 1) {
    const response = await request.post(loginUrl, {
      headers: { Origin: origin, 'X-CSRF-Token': csrfToken },
      data: { email, password },
    })
    if (response.ok()) return

    const status = response.status()
    const code = await readErrorCode(response)
    const retryable = status === BUSY_STATUS && code === BUSY_CODE
    if (!retryable || attempt >= MAXIMUM_RETRIES) {
      throw new Error(`${message} (${status} ${code}).`)
    }
    await delay(BACKOFF_STEP_MS * (attempt + 1) + Math.floor(Math.random() * 100))
  }
}
