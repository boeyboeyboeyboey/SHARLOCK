import { onBeforeUnmount, reactive } from 'vue'
import {
  MAX_EVENTS,
  MAX_FAILED_CONNECTS,
  MOVE_GAP_MS,
  closeDecision,
  reconnectDelay,
  tagUrl,
} from './tagRules.js'

const fresh = () => ({
  status: 'idle',
  blocked: '',
  sid: '',
  phase: '',
  phaseEndsAt: 0,
  offset: 0,
  roundMs: 0,
  sideWon: null,
  players: [],
  stations: [],
  you: null,
  events: [],
  results: null,
  saved: null,
})

// one websocket to a botnet tag round: keeps the latest snapshot, sends validated player actions, reconnects with backoff
// staff pass a cohortId and are joined to that class on open
export function createTagSocket({
  staff = false,
  getCohortId = () => '',
  onSessionEnded = () => {},
  WebSocketImpl = globalThis.WebSocket,
  now = () => Date.now(),
  url = tagUrl,
} = {}) {
  const state = reactive(fresh())
  let socket = null
  let retry = null
  let failures = 0
  let stopped = true
  let lastMoveAt = -Infinity

  const reset = () => Object.assign(state, fresh())

  function send(message) {
    if (socket?.readyState !== 1) return false
    socket.send(JSON.stringify(message))
    return true
  }

  function handleMessage(text) {
    let message
    try {
      message = JSON.parse(text)
    } catch {
      return
    }
    if (message?.type === 'snapshot' && Array.isArray(message.players)) {
      failures = 0
      const leavingResults = state.phase === 'results' && message.phase !== 'results'
      if (leavingResults) Object.assign(state, { results: null, saved: null, events: [] })
      Object.assign(state, {
        status: 'open',
        sid: message.sid ?? state.sid,
        phase: message.phase,
        phaseEndsAt: message.phaseEndsAt ?? 0,
        offset: typeof message.now === 'number' ? message.now - now() : state.offset,
        roundMs: message.roundMs ?? 0,
        sideWon: message.sideWon ?? null,
        players: message.players,
        stations: message.stations ?? [],
        you: message.you ?? null,
      })
    } else if (message?.type === 'events' && Array.isArray(message.events)) {
      state.events = [...state.events, ...message.events].slice(-MAX_EVENTS)
    } else if (message?.type === 'results' && Array.isArray(message.results)) {
      state.results = { sideWon: message.sideWon ?? null, rows: message.results }
    } else if (message?.type === 'saved') {
      state.saved = {
        saved: Boolean(message.saved),
        score: message.score ?? null,
        maxScore: message.maxScore ?? null,
      }
    }
  }

  function halt() {
    clearTimeout(retry)
    retry = null
    const old = socket
    socket = null
    if (old) {
      old.onopen = old.onmessage = old.onclose = old.onerror = null
      if (old.readyState <= 1) old.close(1000)
    }
  }

  function connect() {
    if (stopped || socket) return
    if (staff && !getCohortId()) return
    const mine = new WebSocketImpl(url())
    socket = mine
    state.status = failures ? 'reconnecting' : 'connecting'
    mine.onopen = () => {
      if (staff) send({ type: 'join', cohortId: getCohortId() })
    }
    mine.onmessage = (event) => handleMessage(event.data)
    mine.onerror = () => {}
    mine.onclose = (event) => {
      if (socket !== mine) return
      halt()
      const decision = closeDecision(event.code, staff)
      if (decision === 'retry') {
        if (failures < MAX_FAILED_CONNECTS) {
          state.status = 'reconnecting'
          retry = setTimeout(connect, reconnectDelay(failures))
          failures += 1
          return
        }
        stopped = true
        state.status = 'closed'
        state.blocked = 'failed'
        return
      }
      stopped = true
      state.status = 'closed'
      state.blocked = decision
      if (decision === 'ended') onSessionEnded(event.reason)
    }
  }

  function start() {
    stopped = false
    failures = 0
    state.blocked = ''
    connect()
  }

  // staff picked another class, or play again: drop the socket and join a fresh round
  function rejoin() {
    halt()
    reset()
    start()
  }

  function leave() {
    send({ type: 'leave' })
    stop()
    state.blocked = 'left'
  }

  function stop() {
    stopped = true
    halt()
    state.status = 'closed'
  }

  // moves go out at most 20 times a second
  function move({ x, z, yaw }) {
    const t = now()
    if (t - lastMoveAt < MOVE_GAP_MS) return false
    if (!send({ type: 'move', x, z, yaw })) return false
    lastMoveAt = t
    return true
  }

  return {
    state,
    start,
    stop,
    rejoin,
    leave,
    handleMessage,
    ready: (ready) => send({ type: 'ready', ready: Boolean(ready) }),
    sprint: () => send({ type: 'sprint' }),
    tag: (target) => send({ type: 'tag', target }),
    station: (id) => send({ type: 'station', id }),
    submit: (submission) => send({ type: 'submit', submission }),
    move,
  }
}

export function useTagSocket(options) {
  const tag = createTagSocket(options)
  onBeforeUnmount(() => tag.stop())
  return tag
}
