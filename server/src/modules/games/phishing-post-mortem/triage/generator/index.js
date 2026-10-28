import { createRandom } from './random.js'
import { COMPANIES, DAYS, FILLER_LINES, FIRST_NAMES, LAST_NAMES, VENDORS } from './pools.js'
import { SCENARIOS } from './templates.js'

export const GENERATOR_VERSION = 'triage-2'

const SEED_PATTERN = /^[0-9a-f]{32}$/
const LEGIT_SHARE = 0.6
const MAX_ROUND_INDEX = 100000
const URGENCY = [
  '',
  ' Please handle this today.',
  ' This is time-sensitive and must be done within the hour.',
]

export function tierForRound(roundIndex) {
  if (roundIndex < 4) return 1
  return roundIndex < 9 ? 2 : 3
}

function makePerson(rng) {
  const first = rng.pick(FIRST_NAMES)
  const last = rng.pick(LAST_NAMES)
  const letters = (text) => text.toLowerCase().replace(/[^a-z]/g, '')
  return { full: `${first} ${last}`, local: `${letters(first)}.${letters(last)}` }
}

// part ids are short random strings so they reveal neither order nor kind
function createIdMaker(rng) {
  const used = new Set()
  return () => {
    let id
    do {
      id = `p${Math.floor(rng.next() * 1679616)
        .toString(36)
        .padStart(4, '0')}`
    } while (used.has(id))
    used.add(id)
    return id
  }
}

function legitExplanation(spec, safeNote) {
  const checked = ['sender']
  if (spec.link) checked.push('link')
  if (spec.attachment) checked.push('attachment')
  if (spec.qr) checked.push('code')
  const domain = spec.senderAddress.split('@')[1]
  const list = checked.join(', ').replace(/, ([^,]*)$/, ' and $1')
  const verb = checked.length === 1 ? 'matches' : 'all match'
  const safe = safeNote ? ` ${safeNote}` : ''
  return `The ${list} ${verb} ${domain}, so this email is genuine even though it asks you to act.${safe}`
}

function buildParts(spec, rng, nextId) {
  const ids = {}
  const parts = []
  const add = (kind, key, fields) => {
    const id = nextId()
    ids[key] = id
    parts.push({ id, kind, ...fields })
  }

  add('sender', 'sender', { name: spec.senderName, address: spec.senderAddress })
  if (spec.replyTo) add('replyTo', 'replyTo', { address: spec.replyTo })

  const fillers = rng.shuffle(FILLER_LINES)
  const bodies = [...spec.body]
  const wanted = Math.max(1, Math.min(3, bodies.length + rng.int(0, 2)))
  while (bodies.length < wanted) bodies.push(fillers.pop())

  const requestAt = rng.int(0, bodies.length)
  bodies.forEach((text, index) => {
    if (index === requestAt) add('request', 'request', { text: spec.request })
    add('body', `body${index}`, { text })
  })
  if (requestAt === bodies.length) add('request', 'request', { text: spec.request })

  if (spec.link) add('link', 'link', spec.link)
  if (spec.attachment) {
    add('attachment', 'attachment', {
      fileName: spec.attachment.fileName,
      sizeLabel: `${rng.int(24, 980)} KB`,
    })
  }
  if (spec.qr) add('qr', 'qr', spec.qr)
  return { parts, ids }
}

function isValidInput(seed, roundIndex) {
  return (
    typeof seed === 'string' &&
    SEED_PATTERN.test(seed) &&
    Number.isInteger(roundIndex) &&
    roundIndex >= 0 &&
    roundIndex <= MAX_ROUND_INDEX
  )
}

export function generateRound({ seed, roundIndex } = {}) {
  if (!isValidInput(seed, roundIndex)) return null

  const rng = createRandom(seed, roundIndex)
  const tier = tierForRound(roundIndex)
  const isLegit = rng.next() < LEGIT_SHARE
  const context = {
    rng,
    tier,
    org: rng.pick(COMPANIES),
    vendor: rng.pick(VENDORS),
    person: makePerson(rng),
    other: makePerson(rng),
    ref: `INV-${rng.int(1000, 9999)}`,
  }
  const scenario = rng.pick(SCENARIOS)
  const type = isLegit ? 'legit' : rng.pick(scenario.phishTypes)
  const spec = scenario.build(context, { verdict: isLegit ? 'legit' : 'phish', phishType: type })
  // only genuine emails may carry the safe-route sentence, and only about half of them do
  const safeRoute = isLegit && rng.next() < 0.5
  if (safeRoute) spec.request += ` ${scenario.safeRoute}`
  spec.request += URGENCY[tier - 1]

  // a harmless reply-to equal to the sender, so its presence proves nothing
  if (!spec.replyTo && rng.next() < 0.18) spec.replyTo = spec.senderAddress

  const { parts, ids } = buildParts(spec, rng, createIdMaker(rng))
  const roundId = Math.floor(rng.next() * 2176782336)
    .toString(36)
    .padStart(6, '0')
  const day = rng.pick(DAYS)
  const hour = String(rng.int(7, 18)).padStart(2, '0')
  const minute = String(rng.int(0, 59)).padStart(2, '0')

  return {
    email: {
      roundId,
      tier,
      senderName: spec.senderName,
      senderAddress: spec.senderAddress,
      replyTo: spec.replyTo ?? null,
      subject: spec.subject,
      receivedLabel: `${day} ${hour}:${minute}`,
      parts,
    },
    answer: {
      verdict: isLegit ? 'legit' : 'phish',
      type,
      scenario: scenario.id,
      safeRoute,
      tellPartIds: spec.tells.map((kind) => ids[kind]),
      explanation: isLegit
        ? legitExplanation(spec, safeRoute ? scenario.safeNote : '')
        : spec.explanation,
    },
  }
}
