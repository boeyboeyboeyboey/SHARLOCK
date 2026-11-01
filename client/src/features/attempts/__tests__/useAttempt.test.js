import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { useAttempt } from '../useAttempt.js'
import { writeAttempt, readAttempt } from '../api.js'
vi.mock('../api.js', () => ({
  writeAttempt: vi.fn(),
  readAttempt: vi.fn(),
  safeAttemptError: (error) => ({
    message: 'Retry request',
    status: error.status || 0,
    code: error.code,
  }),
}))
let wrapper
afterEach(() => {
  wrapper?.unmount()
  vi.resetAllMocks()
})
function setup() {
  let game
  wrapper = mount(
    defineComponent({
      setup() {
        game = useAttempt('sql-injection-arcade')
        return () => null
      },
    }),
  )
  return game
}
const snapshot = {
  gameId: 'sql-injection-arcade',
  attemptId: 'example-id',
  revision: 0,
  status: 'active',
}
describe('shared attempt requests', () => {
  it('retries a lost action response with exactly the original ID and revision', async () => {
    const game = setup()
    readAttempt.mockResolvedValue(snapshot)
    await game.load('example-id')
    writeAttempt
      .mockRejectedValueOnce(new Error('Network lost'))
      .mockResolvedValueOnce({ ...snapshot, revision: 1 })
    await game.mutate('test-payload', { username: 'fictional', password: '' })
    const original = writeAttempt.mock.calls[0][1]
    expect(game.retryable.value).toBe(true)
    expect(await game.mutate('test-payload', {})).toBe(false)
    expect(await game.load('example-id')).toBe(false)
    await game.retry()
    expect(writeAttempt.mock.calls[1][1]).toEqual(original)
    expect(game.snapshot.value.revision).toBe(1)
    expect(game.retryable.value).toBe(false)
  })
  it('allows a fresh read after a deterministic revision rejection', async () => {
    const game = setup()
    readAttempt.mockResolvedValue(snapshot)
    await game.load('example-id')
    writeAttempt.mockRejectedValue({ status: 409 })
    await game.mutate('test-payload', { username: '', password: '' })
    expect(game.retryable.value).toBe(false)
    expect(await game.load('example-id')).toBe(true)
  })
  it('starts, acts and completes, keeping the newest snapshot', async () => {
    const game = setup()
    writeAttempt
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce({ ...snapshot, revision: 1 })
      .mockResolvedValueOnce({ ...snapshot, revision: 2, status: 'completed', persisted: true })
    expect(await game.start({ kind: 'personal' })).toBe(true)
    expect(writeAttempt.mock.calls[0][0]).toBe('/games/sql-injection-arcade/attempts')
    expect(writeAttempt.mock.calls[0][1]).toEqual({ context: { kind: 'personal' } })
    expect(await game.mutate('move', { a: 1 })).toBe(true)
    expect(writeAttempt.mock.calls[1][0]).toBe('/attempts/example-id/actions')
    expect(writeAttempt.mock.calls[1][1]).toMatchObject({
      expectedRevision: 0,
      type: 'move',
      payload: { a: 1 },
    })
    expect(await game.complete()).toBe(true)
    expect(writeAttempt.mock.calls[2][0]).toBe('/attempts/example-id/complete')
    expect(writeAttempt.mock.calls[2][1].expectedRevision).toBe(1)
    expect(game.snapshot.value.status).toBe('completed')
    expect(game.error.value).toBe('')
  })

  it('refuses a second submit while the first is in flight', async () => {
    const game = setup()
    readAttempt.mockResolvedValue(snapshot)
    await game.load('example-id')
    let finish
    writeAttempt.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    const first = game.mutate('move', {})
    expect(game.busy.value).toBe(true)
    expect(await game.mutate('move', {})).toBe(false)
    expect(await game.complete()).toBe(false)
    expect(writeAttempt).toHaveBeenCalledTimes(1)
    finish({ ...snapshot, revision: 1 })
    expect(await first).toBe(true)
    expect(game.busy.value).toBe(false)
  })

  it('rejects a snapshot for a different game', async () => {
    const game = setup()
    readAttempt.mockResolvedValue({ ...snapshot, gameId: 'clearance-tower' })
    expect(await game.load('example-id')).toBe(false)
    expect(game.snapshot.value).toBeNull()
    expect(game.error.value).not.toBe('')
  })

  it('aborts the open request on unmount and ignores its late answer', async () => {
    const game = setup()
    let finish
    writeAttempt.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    const started = game.start({ kind: 'personal' })
    const signal = writeAttempt.mock.calls[0][2]
    expect(signal.aborted).toBe(false)
    wrapper.unmount()
    expect(signal.aborted).toBe(true)
    finish(snapshot)
    expect(await started).toBe(false)
    expect(game.snapshot.value).toBeNull()
  })

  it.each([
    ['session ended', { status: 401, code: 'AUTHENTICATION_REQUIRED' }],
    ['access removed', { status: 403, code: 'CAPABILITY_FORBIDDEN' }],
    ['refused', { status: 400 }],
    ['gone', { status: 404 }],
  ])('offers no retry that can never succeed: %s', async (_name, failure) => {
    const game = setup()
    readAttempt.mockResolvedValue(snapshot)
    await game.load('example-id')
    writeAttempt.mockRejectedValue(failure)
    await game.mutate('move', {})
    expect(game.retryable.value).toBe(false)
    expect(await game.retry()).toBe(false)
    expect(writeAttempt).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['an expired security check', { status: 403, code: 'CSRF_INVALID' }],
    ['a busy server', { status: 503 }],
    ['too many requests', { status: 429 }],
  ])('keeps the same request for %s', async (_name, failure) => {
    const game = setup()
    readAttempt.mockResolvedValue(snapshot)
    await game.load('example-id')
    writeAttempt.mockRejectedValue(failure)
    await game.mutate('move', {})
    expect(game.retryable.value).toBe(true)
  })

  it('does not point a failed start at a retry that has nothing to send', async () => {
    const game = setup()
    writeAttempt.mockRejectedValue(new Error('Network lost'))
    expect(await game.start({ kind: 'personal' })).toBe(false)
    expect(game.retryable.value).toBe(false)
    expect(game.error.value).toBe(
      'Could not reach saved play. Check your connection, then try again.',
    )
    expect(await game.retry()).toBe(false)
  })
})
