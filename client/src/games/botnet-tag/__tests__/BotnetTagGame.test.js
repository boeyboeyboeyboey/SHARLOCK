import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const device = vi.hoisted(() => ({ reasons: [] }))
vi.mock('../../../features/hub/deviceCheck.js', () => ({
  getDeviceCheck: () => ({ reasons: device.reasons }),
}))
vi.mock('../../../features/cohorts/api.js', () => ({
  listMemberships: vi.fn(),
  listManagedCohorts: vi.fn(),
}))
const routerApi = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(async () => {}) }))
const leaveGuard = vi.hoisted(() => ({ current: null }))
vi.mock('vue-router', async (original) => ({
  ...(await original()),
  useRouter: () => routerApi,
  onBeforeRouteLeave: (guard) => {
    leaveGuard.current = guard
  },
}))
const arenaFactory = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('../arena/createArena.js', () => ({
  createArena: (...args) => arenaFactory.create(...args),
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
const { listManagedCohorts, listMemberships } = await import('../../../features/cohorts/api.js')

const stubs = {
  ImmersiveControls: {
    name: 'ControlsStub',
    emits: ['navigate'],
    template: '<div data-testid="controls"><slot name="sound" /><slot name="end" /></div>',
  },
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
  ConfirmDialog: {
    props: ['open', 'title'],
    emits: ['confirm', 'cancel'],
    template:
      '<div v-if="open" data-testid="confirm">{{ title }}<button data-testid="confirm-yes" @click="$emit(\'confirm\')" /><button data-testid="confirm-no" @click="$emit(\'cancel\')" /></div>',
  },
}

function mountGame() {
  return mount(BotnetTagGame, { global: { stubs, mocks: { $router: { push: vi.fn() } } } })
}

function receive(socket, message) {
  socket.onmessage({ data: JSON.stringify(message) })
}

// the socket opens and delivers one snapshot
function open(socket, snapshot = {}) {
  if (socket.readyState !== 1) {
    socket.readyState = 1
    socket.onopen()
  }
  receive(socket, {
    type: 'snapshot',
    sid: 'me',
    phase: 'lobby',
    now: Date.now(),
    phaseEndsAt: null,
    players: [{ sid: 'me', username: 'ada', avatarId: 'mint', ready: false }],
    stations: [],
    you: null,
    ...snapshot,
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  useAuthStore().user = { globalRoles: ['student'], howToPlayDismissed: ['botnet-tag'] }
  FakeSocket.all = []
  vi.stubGlobal('WebSocket', FakeSocket)
  device.reasons = []
  routerApi.push.mockClear()
  routerApi.replace.mockClear()
  arenaFactory.create.mockReset()
  listMemberships.mockReset()
  listMemberships.mockResolvedValue({
    memberships: [
      {
        status: 'active',
        cohortName: 'Class 1A',
        cohortStatus: 'active',
        institutionStatus: 'active',
      },
    ],
  })
  listManagedCohorts.mockReset()
  listManagedCohorts.mockResolvedValue({ cohorts: [], total: 0 })
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

  it('holds the socket back until the first-visit guide closes', async () => {
    HTMLDialogElement.prototype.showModal = vi.fn(function open() {
      this.setAttribute('open', '')
    })
    HTMLDialogElement.prototype.close = vi.fn(function close() {
      this.removeAttribute('open')
    })
    useAuthStore().user = { globalRoles: ['student'], howToPlayDismissed: [] }
    const wrapper = mountGame()
    await flushPromises()
    expect(FakeSocket.all).toHaveLength(0)
    wrapper.getComponent({ name: 'HowToPlayDialog' }).vm.$emit('update:open', false)
    await flushPromises()
    expect(FakeSocket.all).toHaveLength(1)
    wrapper.unmount()
  })

  it('opens no socket when the student left while the page was loading', async () => {
    let finish
    listMemberships.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const wrapper = mountGame()
    await flushPromises()
    wrapper.unmount()
    finish({ memberships: [] })
    await flushPromises()
    expect(FakeSocket.all).toHaveLength(0)
  })

  it('keeps how to play, the sound button and leave game in the page controls', async () => {
    const wrapper = mountGame()
    await flushPromises()
    expect(wrapper.get('[data-testid="tag-howto-open"]').attributes('aria-label')).toBe(
      'How to play',
    )
    expect(wrapper.get('[data-testid="tag-leave-game"]').attributes('aria-label')).toBe(
      'Leave game',
    )
    expect(wrapper.find('[data-testid="tag-sound"]').exists()).toBe(true)
  })

  it('leaves the lobby at once without asking', async () => {
    const wrapper = mountGame()
    await flushPromises()
    open(FakeSocket.all[0], { phase: 'lobby' })
    await flushPromises()
    await wrapper.get('[data-testid="tag-leave-game"]').trigger('click')
    expect(wrapper.find('[data-testid="confirm"]').exists()).toBe(false)
    expect(FakeSocket.all[0].sent).toContainEqual({ type: 'leave' })
    expect(routerApi.push).toHaveBeenCalledWith('/')
  })

  it('names the live class, not an active membership in a deactivated one', async () => {
    listMemberships.mockResolvedValue({
      memberships: [
        {
          status: 'active',
          cohortName: 'Dead Class',
          cohortStatus: 'inactive',
          institutionStatus: 'active',
        },
        {
          status: 'active',
          cohortName: 'Closed School',
          cohortStatus: 'active',
          institutionStatus: 'inactive',
        },
        {
          status: 'active',
          cohortName: 'Class 1A',
          cohortStatus: 'active',
          institutionStatus: 'active',
        },
      ],
    })
    const wrapper = mountGame()
    await flushPromises()
    open(FakeSocket.all.at(-1))
    await flushPromises()
    expect(wrapper.text()).toContain('Class 1A')
    expect(wrapper.text()).not.toContain('Dead Class')
    expect(wrapper.text()).not.toContain('Closed School')
    wrapper.unmount()
  })

  it('tells each student without a class why', async () => {
    listMemberships.mockResolvedValue({
      memberships: [
        {
          status: 'pending',
          cohortName: 'Class 2B',
          cohortStatus: 'active',
          institutionStatus: 'active',
        },
      ],
    })
    const pending = mountGame()
    await flushPromises()
    FakeSocket.all.at(-1).onclose({ code: 4403, reason: '' })
    await flushPromises()
    expect(pending.get('[data-testid="tag-notice"]').text()).toContain(
      'Your request for Class 2B is waiting for approval',
    )
    listMemberships.mockResolvedValue({
      memberships: [{ status: 'removed', cohortName: 'Class 3C' }],
    })
    const removed = mountGame()
    await flushPromises()
    FakeSocket.all.at(-1).onclose({ code: 4403, reason: '' })
    await flushPromises()
    expect(removed.get('[data-testid="tag-notice"]').text()).toContain(
      'You were removed from Class 3C',
    )
  })

  it('explains a removal for being idle and offers to rejoin', async () => {
    const wrapper = mountGame()
    await flushPromises()
    FakeSocket.all[0].onclose({ code: 4410, reason: 'idle' })
    await flushPromises()
    const notice = wrapper.get('[data-testid="tag-notice"]')
    expect(notice.text()).toContain('Removed from the lobby')
    expect(notice.text()).toContain('within 45 seconds')
    const rejoin = wrapper.get('[data-testid="tag-retry"]')
    expect(rejoin.text()).toBe('Rejoin')
    await rejoin.trigger('click')
    expect(FakeSocket.all).toHaveLength(2)
  })

  it('drops the session and goes to sign in when another login replaces it', async () => {
    const auth = useAuthStore()
    auth.status = 'authenticated'
    const invalidate = vi.spyOn(auth, 'invalidateSession')
    mountGame()
    await flushPromises()
    FakeSocket.all[0].onclose({ code: 4401, reason: 'replaced' })
    await flushPromises()
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(routerApi.replace).toHaveBeenCalledWith({
      path: '/login',
      query: { reason: 'elsewhere' },
    })
  })

  it('sends an expired session to sign in with its own reason', async () => {
    useAuthStore().status = 'authenticated'
    mountGame()
    await flushPromises()
    FakeSocket.all[0].onclose({ code: 4401, reason: 'signed out' })
    await flushPromises()
    expect(routerApi.replace).toHaveBeenCalledWith({
      path: '/login',
      query: { reason: 'expired' },
    })
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

  it('shows the reconnect banner, disables ready, then explains the lost round', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const wrapper = mountGame()
      await flushPromises()
      const socket = FakeSocket.all[0]
      open(socket, { phase: 'countdown', sid: 'old' })
      await flushPromises()
      expect(wrapper.find('[data-testid="tag-reconnecting"]').exists()).toBe(false)
      socket.onclose({ code: 1006, reason: '' })
      await flushPromises()
      expect(wrapper.get('[data-testid="tag-reconnecting"]').text()).toBe(
        'Connection lost, reconnecting',
      )
      expect(wrapper.get('[data-testid="tag-ready"]').attributes('disabled')).toBeDefined()
      await vi.advanceTimersByTimeAsync(60_000)
      const next = FakeSocket.all.at(-1)
      open(next, { phase: 'lobby', sid: 'new' })
      await flushPromises()
      expect(wrapper.find('[data-testid="tag-reconnecting"]').exists()).toBe(false)
      expect(wrapper.get('[data-testid="tag-round-lost"]').text()).toContain('while you were away')
      expect(wrapper.get('[data-testid="tag-ready"]').attributes('disabled')).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('hides the station prompt while the connection is down', async () => {
    const station = { id: 'st-patch', kind: 'patch', x: 1, z: 0, coolingUntil: 0 }
    const { wrapper, socket } = await playing([person({ sid: 'me' })], [station])
    expect(wrapper.find('[data-testid="tag-use"]').exists()).toBe(true)
    socket.onclose({ code: 1006, reason: '' })
    await flushPromises()
    expect(wrapper.find('[data-testid="tag-use"]').exists()).toBe(false)
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

  async function playing(
    players,
    stations = [],
    you = { lockedUntil: 0, puzzle: null },
    extra = {},
  ) {
    const wrapper = mountGame()
    await flushPromises()
    const socket = FakeSocket.all.at(-1)
    open(socket, {
      phase: 'playing',
      phaseEndsAt: Date.now() + 180000,
      roundMs: 180000,
      players,
      stations,
      you,
      ...extra,
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

  it('shows the grace period and sends no tag during it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const { wrapper, socket } = await playing(
        [person({ sid: 'me', infected: true }), person({ sid: 'bot-1', x: 1, isBot: true })],
        [],
        { lockedUntil: 0, puzzle: null },
        { graceEndsAt: Date.now() + 5000 },
      )
      expect(wrapper.get('[data-testid="tag-grace"]').text()).toContain('tagging starts in')
      await vi.advanceTimersByTimeAsync(600)
      expect(socket.sent.some((message) => message.type === 'tag')).toBe(false)
      await vi.advanceTimersByTimeAsync(5000)
      expect(wrapper.find('[data-testid="tag-grace"]').exists()).toBe(false)
      expect(socket.sent).toContainEqual({ type: 'tag', target: 'bot-1' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('asks before leaving a round, through the button or the site menu', async () => {
    const { wrapper, socket } = await playing([person({ sid: 'me' })])
    await wrapper.get('[data-testid="tag-leave-game"]').trigger('click')
    expect(wrapper.get('[data-testid="confirm"]').text()).toContain('Leave the game?')
    await wrapper.get('[data-testid="confirm-no"]').trigger('click')
    expect(wrapper.find('[data-testid="confirm"]').exists()).toBe(false)
    expect(socket.sent).not.toContainEqual({ type: 'leave' })
    expect(routerApi.push).not.toHaveBeenCalled()

    // a link the game itself offers is not asked about, the site menu is
    expect(leaveGuard.current({ fullPath: '/classes' })).toBe(true)
    wrapper.getComponent({ name: 'ControlsStub' }).vm.$emit('navigate')
    expect(leaveGuard.current({ fullPath: '/classes' })).toBe(false)
    await flushPromises()
    await wrapper.get('[data-testid="confirm-yes"]').trigger('click')
    expect(socket.sent).toContainEqual({ type: 'leave' })
    expect(routerApi.push).toHaveBeenCalledWith('/classes')
    expect(leaveGuard.current({ fullPath: '/classes' })).toBe(true)
  })

  it('offers play again and leave on the results', async () => {
    const { wrapper, socket } = await playing([person({ sid: 'me' })])
    open(socket, { phase: 'results', players: [person({ sid: 'me' })] })
    receive(socket, {
      type: 'results',
      sideWon: 'survivors',
      unsaved: null,
      results: [
        {
          sid: 'me',
          username: 'ada',
          outcome: 'survived',
          sideWon: true,
          survivalSeconds: 180,
          patches: 1,
          tags: 0,
          score: 330,
        },
      ],
    })
    receive(socket, { type: 'saved', saved: true, score: 330, maxScore: 930 })
    await flushPromises()
    expect(wrapper.get('[data-testid="tag-saved"]').text()).toBe('✓ Saved 330/930')
    await wrapper.get('[data-testid="tag-again"]').trigger('click')
    expect(FakeSocket.all.at(-1)).not.toBe(socket)
    expect(wrapper.find('[data-testid="tag-results"]').exists()).toBe(false)
    const again = FakeSocket.all.at(-1)
    open(again, { phase: 'results', players: [person({ sid: 'me' })] })
    receive(again, { type: 'results', sideWon: 'botnet', results: [] })
    await flushPromises()
    await wrapper.get('[data-testid="tag-leave"]').trigger('click')
    expect(again.sent).toContainEqual({ type: 'leave' })
    expect(routerApi.push).toHaveBeenCalledWith('/')
  })

  it('labels a watcher and gives them no touch controls', async () => {
    const { wrapper } = await playing([person({ sid: 'other', infected: true })], [], null, {
      watching: true,
    })
    expect(wrapper.get('[data-testid="tag-status"]').text()).toBe('Watching')
    expect(wrapper.find('[data-testid="tag-jump"]').exists()).toBe(false)
  })

  it('leaves the round and offers a retry when the 3d yard cannot start', async () => {
    vi.stubGlobal('WebGL2RenderingContext', class {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    arenaFactory.create.mockImplementation(() => {
      throw new Error('no context')
    })
    try {
      const { wrapper, socket } = await playing([person({ sid: 'me' })])
      await vi.waitFor(() => expect(arenaFactory.create).toHaveBeenCalled())
      await flushPromises()
      const notice = wrapper.get('[data-testid="tag-notice"]')
      expect(notice.text()).toContain('The 3D yard could not start')
      expect(socket.sent).toContainEqual({ type: 'leave' })
      await wrapper.get('[data-testid="tag-retry"]').trigger('click')
      expect(FakeSocket.all.at(-1)).not.toBe(socket)
    } finally {
      warn.mockRestore()
      vi.unstubAllGlobals()
      vi.stubGlobal('WebSocket', FakeSocket)
    }
  })

  describe('staff', () => {
    beforeEach(() => {
      useAuthStore().user = { globalRoles: ['instructor'], howToPlayDismissed: ['botnet-tag'] }
    })

    it('says so when there are no classes, with a way back', async () => {
      const wrapper = mountGame()
      await flushPromises()
      expect(wrapper.get('[data-testid="tag-no-classes"]').text()).toBe(
        'You have no active classes',
      )
      expect(wrapper.get('[data-testid="tag-staff"] a').attributes('href')).toBe('/')
      expect(FakeSocket.all).toHaveLength(0)
    })

    it('says when classes could not load, and retries', async () => {
      listManagedCohorts.mockRejectedValueOnce(new Error('offline'))
      const wrapper = mountGame()
      await flushPromises()
      expect(wrapper.get('[data-testid="tag-classes-failed"]').text()).toBe(
        'Classes could not load',
      )
      await wrapper.get('[data-testid="tag-classes-retry"]').trigger('click')
      await flushPromises()
      expect(wrapper.find('[data-testid="tag-classes-failed"]').exists()).toBe(false)
      expect(wrapper.get('[data-testid="tag-no-classes"]').exists()).toBe(true)
    })

    it('reads every page of classes and waits for a choice', async () => {
      const page = (from, count) =>
        Array.from({ length: count }, (_, i) => ({
          cohortId: `c${from + i}`,
          cohortName: `Class ${from + i}`,
        }))
      listManagedCohorts
        .mockResolvedValueOnce({ cohorts: page(0, 50), total: 53 })
        .mockResolvedValueOnce({ cohorts: page(50, 3), total: 53 })
      const wrapper = mountGame()
      await flushPromises()
      const select = wrapper.get('[data-testid="tag-class-select"]')
      expect(select.findAll('option')).toHaveLength(54)
      expect(FakeSocket.all).toHaveLength(0)
      await select.setValue('c52')
      await flushPromises()
      expect(FakeSocket.all).toHaveLength(1)
      const socket = FakeSocket.all[0]
      socket.readyState = 1
      socket.onopen()
      expect(socket.sent).toContainEqual({ type: 'join', cohortId: 'c52' })
    })

    it('joins straight away when there is only one class', async () => {
      listManagedCohorts.mockResolvedValue({
        cohorts: [{ cohortId: 'c1', cohortName: 'Only class' }],
        total: 1,
      })
      mountGame()
      await flushPromises()
      expect(FakeSocket.all).toHaveLength(1)
    })
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
