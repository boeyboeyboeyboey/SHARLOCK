import { csrfSync } from 'csrf-sync'
import { AuthError } from './policy.js'

export function createCsrfTools() {
  const csrf = csrfSync({
    ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
    getTokenFromRequest: (request) => request.get('x-csrf-token'),
  })

  const protect = (request, response, next) => {
    csrf.csrfSynchronisedProtection(request, response, (error) => {
      if (error) {
        next(new AuthError('CSRF_INVALID', 'Refresh the security token and try again.', 403))
        return
      }
      next()
    })
  }

  return Object.freeze({ generateToken: csrf.generateToken, protect })
}

// headers is a plain lowercase header object so http upgrade requests can reuse the check
export function hasExpectedOrigin(headers, clientOrigin) {
  let sourceOrigin = headers.origin
  if (sourceOrigin === undefined && headers.referer !== undefined) {
    try {
      const parsed = new URL(headers.referer)
      if (!parsed.username && !parsed.password) sourceOrigin = parsed.origin
    } catch {
      sourceOrigin = undefined
    }
  }
  return sourceOrigin === clientOrigin
}

export function requireExpectedOrigin(clientOrigin) {
  return (request, _response, next) => {
    const headers = { origin: request.get('origin'), referer: request.get('referer') }
    if (!hasExpectedOrigin(headers, clientOrigin)) {
      next(new AuthError('ORIGIN_FORBIDDEN', 'This request came from an untrusted origin.', 403))
      return
    }
    next()
  }
}
