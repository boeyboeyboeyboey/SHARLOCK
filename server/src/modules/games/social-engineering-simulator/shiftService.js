import crypto from 'node:crypto'
import { createLlmAdapter } from './llm/adapter.js'
import { createChatSessionStore } from './llm/chatSessionStore.js'
import { createChatSessionRunner } from './llm/chatSessionRunner.js'
import {
  CALLS_PER_SHIFT,
  createRng,
  generateCall,
  planShift,
  publicCallView,
  runDeskTool,
} from './callGenerator.js'
import { callerPrompt, colleaguePrompt } from './callPrompts.js'
import { createTokenBucket } from './limiter.js'
import { COMPLETED_TTL_MS, GAME_ID, MAX_COMPLETED, VERIFIER_CONCURRENCY } from './policy.js'
import {
  ATTACKER_TIMEOUT_MS,
  COLLEAGUE_ASKS_PER_CALL,
  COLLEAGUE_TIMEOUT_MS,
  HINT_PENALTY,
  MAX_MESSAGES_PER_CALL,
  MAX_SHIFTS,
  MAX_STRIKES,
  MODEL_MESSAGES_PER_CALL,
  SHIFT_IDLE_TTL_MS,
  SHIFT_RULESET_VERSION,
  shiftError,
  shiftNotFound,
} from './shiftPolicy.js'
import { SHIFT_MAX_SCORE, scoreShift } from './shiftScoring.js'
import {
  MAX_HINTS,
  MAX_NUDGES_PER_CALL,
  classifyIntent,
  colleagueLine,
  debriefFor,
  hintsFor,
  nudgeLine,
  openingLine,
  replyFor,
} from './scriptedLines.js'
import { normalise, tidyColleagueReply } from './service.js'

// rejects when the model does not answer in time; the late reply is simply ignored
function withDeadline(promise, ms) {
  let timer
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('deadline')), ms)
  })
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer))
}

const randomSeed = () => crypto.randomBytes(4).readUInt32BE()

function finishReasonFor(shift) {
  if (!shift.finished) return null
  return shift.strikes >= MAX_STRIKES ? 'strikes' : 'complete'
}

export function createShiftService({
  adapter = createLlmAdapter(),
  colleagueAdapter = null,
  limiter = createTokenBucket(),
  randomSeedFn = randomSeed,
  now = Date.now,
} = {}) {
  const callerStore = createChatSessionStore()
  const colleagueStore = createChatSessionStore()
  const callerRunner = createChatSessionRunner({ store: callerStore, adapter })
  const colleagueRunner = createChatSessionRunner({
    store: colleagueStore,
    adapter: colleagueAdapter,
  })
  const shifts = new Map()
  const completed = new Map()
  let colleagueInFlight = 0
  const aiCallers = Boolean(adapter?.configured)
  const aiColleague = Boolean(colleagueAdapter?.configured)

  function sweep() {
    const cutoff = now() - SHIFT_IDLE_TTL_MS
    for (const [id, shift] of shifts) if (shift.lastActive <= cutoff) shifts.delete(id)
    // map order is insertion order, so the first keys are the oldest
    for (const id of shifts.keys()) {
      if (shifts.size <= MAX_SHIFTS) break
      shifts.delete(id)
    }
    const expired = now() - COMPLETED_TTL_MS
    for (const [id, entry] of completed) if (entry.at <= expired) completed.delete(id)
    for (const id of completed.keys()) {
      if (completed.size <= MAX_COMPLETED) break
      completed.delete(id)
    }
  }

  // another player's shift looks exactly like an unknown one
  function requireShift(shiftId, owner) {
    const shift = shifts.get(shiftId)
    if (!shift || shift.playerId !== owner) throw shiftNotFound()
    shift.lastActive = now()
    return shift
  }

  function requireOpenCall(shift) {
    if (shift.callState.status !== 'open') {
      throw shiftError('SOC_CALL_RESOLVED', 'This call is over. Move on to the next one.')
    }
    return shift.callState
  }

  function guardBusy(shift) {
    if (shift.busy) {
      throw shiftError(
        'SOC_BUSY',
        'A reply is still being written. Wait for it before sending again.',
      )
    }
  }

  function status(shift) {
    return {
      callIndex: shift.callIndex,
      callsTotal: CALLS_PER_SHIFT,
      strikes: shift.strikes,
      maxStrikes: MAX_STRIKES,
      finished: shift.finished,
    }
  }

  function callView(callState) {
    const { call } = callState
    return {
      ...publicCallView(call),
      openingMessage: callState.opening,
      colleague: { displayName: call.colleague.name, role: call.colleague.role },
      limits: {
        messages: MAX_MESSAGES_PER_CALL,
        colleagueAsks: COLLEAGUE_ASKS_PER_CALL,
        hints: MAX_HINTS,
        nudges: MAX_NUDGES_PER_CALL,
        hintPenalty: HINT_PENALTY,
      },
    }
  }

  function newCall(shift, index) {
    let call
    do {
      call = generateCall({ seed: randomSeedFn(), index, genuine: shift.plan[index] })
    } while (shift.usedCodes.has(call.secret.code))
    shift.usedCodes.add(call.secret.code)
    const opening = openingLine(call, createRng(call.seed ^ 0x9e3779b9).next)
    shift.callIndex = index
    shift.callState = {
      call,
      opening,
      status: 'open',
      transcript: [{ from: 'caller', text: opening }],
      messages: 0,
      modelMessages: 0,
      scriptedReplies: 0,
      colleagueAsks: 0,
      nudges: 0,
      hints: 0,
      tools: new Map(),
      chatId: null,
      colleagueChatId: null,
    }
    return callView(shift.callState)
  }

  function startShift({ playerId, context } = {}) {
    sweep()
    const id = crypto.randomUUID()
    const shift = {
      id,
      playerId,
      context,
      startedAt: now(),
      lastActive: now(),
      plan: planShift(createRng(randomSeedFn())),
      usedCodes: new Set(),
      callIndex: 0,
      callState: null,
      results: [],
      strikes: 0,
      finished: false,
      busy: false,
    }
    shifts.set(id, shift)
    const call = newCall(shift, 0)
    return {
      shiftId: id,
      gameId: GAME_ID,
      rulesetVersion: SHIFT_RULESET_VERSION,
      mode: aiCallers ? 'ai' : 'scripted',
      colleagueMode: aiColleague ? 'ai' : 'scripted',
      ...status(shift),
      call,
    }
  }

  // ends the call, scores it and decides whether the shift is over
  function resolveCall(shift, { decision, leaked }) {
    const callState = shift.callState
    const { call } = callState
    shift.results.push({
      genuine: call.genuine,
      callbackViable: call.callbackViable,
      decision: leaked ? 'none' : decision,
      leaked,
      verified: callState.tools.size > 0 || callState.colleagueAsks > 0,
      messagesUsed: callState.messages,
      hints: callState.hints,
    })
    const scored = scoreShift(shift.results)
    const result = scored.calls.at(-1)
    shift.strikes = scored.strikes
    callState.status = 'resolved'
    if (callState.chatId) callerRunner.end(callState.chatId)
    if (callState.colleagueChatId) colleagueRunner.end(callState.colleagueChatId)
    shift.finished = shift.strikes >= MAX_STRIKES || shift.callIndex >= CALLS_PER_SHIFT - 1
    return {
      resolved: true,
      leaked,
      decision: leaked ? 'none' : decision,
      genuine: call.genuine,
      correct: result.correct,
      score: result.score,
      breakdown: result.breakdown,
      streak: result.streak,
      streakBonus: result.bonus,
      debrief: debriefFor(call, { scriptedReplies: callState.scriptedReplies }),
      ...status(shift),
      finishReason: finishReasonFor(shift),
    }
  }

  function withModel(runner, chatId, systemPrompt, content, timeoutMs) {
    return withDeadline(runner.send(chatId, { systemPrompt, content }), timeoutMs)
  }

  // a model reply when the limiter and provider allow it, otherwise the scripted line
  async function callerReply(callState, content) {
    const { call } = callState
    if (aiCallers && callState.modelMessages < MODEL_MESSAGES_PER_CALL && limiter.take()) {
      try {
        if (!callState.chatId) {
          callState.chatId = callerRunner.start()
          callerStore.append(callState.chatId, { role: 'assistant', content: callState.opening })
        }
        const reply = await withModel(
          callerRunner,
          callState.chatId,
          callerPrompt(call),
          content,
          ATTACKER_TIMEOUT_MS,
        )
        callState.modelMessages += 1
        return { text: tidyColleagueReply(reply), mode: 'model' }
      } catch {
        // limiter, 429, 503, timeout and provider errors all fall back to the script
      }
    }
    callState.scriptedReplies += 1
    const text = replyFor(call, classifyIntent(content), callState.scriptedReplies - 1)
    return { text, mode: 'scripted' }
  }

  async function sendMessage(shiftId, content, owner) {
    const shift = requireShift(shiftId, owner)
    const callState = requireOpenCall(shift)
    guardBusy(shift)
    if (callState.messages >= MAX_MESSAGES_PER_CALL) {
      throw shiftError('SOC_MESSAGE_LIMIT', 'You have used all your messages on this call.')
    }
    callState.messages += 1
    callState.transcript.push({ from: 'player', text: content })
    // a typed code ends the call at once and is never forwarded to any model
    if (normalise(content).includes(normalise(callState.call.secret.code))) {
      return { reply: null, ...resolveCall(shift, { decision: 'none', leaked: true }) }
    }
    shift.busy = true
    try {
      const reply = await callerReply(callState, content)
      callState.transcript.push({ from: 'caller', text: reply.text })
      return {
        reply: reply.text,
        replyMode: reply.mode,
        messagesUsed: callState.messages,
        messagesLeft: MAX_MESSAGES_PER_CALL - callState.messages,
        resolved: false,
        leaked: false,
        ...status(shift),
      }
    } finally {
      shift.busy = false
    }
  }

  async function colleagueReply(callState, content) {
    const { call } = callState
    if (aiColleague && colleagueInFlight < VERIFIER_CONCURRENCY) {
      colleagueInFlight += 1
      try {
        if (!callState.colleagueChatId) callState.colleagueChatId = colleagueRunner.start()
        const reply = await withModel(
          colleagueRunner,
          callState.colleagueChatId,
          colleaguePrompt(call),
          content,
          COLLEAGUE_TIMEOUT_MS,
        )
        return { text: tidyColleagueReply(reply), mode: 'model' }
      } catch {
        // a slow or offline colleague falls back to the seeded facts
      } finally {
        colleagueInFlight -= 1
      }
    }
    return { text: colleagueLine(call, content), mode: 'scripted' }
  }

  async function askColleague(shiftId, content, owner) {
    const shift = requireShift(shiftId, owner)
    const callState = requireOpenCall(shift)
    guardBusy(shift)
    if (callState.colleagueAsks >= COLLEAGUE_ASKS_PER_CALL) {
      throw shiftError('SOC_COLLEAGUE_LIMIT', 'You have used all your questions to this colleague.')
    }
    if (normalise(content).includes(normalise(callState.call.secret.code))) {
      callState.colleagueAsks += 1
      return { reply: null, ...resolveCall(shift, { decision: 'none', leaked: true }) }
    }
    shift.busy = true
    try {
      const reply = await colleagueReply(callState, content)
      callState.colleagueAsks += 1
      return {
        reply: reply.text,
        replyMode: reply.mode,
        asksUsed: callState.colleagueAsks,
        asksLeft: COLLEAGUE_ASKS_PER_CALL - callState.colleagueAsks,
        resolved: false,
        leaked: false,
      }
    } finally {
      shift.busy = false
    }
  }

  // a desk tool returns the same seeded facts every time, with no model call
  function useTool(shiftId, tool, owner) {
    const shift = requireShift(shiftId, owner)
    const callState = requireOpenCall(shift)
    if (!callState.tools.has(tool)) callState.tools.set(tool, runDeskTool(callState.call, tool))
    return { ...callState.tools.get(tool), toolsUsed: [...callState.tools.keys()] }
  }

  function hint(shiftId, owner) {
    const shift = requireShift(shiftId, owner)
    const callState = requireOpenCall(shift)
    if (callState.hints >= MAX_HINTS) {
      throw shiftError('SOC_HINT_LIMIT', 'Sharlock has no more hints for this call.')
    }
    const text = hintsFor(callState.call)[callState.hints]
    callState.hints += 1
    return {
      hint: text,
      hintsUsed: callState.hints,
      hintsLeft: MAX_HINTS - callState.hints,
      penalty: HINT_PENALTY,
    }
  }

  function nudge(shiftId, owner) {
    const shift = requireShift(shiftId, owner)
    const callState = requireOpenCall(shift)
    if (callState.nudges >= MAX_NUDGES_PER_CALL) return { message: null, nudgesLeft: 0 }
    const message = nudgeLine(callState.call, callState.nudges)
    callState.nudges += 1
    callState.transcript.push({ from: 'caller', text: message })
    return { message, nudgesLeft: MAX_NUDGES_PER_CALL - callState.nudges }
  }

  function decide(shiftId, decision, owner) {
    const shift = requireShift(shiftId, owner)
    requireOpenCall(shift)
    guardBusy(shift)
    return resolveCall(shift, { decision, leaked: false })
  }

  function nextCall(shiftId, owner) {
    const shift = requireShift(shiftId, owner)
    if (shift.callState.status === 'open') {
      throw shiftError('SOC_CALL_OPEN', 'Decide what to do on this call first.')
    }
    if (shift.finished) {
      throw shiftError('SOC_SHIFT_FINISHED', 'The shift is over. Collect your result.')
    }
    const call = newCall(shift, shift.callIndex + 1)
    return { ...status(shift), call }
  }

  function summarise(shift) {
    const scored = scoreShift(shift.results)
    return {
      gameId: GAME_ID,
      rulesetVersion: SHIFT_RULESET_VERSION,
      mode: aiCallers ? 'ai' : 'scripted',
      score: scored.score,
      maxScore: SHIFT_MAX_SCORE,
      outcome: scored.outcome,
      strikes: scored.strikes,
      streakBonus: scored.bonus,
      endedEarly: shift.strikes >= MAX_STRIKES && shift.results.length < CALLS_PER_SHIFT,
      calls: scored.calls.map((result, index) => ({
        score: result.score,
        correct: result.correct,
        strike: result.strike,
        genuine: shift.results[index].genuine,
        decision: shift.results[index].decision,
      })),
      saved: false,
    }
  }

  // finishes the shift, then stores it as a saved attempt exactly once (resultKey is the shift id)
  // a failed save keeps the score on screen with saved:false and a code, and a retry saves it
  async function completeAndRecord(shiftId, owner, attempts) {
    sweep()
    let entry = completed.get(shiftId)
    if (entry && entry.playerId !== owner) throw shiftNotFound()
    if (!entry) {
      const shift = requireShift(shiftId, owner)
      if (!shift.finished) {
        throw shiftError(
          'SOC_SHIFT_NOT_FINISHED',
          'Finish every call before collecting the result.',
        )
      }
      entry = {
        at: now(),
        playerId: owner,
        result: summarise(shift),
        context: shift.context,
        startedAt: shift.startedAt,
        state: { calls: shift.results.map((input) => ({ ...input })) },
        savedAttempt: null,
      }
      completed.set(shiftId, entry)
      shifts.delete(shiftId)
    }
    if (!entry.savedAttempt) {
      try {
        entry.savedAttempt = await attempts.recordCompletedAttempt({ id: owner }, GAME_ID, {
          context: entry.context,
          mode: 'practice',
          startedAt: new Date(entry.startedAt),
          state: entry.state,
          resultKey: shiftId,
        })
      } catch (error) {
        if (error?.name !== 'AttemptError' && error?.name !== 'CohortError') throw error
        const saveError = { code: error.code, message: error.message }
        return { ...entry.result, saved: false, saveError }
      }
    }
    const { attemptId, score, maxScore, persisted, context } = entry.savedAttempt
    return {
      ...entry.result,
      saved: true,
      attempt: { attemptId, score, maxScore, persisted, context },
    }
  }

  return {
    mode: aiCallers ? 'ai' : 'scripted',
    startShift,
    sendMessage,
    askColleague,
    useTool,
    hint,
    nudge,
    decide,
    nextCall,
    completeAndRecord,
    shiftCount: () => shifts.size,
  }
}
