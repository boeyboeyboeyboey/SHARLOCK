import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ post: vi.fn(), csrf: vi.fn() }))
vi.mock('../../../services/api.js', () => ({ api: { post: mocks.post, get: vi.fn() } }))
vi.mock('../../auth/api.js', () => ({ requestCsrfToken: mocks.csrf }))

let writeAttempt
let safeAttemptError

function rejection(status, code) {
  return { response: { status, data: { error: { code } } } }
}

beforeEach(async () => {
  vi.resetModules()
  mocks.post.mockReset()
  mocks.csrf.mockReset()
  ;({ writeAttempt, safeAttemptError } = await import('../api.js'))
})

describe('writeAttempt csrf cache', () => {
  it('fetches the token once for sequential writes', async () => {
    mocks.csrf.mockResolvedValue('t1')
    mocks.post.mockResolvedValue({ data: { ok: true } })
    await writeAttempt('/a', {})
    await writeAttempt('/b', {})
    expect(mocks.csrf).toHaveBeenCalledTimes(1)
    expect(mocks.post).toHaveBeenLastCalledWith(
      '/b',
      {},
      {
        signal: undefined,
        headers: { 'X-CSRF-Token': 't1' },
      },
    )
  })

  it('shares one fetch between concurrent first writes', async () => {
    mocks.csrf.mockResolvedValue('t1')
    mocks.post.mockResolvedValue({ data: { ok: true } })
    await Promise.all([writeAttempt('/a', {}), writeAttempt('/b', {})])
    expect(mocks.csrf).toHaveBeenCalledTimes(1)
    expect(mocks.post).toHaveBeenCalledTimes(2)
  })

  it('refetches and retries once after CSRF_INVALID', async () => {
    mocks.csrf.mockResolvedValueOnce('old').mockResolvedValueOnce('new')
    mocks.post
      .mockRejectedValueOnce(rejection(403, 'CSRF_INVALID'))
      .mockResolvedValueOnce({ data: { done: 1 } })
    await expect(writeAttempt('/a', { x: 1 })).resolves.toEqual({ done: 1 })
    expect(mocks.csrf).toHaveBeenCalledTimes(2)
    expect(mocks.post).toHaveBeenCalledTimes(2)
    expect(mocks.post.mock.calls[1][2].headers['X-CSRF-Token']).toBe('new')
  })

  it('rejects after exactly one retry when CSRF_INVALID repeats', async () => {
    mocks.csrf.mockResolvedValue('t')
    const error = rejection(403, 'CSRF_INVALID')
    mocks.post.mockRejectedValue(error)
    await expect(writeAttempt('/a', {})).rejects.toBe(error)
    expect(mocks.post).toHaveBeenCalledTimes(2)
  })

  it('does not retry other 403 codes', async () => {
    mocks.csrf.mockResolvedValue('t')
    const error = rejection(403, 'ORIGIN_FORBIDDEN')
    mocks.post.mockRejectedValue(error)
    await expect(writeAttempt('/a', {})).rejects.toBe(error)
    expect(mocks.post).toHaveBeenCalledTimes(1)
    await writeAttempt('/a', {}).catch(() => {})
    expect(mocks.csrf).toHaveBeenCalledTimes(1)
  })

  it('rethrows 401 and refetches on the next write', async () => {
    mocks.csrf.mockResolvedValue('t')
    const error = rejection(401, 'AUTHENTICATION_REQUIRED')
    mocks.post.mockRejectedValueOnce(error).mockResolvedValueOnce({ data: {} })
    await expect(writeAttempt('/a', {})).rejects.toBe(error)
    expect(mocks.post).toHaveBeenCalledTimes(1)
    await writeAttempt('/a', {})
    expect(mocks.csrf).toHaveBeenCalledTimes(2)
  })
})

describe('safeAttemptError', () => {
  it.each([
    [401, 'AUTHENTICATION_REQUIRED', /session ended/i],
    [403, 'CAPABILITY_FORBIDDEN', /cannot access/i],
    [404, 'ATTEMPT_NOT_FOUND', /unavailable to your account/i],
    [409, 'ATTEMPT_STALE_REVISION', /another tab/i],
    [429, undefined, /too many requests/i],
    [503, undefined, /could not reach saved play/i],
  ])('maps a %i %s to safe wording', (status, code, wording) => {
    const safe = safeAttemptError(rejection(status, code))
    expect(safe.message).toMatch(wording)
    expect(safe.status).toBe(status)
    expect(safe.code).toBe(code)
  })

  it('reports a lost response as status 0', () => {
    expect(safeAttemptError(new Error('Network lost')).status).toBe(0)
  })
})
