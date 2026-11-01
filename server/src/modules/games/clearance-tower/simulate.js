import { checkStep } from './models.js'

// each event kind has a word for "every step was allowed" and for "something stopped it"
const OUTCOMES = {
  work: { passed: 'done', stopped: 'blocked' },
  attack: { passed: 'leaked', stopped: 'stopped' },
  integrity: { passed: 'tampered', stopped: 'stopped' },
}

const NOT_REACHED = {
  allowed: null,
  reason: 'An earlier step was blocked, so this never happened.',
}

// a chain stops at its first blocked step, so later steps report null instead of a verdict
function playSteps(level, policy, steps) {
  let blocked = false
  return steps.map((step) => {
    if (blocked) return { ...step, ...NOT_REACHED }
    const checked = checkStep(level, policy, step)
    blocked = !checked.allowed
    return { ...step, ...checked }
  })
}

// replays the level's scripted day against the submitted policy; same input, same day
export function simulateDay(level, policy) {
  return level.day.map((event) => {
    const steps = playSteps(level, policy, event.steps)
    const passed = steps.every((step) => step.allowed)
    const outcomes = OUTCOMES[event.kind]
    return {
      id: event.id,
      kind: event.kind,
      story: event.story,
      steps,
      outcome: passed ? outcomes.passed : outcomes.stopped,
    }
  })
}
