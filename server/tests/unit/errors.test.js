import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleError } from '../../src/middleware/errors.js'

const requestId = 'request-123'

function createResponse() {
  return {
    locals: { requestId },
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('safe error responses', () => {
  it('returns the malformed JSON contract without logging', () => {
    const response = createResponse()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    handleError(
      { type: 'entity.parse.failed', message: 'private request body', stack: 'private stack' },
      {},
      response,
      () => {},
    )

    expect(response.status).toHaveBeenCalledWith(400)
    expect(response.json).toHaveBeenCalledWith({
      error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' },
      requestId,
    })
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('private')
    expect(log).not.toHaveBeenCalled()
  })

  it('returns the oversized body contract without logging', () => {
    const response = createResponse()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    handleError(
      { type: 'entity.too.large', message: 'private request body', stack: 'private stack' },
      {},
      response,
      () => {},
    )

    expect(response.status).toHaveBeenCalledWith(413)
    expect(response.json).toHaveBeenCalledWith({
      error: { code: 'BODY_TOO_LARGE', message: 'Request body is too large.' },
      requestId,
    })
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('private')
    expect(log).not.toHaveBeenCalled()
  })

  it.each([400, 415])('keeps a client status %i without logging', (status) => {
    const response = createResponse()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    handleError(
      { status, type: 'charset.unsupported', message: 'private details' },
      {},
      response,
      () => {},
    )

    expect(response.status).toHaveBeenCalledWith(status)
    expect(response.json).toHaveBeenCalledWith({
      error: { code: 'BAD_REQUEST', message: 'Request could not be read.' },
      requestId,
    })
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('private')
    expect(log).not.toHaveBeenCalled()
  })

  it.each([502, '400'])('treats status %s as an internal error', (status) => {
    const response = createResponse()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    handleError({ status, message: 'private details' }, {}, response, () => {})

    expect(response.status).toHaveBeenCalledWith(500)
  })

  it.each(['database.failure', 'toString', 'constructor'])(
    'uses the generic contract for an unrecognized error type: %s',
    (type) => {
      const response = createResponse()
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})

      handleError(
        { type, message: 'private error details', stack: 'private stack', body: 'private body' },
        {},
        response,
        () => {},
      )

      expect(response.status).toHaveBeenCalledWith(500)
      expect(response.json).toHaveBeenCalledWith({
        error: { code: 'INTERNAL_ERROR', message: 'Request could not be completed.' },
        requestId,
      })
      expect(JSON.stringify(response.json.mock.calls)).not.toContain('private')
      expect(log).toHaveBeenCalledOnce()
      expect(log).toHaveBeenCalledWith(JSON.stringify({ event: 'request_failed', requestId }))
      expect(JSON.stringify(log.mock.calls)).not.toContain('private')
    },
  )
})
