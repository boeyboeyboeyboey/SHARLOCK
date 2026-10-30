export const CUE_NAMES = [
  'horn',
  'tick',
  'tickFast',
  'tagHit',
  'infected',
  'patchOk',
  'patchFail',
  'immuneWarn',
  'sprint',
  'win',
  'lose',
]

const TICK_FROM_S = 10
const FAST_FROM_S = 3
const WARN_MS = 3000

// the slice of game state the cues depend on
export function cueView({ phase, msLeft, immunityMs, lockMs, selfInfected, sideWon }) {
  return {
    phase: phase ?? '',
    secondsLeft: Math.ceil(Math.max(0, msLeft ?? 0) / 1000),
    immunityMs: immunityMs ?? 0,
    lockActive: (lockMs ?? 0) > 0,
    selfInfected: Boolean(selfInfected),
    sideWon: sideWon ?? null,
  }
}

export const eventKey = (event) =>
  `${event.type}:${event.at}:${event.from ?? event.sid ?? ''}:${event.to ?? ''}`

// returns events not seen before and remembers them
export function freshEvents(events, seen) {
  const fresh = []
  for (const event of events) {
    const key = eventKey(event)
    if (seen.has(key)) continue
    seen.add(key)
    fresh.push(event)
  }
  return fresh
}

// (previous view, next view, new events) -> cue names to play, in order
export function deriveCues(prev, next, events = [], sid = '') {
  if (!prev || !next) return []
  const cues = []
  const playing = next.phase === 'playing'
  if (prev.phase !== 'playing' && playing) cues.push('horn')
  if (playing) {
    for (const event of events) {
      if (event.type === 'tag' && event.to === sid) cues.push('infected')
      else if (event.type === 'tag' && event.from === sid) cues.push('tagHit')
      else if (event.type === 'patch' && event.sid === sid) cues.push('patchOk')
    }
    if (!prev.lockActive && next.lockActive) cues.push('patchFail')
    if (prev.immunityMs > WARN_MS && next.immunityMs > 0 && next.immunityMs <= WARN_MS) {
      cues.push('immuneWarn')
    }
    const { secondsLeft } = next
    if (prev.phase === 'playing' && secondsLeft !== prev.secondsLeft) {
      if (secondsLeft >= 1 && secondsLeft <= FAST_FROM_S) cues.push('tickFast')
      else if (secondsLeft > FAST_FROM_S && secondsLeft <= TICK_FROM_S) cues.push('tick')
    }
  }
  if (prev.phase !== 'results' && next.phase === 'results' && next.sideWon) {
    const won = next.selfInfected ? next.sideWon === 'botnet' : next.sideWon === 'survivors'
    cues.push(won ? 'win' : 'lose')
  }
  return cues
}
