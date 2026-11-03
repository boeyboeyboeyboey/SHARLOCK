export function notFound(_request, response) {
  response.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Endpoint not found.' },
    requestId: response.locals.requestId,
  })
}

// express requires four parameters to route errors to this handler
// eslint-disable-next-line no-unused-vars
export function handleError(error, _request, response, _next) {
  const malformedJson = error.type === 'entity.parse.failed'
  const tooLarge = error.type === 'entity.too.large'
  // body-parser and the router tag client faults (bad charset, bad url encoding) with a 4xx status
  const clientFault = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
  const publicError = {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: 'Request could not be completed.',
  }
  if (malformedJson) {
    publicError.status = 400
    publicError.code = 'INVALID_JSON'
    publicError.message = 'Request body must be valid JSON.'
  } else if (tooLarge) {
    publicError.status = 413
    publicError.code = 'BODY_TOO_LARGE'
    publicError.message = 'Request body is too large.'
  } else if (clientFault) {
    publicError.status = error.status
    publicError.code = 'BAD_REQUEST'
    publicError.message = 'Request could not be read.'
  }
  if (publicError.status === 500) {
    // log only the request id so internal errors cannot expose secrets
    console.error(JSON.stringify({ event: 'request_failed', requestId: response.locals.requestId }))
  }
  response.status(publicError.status).json({
    error: {
      code: publicError.code,
      message: publicError.message,
    },
    requestId: response.locals.requestId,
  })
}
