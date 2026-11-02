// a saved score can exceed the ruleset's maxScore, which then acts as a par
export function formatScore(score, max) {
  return score > max ? `${score} (par ${max})` : `${score} / ${max}`
}
