import { onBeforeUnmount, watch } from 'vue'
import { listManagedCohorts } from '../../cohorts/api.js'
import {
  MAX_FAILED_CONNECTS,
  closeDecision,
  isMoving,
  reconnectDelay,
  shouldSendMove,
} from './rules.js'
import { resetRoster, usePresenceRoster } from './roster.js'

const TICK_MS = 110

export function presenceUrl(loc = globalThis.location) {
  return `${loc.protocol === 'https:' ? 'wss:' : 'ws:'}//${loc.host}/api/presence`
}

// one websocket to the class room: sends the player's moves, keeps the peer map, reconnects with backoff
// getPlayer() returns { x, z, heading } or null, onPeers(map) gets every change
export function createPresence({
  getPlayer,
  onPeers = () => {},
  staff = false,
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
    onPeers(peers)
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
    const next = { x: at.x, z: at.z, yaw: at.heading, moving: isMoving(sample, at) }
    sample = { x: at.x, z: at.z }
    const t = now()
    if (!shouldSendMove(last, next, t)) return
    last = { ...next, at: t }
    send({ type: 'move', ...next })
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

  function connect() {
    if (stopped || socket) return
    if (staff && !state.selectedCohortId) return
    const mine = new WebSocketImpl(url())
    room = state.selectedCohortId
    socket = mine
    mine.onopen = () => {
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
      const decision = closeDecision(event.code)
      if (decision === 'stop-quiet') {
        stopped = true
        state.active = false
      } else if (decision === 'stop') {
        stopped = true
        if (!staff) state.active = false
      } else if (failures < MAX_FAILED_CONNECTS) {
        retry = setTimeout(connect, reconnectDelay(failures))
        failures += 1
      }
    }
  }

  async function start() {
    stopped = false
    state.active = true
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
