import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTagSocket } from '../useTagSocket.js'
import { closeDecision, formatClock, isUrgent, msUntil, tagUrl } from '../tagRules.js'

class FakeSocket {
  static all = []
  constructor(url) {
    this.url = url
    this.readyState = 0
    this.sent = []
    this.closedWith = null
    FakeSocket.all.push(this)
  }
  open() {
    this.readyState = 1
    this.onopen?.()
  }
  send(text) {
    this.sent.push(JSON.parse(text))
  }
  close(code) {
    this.closedWith = code
    this.readyState = 3
  }
  receive(message) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
  drop(code, reason = '') {
    this.readyState = 3
    this.onclose?.({ code, reason })
  }
}

const snapshot = (extra = {}) => ({
  type: 'snapshot',
  sid: 'me',
  phase: 'lobby',
  now: 10_000,
  phaseEndsAt: null,
  players: [{ sid: 'me', username: 'ada', ready: false }],
  stations: [],
  you: { patches: 0, tags: 0 },
  ...extra,
})

let clock
function make(options = {}) {
  const tag = createTagSocket({ WebSocketImpl: FakeSocket, now: () => clock, ...options })
  tag.start()
  const socket = FakeSocket.all.at(-1)
  socket.open()
  return { tag, socket }
}

beforeEach(() => {
  FakeSocket.all = []
  clock = 5_000
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('tag rules', () => {
  it('builds the socket url from the page location', () => {
    expect(tagUrl({ protocol: 'https:', host: 'example.test' })).toBe(
      'wss://example.test/api/botnet-tag',
    )
    expect(tagUrl({ protocol: 'http:', host: 'localhost:5173' })).toBe(
      'ws://localhost:5173/api/botnet-tag',
    )
  })
  it('maps close codes to what the page does next', () => {
    expect(closeDecision(4401)).toBe('ended')
    expect(closeDecision(4409)).toBe('superseded')
    expect(closeDecision(4403)).toBe('no-class')
    expect(closeDecision(4403, true)).toBe('stopped')
    expect(closeDecision(4408)).toBe('stopped')
    expect(closeDecision(1006)).toBe('retry')
  })
  it('formats clocks and finds the urgent window', () => {
    expect(formatClock(180_000)).toBe('3:00')
    expect(formatClock(29_001)).toBe('0:30')
    expect(isUrgent(30_000)).toBe(true)
    expect(isUrgent(30_001)).toBe(false)
    expect(isUrgent(0)).toBe(false)
    expect(msUntil(20_000, 5_000, 10_000)).toBe(5_000)
    expect(msUntil(1_000, 5_000, 0)).toBe(0)
  })
})

describe('tag socket', () => {
  it('keeps the latest snapshot and the server clock offset', () => {
    const { tag, socket } = make()
    socket.receive(snapshot())
    expect(tag.state.status).toBe('open')
    expect(tag.state.sid).toBe('me')
    expect(tag.state.phase).toBe('lobby')
    expect(tag.state.offset).toBe(5_000)
    expect(tag.state.players[0].username).toBe('ada')
  })

  it('collects events, results and the saved notice, and clears them for the next lobby', () => {
    const { tag, socket } = make()
    socket.receive(snapshot({ phase: 'results' }))
    socket.receive({ type: 'events', events: [{ type: 'tag', from: 'a', to: 'b' }] })
    socket.receive({ type: 'results', sideWon: 'botnet', results: [{ sid: 'me', score: 5 }] })
    socket.receive({ type: 'saved', saved: true, score: 5, maxScore: 400 })
    expect(tag.state.events).toHaveLength(1)
    expect(tag.state.results.sideWon).toBe('botnet')
    expect(tag.state.saved).toEqual({ saved: true, score: 5, maxScore: 400 })
    socket.receive(snapshot())
    expect(tag.state.results).toBeNull()
    expect(tag.state.saved).toBeNull()
    expect(tag.state.events).toEqual([])
  })

  it('ignores malformed frames', () => {
    const { tag, socket } = make()
    socket.onmessage({ data: 'not json' })
    socket.receive({ type: 'snapshot', players: 'x' })
    expect(tag.state.status).toBe('connecting')
  })

  it('sends the documented messages and throttles moves to 20 per second', () => {
    const { tag, socket } = make()
    tag.ready(true)
    tag.sprint()
    tag.tag('t1')
    tag.station('s1')
    tag.submit({ a: 1 })
    expect(socket.sent).toEqual([
      { type: 'ready', ready: true },
      { type: 'sprint' },
      { type: 'tag', target: 't1' },
      { type: 'station', id: 's1' },
      { type: 'submit', submission: { a: 1 } },
    ])
    socket.sent.length = 0
    expect(tag.move({ x: 1, z: 2, yaw: 0 })).toBe(true)
    clock += 20
    expect(tag.move({ x: 2, z: 2, yaw: 0 })).toBe(false)
    clock += 30
    expect(tag.move({ x: 3, z: 2, yaw: 0 })).toBe(true)
    expect(socket.sent.map((m) => m.x)).toEqual([1, 3])
  })

  it('does not send before the socket is open', () => {
    const tag = createTagSocket({ WebSocketImpl: FakeSocket, now: () => clock })
    tag.start()
    expect(tag.ready(true)).toBe(false)
    expect(FakeSocket.all[0].sent).toEqual([])
  })

  it('joins the chosen class first when staff', () => {
    const cohortId = 'a'.repeat(24)
    const { socket } = make({ staff: true, getCohortId: () => cohortId })
    expect(socket.sent).toEqual([{ type: 'join', cohortId }])
  })

  it('waits for a class before a staff socket opens', () => {
    const tag = createTagSocket({ staff: true, getCohortId: () => '', WebSocketImpl: FakeSocket })
    tag.start()
    expect(FakeSocket.all).toHaveLength(0)
  })

  it.each([
    [4401, 'ended'],
    [4403, 'no-class'],
    [4408, 'stopped'],
    [4409, 'superseded'],
  ])('stops without retrying on close %i', (code, blocked) => {
    const ended = vi.fn()
    const { tag, socket } = make({ onSessionEnded: ended })
    socket.drop(code, 'replaced')
    vi.advanceTimersByTime(60_000)
    expect(tag.state.blocked).toBe(blocked)
    expect(FakeSocket.all).toHaveLength(1)
    expect(ended).toHaveBeenCalledTimes(code === 4401 ? 1 : 0)
  })

  it('reconnects with backoff after an unexpected close and gives up after ten tries', () => {
    const { tag, socket } = make()
    socket.drop(1006)
    expect(tag.state.status).toBe('reconnecting')
    vi.advanceTimersByTime(1000)
    expect(FakeSocket.all).toHaveLength(2)
    for (let i = 0; i < 12; i += 1) {
      FakeSocket.all.at(-1).drop(1006)
      vi.advanceTimersByTime(30_000)
    }
    expect(tag.state.blocked).toBe('failed')
    const count = FakeSocket.all.length
    vi.advanceTimersByTime(120_000)
    expect(FakeSocket.all).toHaveLength(count)
  })

  it('closes quietly on leave and on stop', () => {
    const { tag, socket } = make()
    tag.leave()
    expect(socket.sent.at(-1)).toEqual({ type: 'leave' })
    expect(socket.closedWith).toBe(1000)
    expect(tag.state.blocked).toBe('left')
    vi.advanceTimersByTime(60_000)
    expect(FakeSocket.all).toHaveLength(1)
  })

  it('opens a fresh socket on rejoin and drops the old state', () => {
    const { tag, socket } = make()
    socket.receive(snapshot({ phase: 'results' }))
    tag.rejoin()
    expect(socket.closedWith).toBe(1000)
    expect(FakeSocket.all).toHaveLength(2)
    expect(tag.state.phase).toBe('')
  })
})
