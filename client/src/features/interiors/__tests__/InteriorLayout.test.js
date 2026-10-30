import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia } from 'pinia'
import InteriorLayout from '../InteriorLayout.vue'

vi.mock('../useInteriorEngine.js', () => ({
  createInterior: vi.fn((opts) => {
    opts.onHero?.({ left: 100, top: 80, width: 800, height: 520 })
    return { state: {}, ready: Promise.resolve(), dispose: vi.fn() }
  }),
}))

const Game = { template: '<p>game content</p><a href="#">x</a>' }
const Home = { template: '<p>home</p>' }
let lastRouter = null

async function mountAt(path) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Home },
      { path: '/about', component: Home },
      {
        path: '/games',
        component: InteriorLayout,
        children: [
          {
            path: '/games/cli-cyber-defender',
            component: Game,
            meta: { interior: 'cli-cyber-defender' },
          },
          {
            path: '/games/phishing-post-mortem',
            component: Game,
            meta: { interior: 'phishing-post-mortem' },
          },
          {
            path: '/games/sql-injection-arcade',
            component: Game,
            meta: { interior: 'sql-injection-arcade' },
          },
          {
            path: '/games/clearance-tower',
            component: Game,
            meta: { interior: 'clearance-tower' },
          },
        ],
      },
    ],
  })
  lastRouter = router
  router.push(path)
  await router.isReady()
  const wrapper = mount(
    { template: '<RouterView />' },
    { global: { plugins: [router, createPinia()] }, attachTo: document.body },
  )
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
  localStorage.clear()
  sessionStorage.clear()
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('InteriorLayout in 2d mode', () => {
  beforeEach(() => localStorage.setItem('sharlock.townMode', '2d'))

  it('shows the still, no canvas, and the game inside the desk panel', async () => {
    const wrapper = await mountAt('/games/cli-cyber-defender')
    expect(wrapper.find('[data-testid="interior-canvas"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="interior-still"]').attributes('src')).toBe(
      '/interiors/cli-cyber-defender.webp',
    )
    expect(wrapper.get('[data-testid="interior-desk"]').text()).toContain('game content')
  })

  it('falls back to the gradient when the still is missing', async () => {
    const wrapper = await mountAt('/games/cli-cyber-defender')
    await wrapper.get('[data-testid="interior-still"]').trigger('error')
    expect(wrapper.find('[data-testid="interior-still"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="interior-fallback"]').attributes('style')).toContain(
      'gradient',
    )
  })

  it('offers a sound control that mutes the room theme for the session', async () => {
    const wrapper = await mountAt('/games/cli-cyber-defender')
    const button = wrapper.get('[data-testid="interior-sound"]')
    expect(button.attributes('aria-label')).toBe('Mute game sound')
    expect(button.attributes('aria-pressed')).toBe('true')
    await button.trigger('click')
    await flushPromises()
    expect(button.attributes('aria-label')).toBe('Turn on game sound')
    expect(sessionStorage.getItem('sharlock.musicMuted')).toBe('1')
    wrapper.unmount()
  })

  it('starts muted and silent when the session was already muted', async () => {
    sessionStorage.setItem('sharlock.musicMuted', '1')
    const wrapper = await mountAt('/games/cli-cyber-defender')
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="interior-sound"]').attributes('aria-pressed')).toBe('false')
    wrapper.unmount()
  })
})

describe('hero layout fallback', () => {
  it('keeps the centred desk in 2d mode even for a hero room', async () => {
    localStorage.setItem('sharlock.townMode', '2d')
    const wrapper = await mountAt('/games/phishing-post-mortem')
    const desk = wrapper.get('[data-testid="interior-desk"]')
    expect(desk.classes()).not.toContain('is-hero')
    expect(desk.attributes('style')).toBeUndefined()
    expect(wrapper.get('[data-testid="interior"]').attributes('data-hero')).toBeUndefined()
    expect(wrapper.find('.desk-surface').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('hero surface styles', () => {
  beforeEach(() => {
    localStorage.setItem('sharlock.townMode', '3d')
    localStorage.setItem('sharlock.hubForce3d', '1')
    vi.stubGlobal('matchMedia', (q) => ({
      matches: q.includes('min-width'),
      addEventListener() {},
      removeEventListener() {},
    }))
  })

  it.each([
    ['phishing-post-mortem', 'paper'],
    ['cli-cyber-defender', 'slate'],
    ['sql-injection-arcade', 'slate'],
  ])('%s blends with a %s surface and a click-through overlay', async (id, surface) => {
    const wrapper = await mountAt(`/games/${id}`)
    const root = wrapper.get('[data-testid="interior"]')
    expect(root.attributes('data-stage')).toBe('3d')
    expect(root.attributes('data-surface')).toBe(surface)
    expect(wrapper.get('.desk-surface').exists()).toBe(true)
    const overlay = wrapper.get('[data-testid="desk-overlay"]')
    expect(overlay.attributes('aria-hidden')).toBe('true')
    expect(overlay.attributes('style')).toContain('width: 800px')
    expect(wrapper.get('[data-testid="interior-desk"]').text()).toContain('game content')
    wrapper.unmount()
  })

  it('keeps the shell paddings for a game that bleeds by the gutter', async () => {
    const wrapper = await mountAt('/games/sql-injection-arcade')
    expect(wrapper.get('[data-testid="interior"]').attributes('data-stage')).toBe('3d')
    expect(wrapper.get('[data-testid="interior-desk"]').classes()).toContain('is-bleed')
    wrapper.unmount()
  })

  it('has no surface layers for a room without a hero', async () => {
    const wrapper = await mountAt('/games/clearance-tower')
    expect(wrapper.get('[data-testid="interior"]').attributes('data-surface')).toBeUndefined()
    expect(wrapper.find('.desk-surface').exists()).toBe(false)
    expect(wrapper.find('[data-testid="desk-overlay"]').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('game chrome and Exit game', () => {
  beforeEach(() => localStorage.setItem('sharlock.townMode', '2d'))

  it('shows the menu, sound, view switch and Exit game', async () => {
    const wrapper = await mountAt('/games/cli-cyber-defender')
    expect(wrapper.find('[data-testid="menu-button"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="interior-sound"]').exists()).toBe(true)
    expect(wrapper.get('[aria-label="View mode"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="exit-game"]').text()).toBe('Exit game')
    wrapper.unmount()
  })

  it('stays in the game when the confirmation is cancelled', async () => {
    const wrapper = await mountAt('/games/cli-cyber-defender')
    await wrapper.get('[data-testid="exit-game"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('dialog[data-testid="confirm-dialog"]').attributes('open')).toBeDefined()
    await wrapper.get('[data-testid="confirm-cancel"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('dialog[data-testid="confirm-dialog"]').attributes('open')).toBeUndefined()
    expect(lastRouter.currentRoute.value.path).toBe('/games/cli-cyber-defender')
    wrapper.unmount()
  })

  it('goes to the town when the exit is confirmed', async () => {
    const wrapper = await mountAt('/games/cli-cyber-defender')
    await wrapper.get('[data-testid="exit-game"]').trigger('click')
    await wrapper.get('[data-testid="confirm-accept"]').trigger('click')
    await flushPromises()
    expect(lastRouter.currentRoute.value.path).toBe('/')
    wrapper.unmount()
  })

  it('asks before a site menu link leaves the game but not for the game own navigation', async () => {
    const wrapper = await mountAt('/games/cli-cyber-defender')
    await wrapper.get('[data-testid="menu-button"]').trigger('click')
    await wrapper.get('a[href="/about"]').trigger('click')
    await flushPromises()
    expect(lastRouter.currentRoute.value.path).toBe('/games/cli-cyber-defender')
    expect(wrapper.get('dialog[data-testid="confirm-dialog"]').attributes('open')).toBeDefined()
    await wrapper.get('[data-testid="confirm-accept"]').trigger('click')
    await flushPromises()
    expect(lastRouter.currentRoute.value.path).toBe('/about')
    wrapper.unmount()
  })

  it('lets a game link leave without asking', async () => {
    const wrapper = await mountAt('/games/cli-cyber-defender')
    await lastRouter.push('/')
    await flushPromises()
    expect(lastRouter.currentRoute.value.path).toBe('/')
    wrapper.unmount()
  })
})
