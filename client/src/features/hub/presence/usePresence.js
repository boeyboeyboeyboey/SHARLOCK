import { onBeforeUnmount, watch } from 'vue'
import { listManagedCohorts } from '../../cohorts/api.js'
import {
  MAX_FAILED_CONNECTS,
  MAX_NO_CLASS_RETRIES,
  NO_CLASS_RETRY_MS,
  closeDecision,
  isMoving,
  reconnectDelay,
  shouldSendMove,
} from './rules.js'
import { resetRoster, usePresenceRoster } from './roster.js'

const TICK_MS = 110

// an old or 3d message has no mode
const sameMode = (peer, mode) => (peer.mode ?? '3d') === mode

export function presenceUrl(loc = globalThis.location) {
  return `${loc.protocol === 'https:' ? 'wss:' : 'ws:'}//${loc.host}/api/presence`
}

// ends the local session and moves to the login notice. a refused socket arrives after the session check already
// cleared the identity; a sign-out in progress has no recorded end, so it stays where it is
export function endSessionFromPresence(auth, router, reason) {
  if (auth?.status !== 'authenticated' && !auth?.sessionEnd) return
  const replaced = reason === 'replaced' || auth.sessionEnd === 'elsewhere'
  const notice = replaced ? 'elsewhere' : 'expired'
  if (auth.status === 'authenticated') auth.invalidateSession(notice)
  void router?.replace({ path: '/login', query: { reason: notice } }).catch(() => {})
}

// one websocket to the class room: sends the player's moves, keeps the peer map, reconnects with backoff
// getPlayer() returns { x, z, heading } (3d) or { x, y } (2d) or null, onPeers(map) gets every same-mode change
// the roster counts every classmate online; the peer map only holds those in the same mode as this client
export function createPresence({
  getPlayer,
  mode = '3d',
  onPeers = () => {},
  staff = false,
  onSessionEnded = () => {},
  // resolves falsy once the session is gone; a socket refused at the handshake cannot say why itself
  checkSession = null,
  loadClasses = async () => (await listManagedCohorts({ limit: 50 })).cohorts ?? [],
  WebSocketImpl = globalThis.WebSocket,
  now = () => performance.now(),
  url = presenceUrl,
} = {}) {
  const { state } = usePresenceRoster()
  const peers = new Map()
  let socket = null
  let tick = null
  let retry = null
  let failures = 0
  let noClassTries = 0
  let last = null
  let sample = null
  let stopped = true
  let room = ''

  const roster = () => {
    state.peers = [...peers.values()]
      .map((p) => ({ sid: p.sid, username: p.username, staff: p.role === 'staff' }))
      .sort((a, b) => a.username.localeCompare(b.username))
  }
  const publish = () => {
    roster()
    onPeers(new Map([...peers].filter(([, peer]) => sameMode(peer, mode))))
  }
  const clearPeers = () => {
    if (!peers.size) return
    peers.clear()
    publish()
  }

  function send(message) {
    if (socket?.readyState === 1) socket.send(JSON.stringify(message))
  }

  function handleMessage(text) {
    let message
    try {
      message = JSON.parse(text)
    } catch {
      return
    }
    if (message?.type === 'snapshot' && Array.isArray(message.peers)) {
      noClassTries = 0
      state.active = true
      peers.clear()
      for (const peer of message.peers)
        if (peer?.sid && peer.sid !== message.you) peers.set(peer.sid, peer)
      publish()
    } else if (message?.type === 'state' && message.sid) {
      peers.set(message.sid, { ...peers.get(message.sid), ...message })
      publish()
    } else if (message?.type === 'leave' && message.sid) {
      if (peers.delete(message.sid)) publish()
    }
  }

  function step() {
    const at = getPlayer()
    if (!at) return
    const flat = mode === '2d'
    const z = flat ? at.y : at.z
    const next = {
      x: at.x,
      z,
      yaw: flat ? 0 : at.heading,
      moving: isMoving(sample, { x: at.x, z }),
    }
    sample = { x: at.x, z }
    const t = now()
    if (!shouldSendMove(last, next, t)) return
    last = { ...next, at: t }
    send(
      flat
        ? { type: 'move', mode: '2d', x: next.x, y: z, moving: next.moving }
        : { type: 'move', x: next.x, z, yaw: next.yaw, moving: next.moving },
    )
  }

  function halt() {
    clearInterval(tick)
    tick = null
    clearTimeout(retry)
    retry = null
    const old = socket
    socket = null
    if (old) {
      old.onopen = old.onmessage = old.onclose = old.onerror = null
      if (old.readyState <= 1) old.close(1000)
    }
    last = null
    sample = null
  }

  // a browser reports a refused handshake only as a failed connection, and a replaced or expired session is refused
  // that way once a student's retry or a reconnect comes round. asked only then, so an idle session is not kept alive
  async function askSession() {
    if (!checkSession) return
    let user
    try {
      user = await checkSession()
    } catch {
      // an unreachable server says nothing about the session
      return
    }
    if (user || stopped) return
    stopped = true
    halt()
    clearPeers()
    state.active = false
    onSessionEnded('')
  }

  function connect() {
    if (stopped || socket) return
    if (staff && !state.selectedCohortId) return
    const mine = new WebSocketImpl(url())
    let opened = false
    room = state.selectedCohortId
    socket = mine
    mine.onopen = () => {
      opened = true
      failures = 0
      if (staff) send({ type: 'join', cohortId: state.selectedCohortId })
      tick = setInterval(step, TICK_MS)
    }
    mine.onmessage = (event) => handleMessage(event.data)
    mine.onerror = () => {}
    mine.onclose = (event) => {
      if (socket !== mine) return
      halt()
      clearPeers()
      const decision = closeDecision(event.code, staff)
      if (decision === 'stop-quiet') {
        stopped = true
        state.active = false
        onSessionEnded(event.reason)
      } else if (decision === 'superseded') {
        stopped = true
        state.active = false
        state.superseded = true
      } else if (decision === 'slow-retry') {
        state.active = false
        if (noClassTries < MAX_NO_CLASS_RETRIES) {
          retry = setTimeout(connect, NO_CLASS_RETRY_MS)
          noClassTries += 1
        } else stopped = true
      } else if (decision === 'stop') {
        stopped = true
        if (!staff) state.active = false
      } else if (decision === 'retry') {
        if (failures < MAX_FAILED_CONNECTS) {
          retry = setTimeout(connect, reconnectDelay(failures))
          failures += 1
        }
        if (!opened) void askSession()
      }
    }
  }

  async function start() {
    stopped = false
    state.active = true
    state.superseded = false
    noClassTries = 0
    state.staff = staff
    if (staff) {
      try {
        state.classes = await loadClasses()
      } catch {
        state.classes = []
      }
      if (stopped) return
      if (!state.classes.some((c) => c.cohortId === state.selectedCohortId))
        state.selectedCohortId = state.classes[0]?.cohortId ?? ''
    }
    connect()
  }

  // staff pick another class: drop the socket and join again
  function switchClass() {
    if (stopped || (socket && room === state.selectedCohortId)) return
    halt()
    clearPeers()
    failures = 0
    connect()
  }

  function stop() {
    stopped = true
    halt()
    clearPeers()
    resetRoster()
  }

  return { start, stop, switchClass, handleMessage, peers }
}

export function usePresence(options) {
  const presence = createPresence(options)
  const { state } = usePresenceRoster()
  watch(
    () => state.selectedCohortId,
    () => presence.switchClass(),
  )
  onBeforeUnmount(() => presence.stop())
  return presence
}
