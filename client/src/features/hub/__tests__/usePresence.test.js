import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPresence, presenceUrl } from '../presence/usePresence.js'
import { resetRoster, usePresenceRoster } from '../presence/roster.js'

class FakeSocket {
  static all = []
  constructor(url) {
    this.url = url
    this.readyState = 0
    this.sent = []
    FakeSocket.all.push(this)
  }
  send(text) {
    this.sent.push(JSON.parse(text))
  }
  close(code) {
    this.readyState = 3
    this.closedWith = code
  }
  open() {
    this.readyState = 1
    this.onopen?.()
  }
  say(message) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
  drop(code, reason = '') {
    this.readyState = 3
    this.onclose?.({ code, reason })
  }
}

let clock
const player = { x: 0, z: 0, heading: 0 }
const make = (over = {}) => {
  const onPeers = vi.fn()
  const presence = createPresence({
    getPlayer: () => player,
    onPeers,
    WebSocketImpl: FakeSocket,
    now: () => clock,
    url: () => 'ws://x/api/presence',
    ...over,
  })
  return { presence, onPeers }
}
const peer = (sid, over = {}) => ({
  type: 'state',
  sid,
  username: sid,
  role: 'student',
  x: 1,
  z: 2,
  yaw: 0,
  moving: false,
  look: {},
  ...over,
})

beforeEach(() => {
  vi.useFakeTimers()
  clock = 0
  FakeSocket.all = []
  Object.assign(player, { x: 0, z: 0, heading: 0 })
  resetRoster()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('presence connection', () => {
  it('derives the websocket url from the page', () => {
    expect(presenceUrl({ protocol: 'https:', host: 'a.test' })).toBe('wss://a.test/api/presence')
    expect(presenceUrl({ protocol: 'http:', host: 'localhost:5173' })).toBe(
      'ws://localhost:5173/api/presence',
    )
  })

  it('keeps peers from snapshot, state and leave, and ignores itself and bad input', async () => {
    const { presence, onPeers } = make()
    await presence.start()
    const socket = FakeSocket.all[0]
    socket.open()
    socket.say({ type: 'snapshot', you: 'me', peers: [peer('a'), peer('me')] })
    expect([...presence.peers.keys()]).toEqual(['a'])
    socket.say(peer('b', { username: 'bee', role: 'staff' }))
    socket.say(peer('a', { x: 9 }))
    expect(presence.peers.get('a').x).toBe(9)
    expect(usePresenceRoster().state.peers.map((p) => p.username)).toEqual(['a', 'bee'])
    expect(usePresenceRoster().state.peers[1].staff).toBe(true)
    socket.onmessage({ data: 'not json' })
    socket.say({ type: 'nope' })
    socket.say({ type: 'leave', sid: 'a' })
    expect([...presence.peers.keys()]).toEqual(['b'])
    expect(onPeers).toHaveBeenLastCalledWith(presence.peers)
    presence.stop()
  })

  it('sends moves only when something changed, and a keepalive each second', async () => {
    const a2 = make()
    await a2.presence.start()
    const s2 = FakeSocket.all[0]
    s2.open()
    const tick = (ms) => {
      clock += ms
      vi.advanceTimersByTime(ms)
    }
    tick(110)
    expect(s2.sent.filter((m) => m.type === 'move')).toHaveLength(1)
    tick(110)
    tick(110)
    expect(s2.sent.filter((m) => m.type === 'move')).toHaveLength(1)
    player.x = 3
    tick(110)
    const sent = s2.sent.filter((m) => m.type === 'move')
    expect(sent).toHaveLength(2)
    expect(sent[1]).toMatchObject({ x: 3, moving: true })
    tick(110)
    expect(s2.sent.filter((m) => m.type === 'move').at(-1)).toMatchObject({ moving: false })
    const before = s2.sent.length
    for (let i = 0; i < 10; i += 1) tick(110)
    expect(s2.sent.length).toBeGreaterThan(before)
    a2.presence.stop()
  })

  it('reconnects with backoff after an abnormal close and clears peers', async () => {
    const { presence } = make()
    await presence.start()
    FakeSocket.all[0].open()
    FakeSocket.all[0].say(peer('a'))
    FakeSocket.all[0].drop(1006)
    expect(presence.peers.size).toBe(0)
    expect(FakeSocket.all).toHaveLength(1)
    vi.advanceTimersByTime(1000)
    expect(FakeSocket.all).toHaveLength(2)
    FakeSocket.all[1].drop(1006)
    vi.advanceTimersByTime(1999)
    expect(FakeSocket.all).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(FakeSocket.all).toHaveLength(3)
    presence.stop()
  })

  it.each([4401, 4403, 4408, 4409])('does not reconnect after %i', async (code) => {
    const { presence } = make({
      staff: code === 4403,
      loadClasses: async () => [{ cohortId: 'c1' }],
    })
    await presence.start()
    FakeSocket.all[0].open()
    FakeSocket.all[0].drop(code)
    vi.advanceTimersByTime(60000)
    expect(FakeSocket.all).toHaveLength(1)
    expect(usePresenceRoster().state.active).toBe(code === 4403)
  })

  it('retries a student with no class every 60 s, up to 10 times', async () => {
    const { presence } = make()
    await presence.start()
    for (let n = 1; n <= 10; n += 1) {
      FakeSocket.all.at(-1).open()
      FakeSocket.all.at(-1).drop(4403)
      vi.advanceTimersByTime(59000)
      expect(FakeSocket.all).toHaveLength(n)
      vi.advanceTimersByTime(1000)
      expect(FakeSocket.all).toHaveLength(n + 1)
    }
    FakeSocket.all.at(-1).open()
    FakeSocket.all.at(-1).drop(4403)
    vi.advanceTimersByTime(600000)
    expect(FakeSocket.all).toHaveLength(11)
    presence.stop()
  })

  it('joins after a slow retry once the student has a class', async () => {
    const { presence } = make()
    await presence.start()
    FakeSocket.all[0].open()
    FakeSocket.all[0].drop(4403)
    vi.advanceTimersByTime(60000)
    FakeSocket.all[1].open()
    FakeSocket.all[1].say({ type: 'snapshot', you: 'me', peers: [peer('a')] })
    expect(usePresenceRoster().state.active).toBe(true)
    expect(presence.peers.size).toBe(1)
    presence.stop()
  })

  it('stops quietly on 4409 and flags the tab notice', async () => {
    const onSessionEnded = vi.fn()
    const { presence } = make({ onSessionEnded })
    await presence.start()
    FakeSocket.all[0].open()
    FakeSocket.all[0].drop(4409, 'superseded')
    vi.advanceTimersByTime(120000)
    expect(FakeSocket.all).toHaveLength(1)
    expect(onSessionEnded).not.toHaveBeenCalled()
    expect(usePresenceRoster().state.superseded).toBe(true)
  })

  it('calls onSessionEnded on 4401 only', async () => {
    const onSessionEnded = vi.fn()
    const { presence } = make({ onSessionEnded })
    await presence.start()
    FakeSocket.all[0].open()
    FakeSocket.all[0].drop(4403)
    expect(onSessionEnded).not.toHaveBeenCalled()
    presence.stop()
    FakeSocket.all.length = 0
    const second = make({ onSessionEnded })
    await second.presence.start()
    FakeSocket.all[0].open()
    FakeSocket.all[0].drop(4401, 'replaced')
    expect(onSessionEnded).toHaveBeenCalledWith('replaced')
  })

  it('closes cleanly and stops timers on stop', async () => {
    const { presence } = make()
    await presence.start()
    const socket = FakeSocket.all[0]
    socket.open()
    presence.stop()
    expect(socket.closedWith).toBe(1000)
    const sent = socket.sent.length
    vi.advanceTimersByTime(5000)
    expect(socket.sent.length).toBe(sent)
    expect(usePresenceRoster().state.active).toBe(false)
  })

  it('has staff join the chosen class first and rejoin on a switch', async () => {
    const classes = [
      { cohortId: 'c1', cohortName: 'One' },
      { cohortId: 'c2', cohortName: 'Two' },
    ]
    const { presence } = make({ staff: true, loadClasses: async () => classes })
    await presence.start()
    const { state } = usePresenceRoster()
    expect(state.selectedCohortId).toBe('c1')
    FakeSocket.all[0].open()
    expect(FakeSocket.all[0].sent[0]).toEqual({ type: 'join', cohortId: 'c1' })
    state.selectedCohortId = 'c2'
    presence.switchClass()
    expect(FakeSocket.all[0].closedWith).toBe(1000)
    FakeSocket.all[1].open()
    expect(FakeSocket.all[1].sent[0]).toEqual({ type: 'join', cohortId: 'c2' })
    presence.stop()
  })

  it('does not connect for staff with no classes', async () => {
    const { presence } = make({ staff: true, loadClasses: async () => [] })
    await presence.start()
    expect(FakeSocket.all).toHaveLength(0)
    presence.stop()
  })
})

describe('presence 2d mode', () => {
  it('sends 2d moves and hands only 2d peers to the town while the roster counts everyone', async () => {
    const flat = { x: 120, y: 340 }
    const { presence, onPeers } = make({ mode: '2d', getPlayer: () => flat })
    await presence.start()
    const socket = FakeSocket.all[0]
    socket.open()
    clock += 110
    vi.advanceTimersByTime(110)
    expect(socket.sent.find((m) => m.type === 'move')).toEqual({
      type: 'move',
      mode: '2d',
      x: 120,
      y: 340,
      moving: false,
    })
    socket.say({
      type: 'snapshot',
      you: 'me',
      peers: [
        peer('flat', { mode: '2d', x: 5, y: 6, z: undefined }),
        peer('deep', { mode: '3d' }),
        peer('old'),
      ],
    })
    expect([...onPeers.mock.lastCall[0].keys()]).toEqual(['flat'])
    expect(usePresenceRoster().state.peers).toHaveLength(3)
    presence.stop()
  })

  it('a 3d client ignores 2d peers in what it draws', async () => {
    const { presence, onPeers } = make()
    await presence.start()
    FakeSocket.all[0].open()
    FakeSocket.all[0].say({
      type: 'snapshot',
      you: 'me',
      peers: [peer('flat', { mode: '2d' }), peer('deep', { mode: '3d' })],
    })
    expect([...onPeers.mock.lastCall[0].keys()]).toEqual(['deep'])
    expect(usePresenceRoster().count.value).toBe(2)
    presence.stop()
  })
})
