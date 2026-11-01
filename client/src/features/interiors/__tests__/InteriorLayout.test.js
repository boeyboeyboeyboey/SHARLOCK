import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia } from 'pinia'
import InteriorLayout from '../InteriorLayout.vue'
import { useInteriorLeave } from '../useInteriorLeave.js'

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
            path: '/games/social-engineering-simulator',
            component: Game,
            meta: { interior: 'social-engineering-simulator' },
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

describe('InteriorLayout', () => {
  it('shows the still and the game inside the desk panel', async () => {
    const wrapper = await mountAt('/games/cli-cyber-defender')
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

describe('every game room (INT-03, INT-04)', () => {
  it.each([
    'phishing-post-mortem',
    'cli-cyber-defender',
    'sql-injection-arcade',
    'social-engineering-simulator',
    'clearance-tower',
  ])('%s shows the still with the centred desk and no view switch', async (id) => {
    const wrapper = await mountAt(`/games/${id}`)
    expect(wrapper.get('[data-testid="interior-still"]').attributes('src')).toBe(
      `/interiors/${id}.webp`,
    )
    expect(wrapper.get('[data-testid="interior-desk"]').text()).toContain('game content')
    expect(wrapper.find('[aria-label="View mode"]').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('game chrome and Exit game', () => {
  it('shows the menu, sound and Exit game but no view switch', async () => {
    const wrapper = await mountAt('/games/cli-cyber-defender')
    expect(wrapper.find('[data-testid="menu-button"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="interior-sound"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="View mode"]').exists()).toBe(false)
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

describe('holding a game while the leave dialog is open', () => {
  it('tells a registered game when the dialog opens and closes', async () => {
    const onOpen = vi.fn()
    const onClose = vi.fn()
    Game.setup = () => {
      useInteriorLeave({ onOpen, onClose })
    }
    const wrapper = await mountAt('/games/cli-cyber-defender')
    await wrapper.get('[data-testid="exit-game"]').trigger('click')
    await flushPromises()
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Keep playing')
      .trigger('click')
    await flushPromises()
    expect(onClose).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    delete Game.setup
  })
})
