import { LlmError } from './llm/llmError.js'
import { createLlmAdapter } from './llm/adapter.js'
import { createChatSessionStore } from './llm/chatSessionStore.js'
import { createChatSessionRunner } from './llm/chatSessionRunner.js'
import {
  COMPLETED_TTL_MS,
  DEFAULT_TURN_BUDGET,
  GAME_ID,
  MAX_COMPLETED,
  MAX_NUDGES,
  MAX_SCORE,
  RULESET_VERSION,
  VERIFIER_CONCURRENCY,
  VERIFIER_TURN_BUDGET,
  WEIGHTS,
} from './policy.js'
import { pickScenario, promptForTurn, publicBrief } from './scenarios.js'
import { nudgeFor, publicVerifier, verifierFor } from './verifiers.js'

// normalise for leak detection: uppercase and keep only letters and digits so
// "synth reset 4821" and "synth_reset.4821" match the stored SYNTH-RESET-4821
function normalise(value) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// deterministic backstop on the colleague reply: at most three sentences and no
// urls. never throws and never returns an empty string
export function tidyColleagueReply(value) {
  const original = typeof value === 'string' ? value.trim() : ''
  if (!original) return original
  // split on whitespace after sentence punctuation so in-token periods
  // (hostnames, v1.2) never break a sentence
  const sentences = original.split(/(?<=[.!?])\s+/)
  const kept = sentences.slice(0, 3).join(' ').trim()
  const cleaned = kept
    .replace(/(?:https?:\/\/|www\.)\S*/gi, '')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\s+([.,!?])/g, '$1')
    .trim()
  return cleaned || original
}

function sessionNotFound() {
  return new LlmError('LLM_SESSION_NOT_FOUND', 'That simulation was not found or has ended.', 404)
}

function efficiencyPoints(turnsUsed, turnBudget) {
  return turnsUsed <= turnBudget
    ? WEIGHTS.efficiency
    : Math.max(0, Math.round(WEIGHTS.efficiency * (1 - (turnsUsed - turnBudget) / turnBudget)))
}

// a genuine request: checking first and then helping earns full marks
function scoreLegitimate({
  leaked,
  decision,
  turnsUsed,
  turnBudget,
  verifierContacted,
  verifierName,
}) {
  const checked = !leaked && verifierContacted
  const sharedAfterChecking = checked && decision === 'share-code'
  const compromised = leaked || (decision === 'share-code' && !verifierContacted)
  const breakdown = [
    {
      key: 'noLeak',
      label: 'Shared the code after checking',
      points: sharedAfterChecking ? WEIGHTS.noLeak : 0,
      max: WEIGHTS.noLeak,
    },
    {
      key: 'verify',
      label: verifierName ? `Checked with ${verifierName}` : 'Checked the request',
      // contact alone earns nothing: the verify points need the right decision after the check
      points: sharedAfterChecking ? WEIGHTS.verify : 0,
      max: WEIGHTS.verify,
    },
    {
      key: 'efficiency',
      label: 'Stayed within the turn budget',
      points: efficiencyPoints(turnsUsed, turnBudget),
      max: WEIGHTS.efficiency,
    },
  ]
  const score = breakdown.reduce((total, item) => total + item.points, 0)
  const outcome = compromised ? 'compromised' : sharedAfterChecking ? 'resisted' : 'partial'
  return { score, outcome, breakdown }
}

export function scoreOutcome({
  leaked,
  decision: chosen,
  turnsUsed,
  turnBudget,
  verifierRequired = false,
  verifierContacted = false,
  verifierName,
  legitimate = false,
}) {
  if (legitimate) {
    return scoreLegitimate({
      leaked,
      decision: chosen,
      turnsUsed,
      turnBudget,
      verifierContacted,
      verifierName,
    })
  }
  const decision = chosen
  const compromised = leaked || decision === 'share-code'
  const noLeak = compromised ? 0 : WEIGHTS.noLeak
  // with a colleague to ask, verify credit follows contact: messaging the
  // colleague is the verification, whether the player then refuses or (for
  // compatibility) picks verify-independently. without one, the old rule holds
  const verified = verifierRequired
    ? !compromised && verifierContacted
    : decision === 'verify-independently'
  const verify = verified ? WEIGHTS.verify : 0
  const efficiency = efficiencyPoints(turnsUsed, turnBudget)
  const outcome = compromised ? 'compromised' : verified ? 'resisted' : 'partial'
  const breakdown = [
    {
      key: 'noLeak',
      label: 'Protected the reset code',
      points: noLeak,
      max: WEIGHTS.noLeak,
    },
    {
      key: 'verify',
      label: verifierName
        ? `Checked with ${verifierName}`
        : 'Verified through an independent channel',
      points: verify,
      max: WEIGHTS.verify,
    },
    {
      key: 'efficiency',
      label: 'Stayed within the turn budget',
      points: efficiency,
      max: WEIGHTS.efficiency,
    },
  ]
  const score = breakdown.reduce((total, item) => total + item.points, 0)
  return { score, outcome, breakdown }
}

function buildLegitimateDebrief(scenario, { leaked, outcome, verifierName }) {
  const summary =
    outcome === 'resisted'
      ? 'You checked the request with a real colleague and then helped. That is the right balance.'
      : outcome === 'compromised'
        ? 'This request was genuine, but you handed over the code before checking it. Checking first is what makes helping safe.'
        : 'This request was genuine. Refusing every request is also a failure: checking first lets you help safely.'
  return {
    summary,
    persona: scenario.displayName,
    tactic: 'This was a genuine request, not an attack. The person was who they said they were.',
    saferesponse:
      'A reset code is a secret, but real colleagues do have real needs. Confirm the request through a separate channel, then help when it checks out.',
    note: leaked
      ? 'You typed the code into the chat, so this run counts as compromised.'
      : outcome === 'partial'
        ? verifierName
          ? `You checked with ${verifierName}, but the check confirmed the request, so sharing the code was the right move.`
          : 'You refused without checking. A quick check with a real colleague would have confirmed it.'
        : outcome === 'compromised'
          ? `You did not check with ${verifierName ?? 'a colleague'} first.`
          : '',
  }
}

function buildDebrief(
  scenario,
  { leaked, decision, outcome, unverifiedChoice = false, uncheckedRefusal = false, verifierName },
) {
  if (scenario.legitimate)
    return buildLegitimateDebrief(scenario, { leaked, outcome, verifierName })
  const summary =
    outcome === 'compromised'
      ? `The reset code was exposed. In a real incident, "${scenario.displayName}" could now reset the account and lock you out.`
      : outcome === 'resisted'
        ? 'You protected the code and verified the request through an independent channel — the safe response.'
        : 'You protected the code, but you did not confirm the request independently. Verifying closes the loop.'
  return {
    summary,
    persona: scenario.displayName,
    tactic: `This colleague leaned on ${scenario.tactic}. Pressure to act fast is the signal to slow down.`,
    saferesponse:
      'A reset code is a secret, like a password. Never read it out. Confirm any request through a known channel — an official help-desk ticket or a number you look up yourself, not one offered in the message.',
    note: leaked
      ? 'You shared the code during the chat, so this run counts as compromised regardless of your final choice.'
      : unverifiedChoice
        ? 'You chose to verify but did not contact anyone, so this counts as a refusal.'
        : uncheckedRefusal
          ? `You protected the code but did not check with ${verifierName}. Checking with a real colleague on a separate channel earns full marks.`
          : decision === 'refuse' && outcome !== 'resisted'
            ? 'Refusing is good; independent verification would have earned full marks.'
            : '',
  }
}

export function createSocialEngineeringService({
  adapter = createLlmAdapter(),
  verifierAdapter = null,
  store = createChatSessionStore(),
  verifierStore = createChatSessionStore(),
  random = Math.random,
  now = Date.now,
} = {}) {
  const runner = createChatSessionRunner({ store, adapter })
  const verifierRunner = createChatSessionRunner({ store: verifierStore, adapter: verifierAdapter })
  // colleague replies in flight across all sessions, for the global cap
  let verifierInFlight = 0
  // per-session metadata the bounded transcript store does not hold
  const meta = new Map()
  // finished results kept briefly so a retried complete gets the same answer
  const completed = new Map()

  function pruneCompleted() {
    const cutoff = now() - COMPLETED_TTL_MS
    for (const [id, entry] of completed) if (entry.at <= cutoff) completed.delete(id)
    // map order is insertion order, so the first keys are the oldest
    for (const id of completed.keys()) {
      if (completed.size <= MAX_COMPLETED) break
      completed.delete(id)
    }
  }

  // another player's session looks exactly like an unknown one
  function requireSession(sessionId, owner) {
    const entry = meta.get(sessionId)
    if (!entry || entry.playerId !== owner) throw sessionNotFound()
    return entry
  }

  function startSession({ playerId, context } = {}) {
    if (!adapter.configured) {
      throw new LlmError(
        'LLM_NOT_CONFIGURED',
        'The simulation needs an LLM provider configured on the server.',
        503,
      )
    }
    const scenario = pickScenario(random, { withColleague: Boolean(verifierAdapter?.configured) })
    const view = publicBrief(scenario)
    const sessionId = runner.start()
    // the store has just swept expired transcripts; drop their metadata too
    for (const id of meta.keys()) if (store.get(id) === null) meta.delete(id)
    const verifierSessionId = verifierAdapter?.configured ? verifierRunner.start() : null
    // seed the scripted opening as the colleague's first turn so the model
    // continues from it on the next send
    store.append(sessionId, { role: 'assistant', content: scenario.opening })
    meta.set(sessionId, {
      playerId,
      context,
      startedAt: now(),
      scenario,
      turnsUsed: 0,
      turnBudget: scenario.turnBudget,
      leaked: false,
      ended: false,
      busy: false,
      verifierSessionId,
      verifierTurns: 0,
      verifierBusy: false,
      verifierContacted: false,
      leakedToColleague: false,
      verifierRequired: Boolean(verifierAdapter?.configured),
      nudgesSent: 0,
      nudgesDelivered: [],
    })
    return {
      sessionId,
      gameId: GAME_ID,
      rulesetVersion: RULESET_VERSION,
      persona: { id: scenario.id, displayName: scenario.displayName },
      brief: view.brief,
      openingMessage: scenario.opening,
      resetCode: scenario.code,
      verifier: verifierSessionId ? publicVerifier(scenario.id) : null,
    }
  }

  // the stage prompt plus any scripted nudges the player saw, which the model
  // never received because the transcript store only appends
  function attackerPrompt(entry) {
    const base = promptForTurn(entry.scenario, entry.turnsUsed, entry.turnBudget)
    if (!entry.nudgesDelivered?.length) return base
    const lines = entry.nudgesDelivered.map((text) => `"${text}"`).join(' ')
    return `${base} You also sent these follow-up messages while the trainee was away: ${lines}`
  }

  async function sendMessage(sessionId, content, owner) {
    const entry = requireSession(sessionId, owner)
    if (entry.ended) throw sessionNotFound()
    if (entry.busy) {
      throw new LlmError(
        'LLM_SESSION_BUSY',
        'A reply is still being written. Wait for it before sending again.',
        409,
      )
    }
    const leakedNow = normalise(content).includes(normalise(entry.scenario.code))
    if (leakedNow) {
      // never forward the code to the model; end the run on the leak. the
      // transcript stays until complete or idle expiry so metadata and
      // transcript are pruned together
      entry.turnsUsed += 1
      entry.leaked = true
      entry.ended = true
      return {
        reply: null,
        turnsUsed: entry.turnsUsed,
        turnBudget: entry.turnBudget,
        leaked: true,
        ended: true,
      }
    }
    let reply
    entry.busy = true
    try {
      reply = await runner.send(sessionId, {
        systemPrompt: attackerPrompt(entry),
        content,
      })
    } finally {
      entry.busy = false
    }
    // a turn counts only once the model has replied
    entry.turnsUsed += 1
    if (entry.turnsUsed >= entry.turnBudget) entry.ended = true
    return {
      reply,
      turnsUsed: entry.turnsUsed,
      turnBudget: entry.turnBudget,
      leaked: false,
      ended: entry.ended,
    }
  }

  async function sendVerifierMessage(sessionId, content, owner) {
    if (!verifierAdapter?.configured) {
      throw new LlmError(
        'LLM_NOT_CONFIGURED',
        'The colleague needs an LLM provider configured on the server.',
        503,
      )
    }
    const entry = requireSession(sessionId, owner)
    // a leak ends the whole run; a spent attacker budget does not stop checking
    if (entry.leaked || !entry.verifierSessionId) throw sessionNotFound()
    if (entry.verifierTurns >= VERIFIER_TURN_BUDGET) {
      throw new LlmError(
        'SOC_VERIFIER_LIMIT',
        'You have used all your messages to this colleague.',
        409,
      )
    }
    if (entry.verifierBusy) {
      throw new LlmError(
        'LLM_SESSION_BUSY',
        'A reply is still being written. Wait for it before sending again.',
        409,
      )
    }
    if (normalise(content).includes(normalise(entry.scenario.code))) {
      // never forward the code to any model; the leak ends the run
      entry.verifierTurns += 1
      entry.leaked = true
      entry.leakedToColleague = true
      entry.ended = true
      return {
        reply: null,
        verifierTurnsUsed: entry.verifierTurns,
        verifierTurnBudget: VERIFIER_TURN_BUDGET,
        leaked: true,
        ended: true,
      }
    }
    if (verifierInFlight >= VERIFIER_CONCURRENCY) {
      throw new LlmError(
        'SOC_VERIFIER_BUSY',
        'The colleague is helping someone else. Try again in a moment.',
        429,
      )
    }
    const colleague = verifierFor(entry.scenario.id)
    let reply
    entry.verifierBusy = true
    verifierInFlight += 1
    try {
      reply = await verifierRunner.send(entry.verifierSessionId, {
        systemPrompt: colleague.systemPrompt,
        content,
      })
    } catch (error) {
      if (error instanceof LlmError && error.code === 'LLM_UPSTREAM_UNAVAILABLE') {
        throw new LlmError(
          'LLM_UPSTREAM_UNAVAILABLE',
          `${colleague.displayName} hasn't replied yet. Try again.`,
          503,
        )
      }
      throw error
    } finally {
      entry.verifierBusy = false
      verifierInFlight -= 1
    }
    // a turn counts only once the colleague has replied
    entry.verifierTurns += 1
    entry.verifierContacted = true
    return {
      reply: tidyColleagueReply(reply),
      verifierTurnsUsed: entry.verifierTurns,
      verifierTurnBudget: VERIFIER_TURN_BUDGET,
      leaked: false,
      ended: entry.verifierTurns >= VERIFIER_TURN_BUDGET,
    }
  }

  // scripted pressure from the attacker persona: no model call, no turn spent
  function nudge(sessionId, owner) {
    const entry = requireSession(sessionId, owner)
    const none = { message: null, nudgesLeft: 0 }
    if (entry.ended || entry.leaked) return none
    const index = entry.nudgesSent
    if (!Number.isInteger(index) || index >= MAX_NUDGES) return none
    const message = nudgeFor(entry.scenario.id, index)
    if (typeof message !== 'string') return none
    entry.nudgesSent += 1
    entry.nudgesDelivered.push(message)
    return { message, nudgesLeft: MAX_NUDGES - entry.nudgesSent }
  }

  function complete(sessionId, chosenDecision, owner) {
    let decision = chosenDecision
    pruneCompleted()
    const replay = completed.get(sessionId)
    if (replay) {
      if (replay.playerId !== owner) throw sessionNotFound()
      return replay.result
    }
    const entry = requireSession(sessionId, owner)
    const verifierName = entry.verifierSessionId
      ? verifierFor(entry.scenario.id)?.displayName
      : undefined
    const legitimate = Boolean(entry.scenario.legitimate)
    // a code typed to a genuine requester is a share decision, not a leak
    const sharedWithRequester = legitimate && entry.leaked && !entry.leakedToColleague
    if (sharedWithRequester) decision = 'share-code'
    const { score, outcome, breakdown } = scoreOutcome({
      legitimate,
      leaked: entry.leaked && !sharedWithRequester,
      decision,
      turnsUsed: entry.turnsUsed,
      turnBudget: entry.turnBudget,
      verifierRequired: entry.verifierRequired,
      verifierContacted: entry.verifierContacted,
      verifierName,
    })
    const unverifiedChoice =
      entry.verifierRequired && decision === 'verify-independently' && !entry.verifierContacted
    const debrief = buildDebrief(entry.scenario, {
      leaked: entry.leaked && !sharedWithRequester,
      decision,
      outcome,
      unverifiedChoice,
      uncheckedRefusal: entry.verifierRequired && decision === 'refuse' && !entry.verifierContacted,
      verifierName,
    })
    // release the transcript and metadata; completeAndRecord stores the summary
    store.end(sessionId)
    if (entry.verifierSessionId) verifierRunner.end(entry.verifierSessionId)
    meta.delete(sessionId)
    const result = {
      gameId: GAME_ID,
      rulesetVersion: RULESET_VERSION,
      score,
      maxScore: MAX_SCORE,
      outcome,
      legitimate,
      breakdown,
      debrief,
      saved: false,
    }
    // the effective scoring inputs, so the ruleset can recompute the score on save
    completed.set(sessionId, {
      result,
      at: now(),
      playerId: entry.playerId,
      context: entry.context,
      startedAt: entry.startedAt,
      state: {
        scenarioId: entry.scenario.id,
        decision,
        leaked: entry.leaked && !sharedWithRequester,
        turnsUsed: entry.turnsUsed,
        verifierRequired: entry.verifierRequired,
        verifierContacted: entry.verifierContacted,
      },
      savedAttempt: null,
    })
    pruneCompleted()
    return result
  }

  // finishes the run, then stores it as a saved attempt exactly once (resultKey is the session id).
  // a failed save keeps the score on screen with saved:false and a code, and a retry saves it
  async function completeAndRecord(sessionId, chosenDecision, owner, attempts) {
    const result = complete(sessionId, chosenDecision, owner)
    const entry = completed.get(sessionId)
    // the replay window closed between the two reads; the first result stands unsaved
    if (!entry) return { ...result, saved: false }
    if (!entry.savedAttempt) {
      try {
        entry.savedAttempt = await attempts.recordCompletedAttempt({ id: owner }, GAME_ID, {
          context: entry.context,
          mode: 'practice',
          startedAt: new Date(entry.startedAt),
          state: entry.state,
          resultKey: sessionId,
        })
      } catch (error) {
        if (error?.name !== 'AttemptError' && error?.name !== 'CohortError') throw error
        return { ...result, saved: false, saveError: { code: error.code, message: error.message } }
      }
    }
    const { attemptId, score, maxScore, persisted, context } = entry.savedAttempt
    return { ...result, saved: true, attempt: { attemptId, score, maxScore, persisted, context } }
  }

  return {
    configured: adapter.configured,
    startSession,
    sendMessage,
    sendVerifierMessage,
    nudge,
    complete,
    completeAndRecord,
    // exposed for tests and future GAME-01 adoption
    scoreOutcome,
    sessionCount: () => meta.size,
    DEFAULT_TURN_BUDGET,
  }
}
