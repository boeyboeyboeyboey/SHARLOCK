import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import InteriorLayout from '../InteriorLayout.vue'

vi.mock('../useInteriorEngine.js', () => ({
  createInterior: vi.fn(() => ({ state: {}, ready: Promise.resolve(), dispose: vi.fn() })),
}))

const Game = { template: '<p>game content</p>' }

async function mountAt(path) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/games',
        component: InteriorLayout,
        children: [
          {
            path: '/games/cli-cyber-defender',
            component: Game,
            meta: { interior: 'cli-cyber-defender' },
          },
        ],
      },
    ],
  })
  router.push(path)
  await router.isReady()
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }))
})
afterEach(() => vi.unstubAllGlobals())

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
})
