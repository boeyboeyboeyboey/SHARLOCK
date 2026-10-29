import { MAX_COMMAND_LENGTH } from './policy.js'

export const VERBS = {
  'block-ip': { keywords: ['block', 'ip'], template: 'block ip' },
  'disable-user': { keywords: ['disable', 'user'], template: 'disable user' },
  'isolate-host': { keywords: ['isolate', 'host'], template: 'isolate host' },
}

const NAME = /^[a-z0-9][a-z0-9-]{0,31}$/
const OCTET = /^(?:0|[1-9]\d{0,2})$/

export function isIpv4(value) {
  const parts = value.split('.')
  return parts.length === 4 && parts.every((part) => OCTET.test(part) && Number(part) <= 255)
}

export const LOOKUPS = ['logs', 'whois']

export function formatCommand(verb, target) {
  if (verb === 'dismiss') return 'dismiss'
  return `${VERBS[verb].template} ${target}`
}

// the teaching grammar is exactly "<verb> <noun> <target>"; nothing here ever touches a real system
export function parseCommand(input) {
  if (typeof input !== 'string') return { ok: false, reason: 'empty' }
  if (input.length > MAX_COMMAND_LENGTH) return { ok: false, reason: 'too-long' }
  const tokens = input.trim().split(/\s+/).filter(Boolean)
  if (!tokens.length) return { ok: false, reason: 'empty' }
  const [first, second, target, ...extra] = tokens
  const word = first.toLowerCase()
  if (word === 'dismiss') {
    if (tokens.length > 1) return { ok: false, reason: 'extra-arguments' }
    return { ok: true, kind: 'dismiss', verb: 'dismiss', target: null, normalized: 'dismiss' }
  }
  if (LOOKUPS.includes(word)) {
    if (!second) return { ok: false, reason: 'missing-target' }
    if (tokens.length > 2) return { ok: false, reason: 'extra-arguments' }
    const lookupTarget = second.toLowerCase()
    if (word === 'whois' && !isIpv4(lookupTarget)) return { ok: false, reason: 'invalid-ip' }
    if (word === 'logs' && !NAME.test(lookupTarget)) return { ok: false, reason: 'invalid-name' }
    return {
      ok: true,
      kind: 'lookup',
      verb: word,
      target: lookupTarget,
      normalized: `${word} ${lookupTarget}`,
    }
  }
  const verb = Object.keys(VERBS).find((key) => {
    const [keyword, noun] = VERBS[key].keywords
    return first.toLowerCase() === keyword && second?.toLowerCase() === noun
  })
  if (!verb) return { ok: false, reason: 'unknown-command' }
  if (!target) return { ok: false, reason: 'missing-target' }
  if (extra.length) return { ok: false, reason: 'extra-arguments' }
  const normalizedTarget = target.toLowerCase()
  if (verb === 'block-ip' && !isIpv4(normalizedTarget)) return { ok: false, reason: 'invalid-ip' }
  if (verb !== 'block-ip' && !NAME.test(normalizedTarget))
    return { ok: false, reason: 'invalid-name' }
  return {
    ok: true,
    kind: 'action',
    verb,
    target: normalizedTarget,
    normalized: formatCommand(verb, normalizedTarget),
  }
}

export const SYNTAX_HINTS = {
  empty: 'Type a command, or "help" for the reference.',
  'too-long': `Commands are limited to ${MAX_COMMAND_LENGTH} characters.`,
  'unknown-command':
    'Command not recognised. Use logs, whois, block ip, disable user, isolate host or dismiss.',
  'missing-target': 'Add a target, for example "block ip 192.0.2.10" or "logs lab-02".',
  'extra-arguments': 'Too many arguments. Each command takes at most one target.',
  'invalid-ip': 'That is not a valid IPv4 address, for example 192.0.2.10.',
  'invalid-name': 'Names use lowercase letters, digits and hyphens, for example lab-02.',
}
