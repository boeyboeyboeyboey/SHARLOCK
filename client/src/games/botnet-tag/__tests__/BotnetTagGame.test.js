import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const device = vi.hoisted(() => ({ reasons: [] }))
vi.mock('../../../features/hub/deviceCheck.js', () => ({
  getDeviceCheck: () => ({ reasons: device.reasons }),
}))
vi.mock('../../../features/cohorts/api.js', () => ({
  listMemberships: vi.fn(async () => ({
    memberships: [{ status: 'active', cohortName: 'Class 1A' }],
  })),
  listManagedCohorts: vi.fn(async () => ({ cohorts: [] })),
}))

class FakeSocket {
  static all = []
  constructor() {
    this.readyState = 0
    this.sent = []
    FakeSocket.all.push(this)
  }
  send(text) {
    this.sent.push(JSON.parse(text))
  }
  close() {
    this.readyState = 3
  }
}

const { default: BotnetTagGame } = await import('../BotnetTagGame.vue')
const { useAuthStore } = await import('../../../features/auth/store.js')

const stubs = {
  ImmersiveControls: { template: '<div data-testid="controls" />' },
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
}

function mountGame() {
  return mount(BotnetTagGame, { global: { stubs, mocks: { $router: { push: vi.fn() } } } })
}

beforeEach(() => {
  setActivePinia(createPinia())
  useAuthStore().user = { globalRoles: ['student'], howToPlayDismissed: ['botnet-tag'] }
  FakeSocket.all = []
  vi.stubGlobal('WebSocket', FakeSocket)
  device.reasons = []
})

describe('botnet tag page', () => {
  it('opens how to play on a first visit and not after dismissal', async () => {
    const showModal = vi.fn(function open() {
      this.setAttribute('open', '')
    })
    HTMLDialogElement.prototype.showModal = showModal
    useAuthStore().user = { globalRoles: ['student'], howToPlayDismissed: [] }
    const first = mountGame()
    await flushPromises()
    expect(showModal).toHaveBeenCalledTimes(1)
    first.unmount()
    useAuthStore().user = { globalRoles: ['student'], howToPlayDismissed: ['botnet-tag'] }
    mountGame().unmount()
    expect(showModal).toHaveBeenCalledTimes(1)
  })

  it('blocks the game without webgl and never opens a socket', async () => {
    device.reasons = ['no-webgl2']
    const wrapper = mountGame()
    await flushPromises()
    expect(wrapper.get('[data-testid="tag-needs-3d"]').text()).toContain('Needs 3D')
    expect(FakeSocket.all).toHaveLength(0)
    expect(wrapper.find('[data-testid="tag-lobby"]').exists()).toBe(false)
  })

  it('is not blocked by a software renderer or the 2d setting', async () => {
    device.reasons = ['software-renderer']
    const wrapper = mountGame()
    await flushPromises()
    expect(wrapper.find('[data-testid="tag-needs-3d"]').exists()).toBe(false)
    expect(FakeSocket.all).toHaveLength(1)
  })

  it('shows the lobby with the player once the first snapshot arrives', async () => {
    const wrapper = mountGame()
    await flushPromises()
    const socket = FakeSocket.all[0]
    socket.readyState = 1
    socket.onopen()
    socket.onmessage({
      data: JSON.stringify({
        type: 'snapshot',
        sid: 'me',
        phase: 'lobby',
        now: Date.now(),
        phaseEndsAt: null,
        players: [{ sid: 'me', username: 'ada', avatarId: 'mint', ready: false }],
        stations: [],
        you: null,
      }),
    })
    await flushPromises()
    expect(wrapper.get('[data-testid="tag-player"]').text()).toContain('ada')
    expect(wrapper.get('[data-testid="tag-class"]').text()).toBe('Class 1A')
    expect(wrapper.get('[data-testid="tag-arena"]').exists()).toBe(true)
  })

  it('tells a student without a class to join one', async () => {
    const wrapper = mountGame()
    await flushPromises()
    FakeSocket.all[0].onclose({ code: 4403, reason: '' })
    await flushPromises()
    expect(wrapper.get('[data-testid="tag-notice"]').text()).toContain('Join a class first')
  })

  it('tells the player another tab took over', async () => {
    const wrapper = mountGame()
    await flushPromises()
    FakeSocket.all[0].onclose({ code: 4409, reason: '' })
    await flushPromises()
    expect(wrapper.get('[data-testid="tag-notice"]').text()).toContain('Open in another tab')
  })

  async function playing(players, stations = [], you = { lockedUntil: 0, puzzle: null }) {
    const wrapper = mountGame()
    await flushPromises()
    const socket = FakeSocket.all[0]
    socket.readyState = 1
    socket.onopen()
    socket.onmessage({
      data: JSON.stringify({
        type: 'snapshot',
        sid: 'me',
        phase: 'playing',
        now: Date.now(),
        phaseEndsAt: Date.now() + 180000,
        roundMs: 180000,
        players,
        stations,
        you,
      }),
    })
    await flushPromises()
    return { wrapper, socket }
  }
  const person = (extra) => ({
    username: 'p',
    x: 0,
    z: 0,
    infected: false,
    immuneUntil: 0,
    ...extra,
  })

  it('an infected player tags a clean player in reach by touching', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const { socket } = await playing([
        person({ sid: 'me', infected: true }),
        person({ sid: 'bot-1', x: 1, isBot: true }),
      ])
      await vi.advanceTimersByTimeAsync(300)
      expect(socket.sent).toContainEqual({ type: 'tag', target: 'bot-1' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('a clean player beside a ready station can use it with the prompt', async () => {
    const station = { id: 'st-patch', kind: 'patch', x: 1, z: 0, coolingUntil: 0 }
    const { wrapper, socket } = await playing([person({ sid: 'me' })], [station])
    await wrapper.get('[data-testid="tag-use"]').trigger('click')
    expect(socket.sent).toContainEqual({ type: 'station', id: 'st-patch' })
  })

  it('hides the prompt while infected or when no station is ready', async () => {
    const station = { id: 'st-patch', kind: 'patch', x: 1, z: 0, coolingUntil: 0 }
    const sick = await playing([person({ sid: 'me', infected: true })], [station])
    expect(sick.wrapper.find('[data-testid="tag-use"]').exists()).toBe(false)
    const cooling = await playing(
      [person({ sid: 'me' })],
      [{ ...station, coolingUntil: Date.now() + 60000 }],
    )
    expect(cooling.wrapper.find('[data-testid="tag-use"]').exists()).toBe(false)
  })
})
