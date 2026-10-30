// sprint timing, kept pure so the botnet tag arena can reuse it; values match server/src/modules/games/botnet-tag/rules.js
export const SPRINT = { MULT: 1.6, MS: 2500, COOLDOWN_MS: 6000 }

// now is a clock in ms; every method also takes an explicit time so tests need no timers
export function createSprint({
  now = () => performance.now(),
  mult = SPRINT.MULT,
  ms = SPRINT.MS,
  cooldownMs = SPRINT.COOLDOWN_MS,
} = {}) {
  let startedAt = null

  const at = (t) => (t === undefined ? now() : t)
  const age = (t) => (startedAt === null ? Infinity : at(t) - startedAt)

  function state(t) {
    const a = age(t)
    if (a < ms) return 'active'
    if (a < ms + cooldownMs) return 'cooldown'
    return 'ready'
  }

  return {
    // true when a burst began; ignored while active or cooling
    start(t) {
      if (state(t) !== 'ready') return false
      startedAt = at(t)
      return true
    },
    state,
    multiplier: (t) => (state(t) === 'active' ? mult : 1),
    // ms until ready again, 0 once ready; counts the burst too
    cooldownLeft: (t) => Math.max(0, ms + cooldownMs - age(t)),
    reset() {
      startedAt = null
    },
  }
}
