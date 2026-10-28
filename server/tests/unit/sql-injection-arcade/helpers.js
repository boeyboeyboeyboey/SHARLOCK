import { generateCase } from '../../../src/modules/games/sql-injection-arcade/generator/index.js'

export const SEED = '0123456789abcdef0123456789abcdef'

// the actions that solve one generated case, built from its private model (tests only)
export function solutionFor(c) {
  const { caseId } = c.public
  const { kind, model } = c.private
  const act = (type, payload) => ({ type, payload: { caseId, ...payload } })
  if (kind === 'login-tautology') return [act('attempt', { inputs: ["' OR 1=1--", 'x'] })]
  if (kind === 'login-comment') {
    const user = model.rows[model.targetIndex].user
    return [act('attempt', { inputs: [`${user}'--`, ''] })]
  }
  if (kind === 'login-numeric') return [act('attempt', { inputs: ['0 OR 1=1'] })]
  if (kind === 'union') {
    const columns = model.target.columns
    const items = model.manifests.columns.map((_, i) => columns[i % columns.length]).join(', ')
    return [act('attempt', { inputs: [`zz' UNION SELECT ${items} FROM ${model.target.table}--`] })]
  }
  if (kind === 'blind') {
    const { known, hiddenCol } = model
    return [
      act('attempt', { inputs: [`${known}' AND 1=1--`] }),
      act('attempt', { inputs: [`${known}' AND 1=2--`] }),
      act('attempt', { inputs: [`${known}' AND SUBSTRING(${hiddenCol},1,1) > 'M'--`] }),
      act('answer', { value: c.private.answer }),
    ]
  }
  if (kind === 'second-order') {
    const user = model.rows[model.targetIndex].user
    return [act('register', { inputs: [`${user}'--`] }), act('change-password', {})]
  }
  return [act('choose-fix', { optionId: c.private.repair.correctId })]
}

// one try that is rejected as unsupported syntax, valid for any non-repair case
export function junkAction(c) {
  const { caseId } = c.public
  const { kind } = c.private
  if (kind === 'second-order') return null
  const inputs = kind === 'login-tautology' || kind === 'login-comment' ? [';', ';'] : [';']
  return { type: 'attempt', payload: { caseId, inputs } }
}

export const caseAtIndex = (seed, index) => generateCase({ seed, index })
