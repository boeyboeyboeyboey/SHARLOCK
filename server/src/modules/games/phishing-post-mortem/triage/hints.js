import { createRandom } from './generator/random.js'
import { SCENARIOS } from './generator/templates.js'

// same shapes for every type, so the wording never says whether the email is genuine
const NUDGES = Object.freeze({
  lookalike: 'Look closely at who really sent this.',
  spoof: 'Look closely at who really sent this.',
  replyTo: 'Look closely at where a reply would actually go.',
  linkMismatch: 'Look closely at where the link really points.',
  bec: 'Think about what this email is asking you to do.',
  qr: 'Look closely at the code in this email.',
  attachment: 'Look closely at the attachment.',
})

const CONCEPTS = Object.freeze({
  lookalike: "Check whether the sender's domain is a look-alike of the real organisation's domain.",
  spoof: 'Check whether the display name matches the address the email was really sent from.',
  replyTo: 'Check whether the reply-to address differs from the sender.',
  linkMismatch: 'Check whether the link text matches the address it really goes to.',
  bec: 'Check whether a request to move money or change payment details can be verified independently.',
  qr: 'Check whether a code hides a destination you cannot inspect.',
  attachment: 'Check whether the file type and name fit what this sender would normally send.',
})

export const HINT_TYPES = Object.freeze(Object.keys(NUDGES))

const NEEDS_PART = { replyTo: 'replyTo', linkMismatch: 'link', qr: 'qr', attachment: 'attachment' }

// a phish hints at its own trick; a genuine email hints at a trick its scenario could carry
// and that has something to inspect here, so the hint shape never gives the verdict away
export function hintTypeFor({ email, answer }, seed, roundIndex) {
  if (answer.verdict === 'phish') return answer.type
  const scenario = SCENARIOS.find((item) => item.id === answer.scenario)
  const kinds = new Set(email.parts.map((part) => part.kind))
  const options = (scenario?.phishTypes ?? []).filter(
    (type) => !NEEDS_PART[type] || kinds.has(NEEDS_PART[type]),
  )
  if (options.length === 0) return 'lookalike'
  return createRandom(seed, `hint-${roundIndex}`).pick(options)
}

export function hintLines(type, tier) {
  const lines = []
  if (tier >= 1) lines.push(NUDGES[type])
  if (tier >= 2) lines.push(CONCEPTS[type])
  return lines
}
