import { randomBytes } from 'node:crypto'
import { Schema } from 'mongoose'
import { AttemptError } from '../../attempts/policy.js'
import { isTaken, runBlind, runChange, runLogin, runNumeric, runUnion } from './engine.js'
import { messageFor } from './feedback.js'
import { GENERATOR_VERSION } from './generator/index.js'
import {
  GAME_ID,
  KIND_TIER,
  MAX_LIVES,
  MAX_NAME,
  MAX_PROBES,
  MAX_TRIES,
  PRACTICE_CASES,
  PRACTICE_SLOTS,
  RULESET_VERSION,
  SqlError,
  TIMED_SECONDS,
  TIMED_SLOT_CAP,
  maxTimedActions,
  maxTimedScore,
  parseAction,
} from './policy.js'
import {
  SQL_TOPICS,
  caseAt,
  fixPoints,
  livesLeft,
  solvedPoints,
  tally,
  topicBreakdown,
} from './scoring.js'

const KINDS = ['repair', ...Object.keys(KIND_TIER)]
const LAST_CODES = [
  '',
  'SUCCESS',
  'NO_MATCH',
  'NO_BREAKOUT',
  'NORMAL',
  'WRONG_ACCOUNT',
  'SYNTAX_ERROR',
  'UNSUPPORTED',
  'COLUMN_MISMATCH',
  'NO_DATA',
  'WRONG_TABLE',
  'WIDENED',
  'YES',
  'NO',
  'STORED',
  'TAKEN',
  'OWN_ACCOUNT',
  'TOO_BROAD',
  'ANSWER_RIGHT',
  'ANSWER_WRONG',
  'FIX_RIGHT',
  'FIX_WRONG',
]

const caseSchema = new Schema(
  {
    kind: { type: String, required: true, enum: KINDS },
    tier: { type: Number, required: true, min: 0, max: 3 },
    tries: { type: Number, required: true, min: 0, max: MAX_PROBES },
    slips: { type: Number, required: true, min: 0, max: MAX_PROBES },
    outcome: { type: String, required: true, enum: ['open', 'solved', 'failed'] },
    assisted: { type: Boolean, required: true },
    points: { type: Number, required: true, min: 0, max: 60 },
    trueSeen: { type: Boolean, required: true },
    falseSeen: { type: Boolean, required: true },
    probed: { type: Boolean, required: true },
    stored: { type: String, default: '', maxlength: MAX_NAME },
    picked: { type: String, default: '', maxlength: 1 },
    last: { type: String, default: '', enum: LAST_CODES },
  },
  { _id: false, strict: 'throw' },
)
const stateSchema = new Schema(
  {
    seed: { type: String, required: true, match: /^[0-9a-f]{32}$/ },
    generatorVersion: { type: String, required: true, maxlength: 16 },
    cases: {
      type: [caseSchema],
      default: [],
      validate: (cases) => cases.length <= TIMED_SLOT_CAP,
    },
  },
  { _id: false, strict: 'throw' },
)

function fail(code, message, status = 400) {
  throw new AttemptError(code, message, status)
}

function isOver(state, metadata) {
  if (metadata.mode === 'practice') return tally(state.cases).closed >= PRACTICE_SLOTS
  const timeUp = metadata.deadlineAt !== null && metadata.now >= metadata.deadlineAt
  return (
    timeUp || tally(state.cases).failed >= MAX_LIVES || tally(state.cases).closed >= TIMED_SLOT_CAP
  )
}

function currentIndex(cases) {
  const last = cases.at(-1)
  return last && last.outcome === 'open' ? cases.length - 1 : cases.length
}

const blankRecord = (kind) => ({
  kind,
  tier: KIND_TIER[kind] ?? 0,
  tries: 0,
  slips: 0,
  outcome: 'open',
  assisted: false,
  points: 0,
  trueSeen: false,
  falseSeen: false,
  probed: false,
  stored: '',
  picked: '',
  last: '',
})

const triesMaxFor = (kind) => (kind === 'blind' ? MAX_PROBES : kind === 'repair' ? 1 : MAX_TRIES)
const blindReady = (rec) => rec.trueSeen && rec.falseSeen && rec.probed

function solve(rec) {
  rec.outcome = 'solved'
  rec.points = solvedPoints(rec)
}

// closes a case that ran out of tries, unless a blind case still has its answer to give
function settleTries(rec) {
  if (rec.outcome !== 'open' || rec.tries < triesMaxFor(rec.kind)) return
  if (rec.kind === 'blind' && blindReady(rec)) return
  rec.outcome = 'failed'
}

function runAttempt(rec, c, inputs) {
  const { kind, model } = c.private
  const needed = kind === 'login-tautology' || kind === 'login-comment' ? 2 : 1
  if (inputs.length !== needed) fail('SQL_INVALID_ACTION', `This case takes ${needed} field(s).`)
  if (kind === 'blind') {
    if (rec.tries >= MAX_PROBES) fail('SQL_NO_PROBES', 'No probes are left. Give your answer.', 409)
    const result = runBlind(model, inputs)
    rec.tries += 1
    rec.last = result.code
    if (result.code === 'SYNTAX_ERROR' || result.code === 'UNSUPPORTED') rec.slips += 1
    else if (result.sub) {
      if (rec.trueSeen && rec.falseSeen) rec.probed = true
    } else if (result.injected && result.code === 'YES') rec.trueSeen = true
    else if (result.injected && result.code === 'NO' && result.startsKnown) rec.falseSeen = true
    settleTries(rec)
    return
  }
  const result =
    kind === 'union'
      ? runUnion(model, inputs)
      : kind === 'login-numeric'
        ? runNumeric(model, inputs)
        : runLogin(model, inputs, kind)
  rec.tries += 1
  rec.last = result.code
  if (result.code === 'SUCCESS') solve(rec)
  else {
    rec.slips += 1
    settleTries(rec)
  }
}

function applyTo(rec, c, action, metadata) {
  const { type, payload } = action
  const { kind } = c.private
  const wrong = () => fail('SQL_WRONG_ACTION', 'That action does not fit this case.', 409)
  if (type === 'hint') {
    if (metadata.mode !== 'practice' || kind === 'repair')
      fail('SQL_HINT_UNAVAILABLE', 'Hints are only available in practice.', 409)
    if (rec.assisted) fail('SQL_HINT_USED', 'This case already has a hint.', 409)
    rec.assisted = true
  } else if (type === 'attempt') {
    if (kind === 'repair' || kind === 'second-order') wrong()
    runAttempt(rec, c, payload.inputs)
  } else if (type === 'register') {
    if (kind !== 'second-order') wrong()
    if (rec.stored !== '') fail('SQL_WRONG_ACTION', 'Change the password first.', 409)
    const [name] = payload.inputs
    if (name.trim().length === 0) fail('SQL_INVALID_ACTION', 'Enter a username to register.')
    if (isTaken(c.private.model, name)) {
      rec.tries += 1
      rec.slips += 1
      rec.last = 'TAKEN'
      settleTries(rec)
    } else {
      rec.stored = name
      rec.last = 'STORED'
    }
  } else if (type === 'change-password') {
    if (kind !== 'second-order') wrong()
    if (rec.stored === '') fail('SQL_WRONG_ACTION', 'Register a username first.', 409)
    const result = runChange(c.private.model, rec.stored)
    rec.stored = ''
    rec.tries += 1
    rec.last = result.code
    if (result.code === 'SUCCESS') solve(rec)
    else {
      rec.slips += 1
      settleTries(rec)
    }
  } else if (type === 'answer') {
    if (kind !== 'blind') wrong()
    if (!blindReady(rec))
      fail('SQL_STAGE_LOCKED', 'Prove the injection and run a letter probe first.', 409)
    if (payload.value === c.private.answer) {
      rec.last = 'ANSWER_RIGHT'
      solve(rec)
    } else {
      rec.last = 'ANSWER_WRONG'
      rec.outcome = 'failed'
    }
  } else if (type === 'choose-fix') {
    if (kind !== 'repair') wrong()
    rec.picked = payload.optionId
    if (payload.optionId === c.private.repair.correctId) {
      rec.last = 'FIX_RIGHT'
      rec.outcome = 'solved'
      rec.points = fixPoints()
    } else {
      rec.last = 'FIX_WRONG'
      rec.outcome = 'failed'
    }
  }
}

function currentView(state) {
  const index = currentIndex(state.cases)
  const c = caseAt(state, index)
  const rec = state.cases[index] ?? blankRecord(c.private.kind)
  const { kind } = c.private
  const max = triesMaxFor(kind)
  return {
    ...c.public,
    options: c.public.options ? c.public.options.map((option) => ({ ...option })) : null,
    triesMax: max,
    triesLeft: Math.max(0, max - rec.tries),
    stage: kind === 'blind' ? (rec.trueSeen && rec.falseSeen ? 2 : 1) : null,
    canAnswer: kind === 'blind' ? blindReady(rec) : false,
    phase: kind === 'second-order' ? (rec.stored ? 'change' : 'register') : null,
    stored: rec.stored || null,
    assisted: rec.assisted,
    hint: rec.assisted ? c.private.hint : null,
  }
}

function lastView(state) {
  const index = state.cases.length - 1
  if (index < 0) return null
  const rec = state.cases[index]
  const c = caseAt(state, index)
  const closed = rec.outcome !== 'open'
  const { kind } = c.private
  const target = kind === 'union' ? c.private.model.target : null
  const why = kind === 'repair' && closed ? c.private.repair.why[rec.picked] : null
  return {
    caseId: c.public.caseId,
    kind,
    title: c.public.title,
    code: rec.last || null,
    message: messageFor(kind, rec.last),
    leaked:
      rec.last === 'SUCCESS' && target
        ? {
            table: target.table,
            columns: [...target.columns],
            rows: target.rows.slice(0, 4).map((row) => target.columns.map((name) => row[name])),
          }
        : null,
    closed,
    solved: rec.outcome === 'solved',
    points: rec.points,
    explanation: closed ? [why, c.private.explanation].filter(Boolean).join(' ') : null,
  }
}

function buildReview(state) {
  return state.cases.map((rec, index) => ({
    number: caseAt(state, index).public.number,
    kind: rec.kind,
    tier: rec.tier,
    outcome: rec.outcome,
    points: rec.points,
    assisted: rec.assisted,
    tries: rec.tries,
  }))
}

// randomSeed is a test-only seam, never reachable from a request
export function createSqlRuleset({ randomSeed = () => randomBytes(16).toString('hex') } = {}) {
  return {
    id: GAME_ID,
    rulesetVersion: RULESET_VERSION,
    learningObjective:
      'Recognise how pasted-together SQL lets input become code (quote breakout, comments, unquoted numbers, UNION, boolean blind and second-order injection) and choose bound parameters as the real fix.',
    topicTags: [...SQL_TOPICS],
    maxScore: maxTimedScore(),
    maxActions: maxTimedActions(),
    current: true,
    competitive: true,
    serverRecorded: false,
    stateSchema,
    createState({ now, context }) {
      const timed = context.kind === 'cohort'
      return {
        state: { seed: randomSeed(), generatorVersion: GENERATOR_VERSION, cases: [] },
        mode: timed ? 'standard' : 'practice',
        deadlineAt: timed ? new Date(new Date(now).getTime() + TIMED_SECONDS * 1000) : null,
      }
    },
    validateAction(type, payload) {
      try {
        return parseAction(type, payload)
      } catch (error) {
        if (error instanceof SqlError) fail(error.code, error.message, error.status)
        throw error
      }
    },
    applyAction(state, action, metadata) {
      if (isOver(state, metadata)) fail('SQL_RUN_OVER', 'This run has already ended.', 409)
      const index = currentIndex(state.cases)
      const c = caseAt(state, index)
      if (action.payload.caseId !== c.public.caseId)
        fail('SQL_STALE_CASE', 'That case is no longer the current one.', 409)
      const cases = state.cases.map((rec) => ({ ...rec }))
      const rec = cases[index] ?? (cases[index] = blankRecord(c.private.kind))
      applyTo(rec, c, action, metadata)
      return { ...state, cases }
    },
    canComplete(state, metadata) {
      return isOver(state, metadata)
    },
    serializePublicState(state, metadata) {
      const timed = metadata.mode === 'standard'
      const totals = tally(state.cases)
      const playable = metadata.status === 'active' && !isOver(state, metadata)
      const view = {
        mode: metadata.mode,
        totalCases: timed ? null : PRACTICE_CASES,
        maxLives: timed ? MAX_LIVES : null,
        lives: timed ? livesLeft(state.cases) : null,
        casesClosed: totals.closed,
        score: totals.score,
        solved: totals.solved,
        failed: totals.failed,
        current: playable ? currentView(state) : null,
        last: lastView(state),
      }
      if (metadata.status === 'completed') view.review = buildReview(state)
      return view
    },
    summarize(state) {
      const totals = tally(state.cases)
      const byTopic = topicBreakdown(state.cases)
      const topicOutcomes = [...byTopic].map(([topic, { solved, total }]) => ({
        topic,
        achieved: solved === total,
        feedbackCode: solved === total ? 'SQL_TOPIC_MET' : 'SQL_TOPIC_MISSED',
      }))
      const repairs = totals.repairsRight + totals.repairsWrong
      if (repairs > 0)
        topicOutcomes.push({
          topic: 'parameterized-queries',
          achieved: totals.repairsRight === repairs,
          feedbackCode: totals.repairsRight === repairs ? 'SQL_TOPIC_MET' : 'SQL_TOPIC_MISSED',
        })
      return {
        score: Math.min(totals.score, maxTimedScore()),
        feedback: {
          verdictCode: totals.failed >= MAX_LIVES ? 'SQL_RUN_LIVES_OUT' : 'SQL_RUN_FINISHED',
          casesSolved: totals.solved,
          casesFailed: totals.failed,
          repairsCorrect: totals.repairsRight,
          assistedCases: state.cases.filter((rec) => rec.assisted).length,
        },
        topicOutcomes,
      }
    },
  }
}

export const sqlRuleset = createSqlRuleset()
