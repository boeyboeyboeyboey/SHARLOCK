import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { nextTick } from 'vue'
import { routerKey } from 'vue-router'
import HubScene from '../HubScene.vue'
import { HINT_SEEN_KEY } from '../controls.js'
import { LORE_SEEN_KEY, _resetLoreIntroForTests, useLoreIntro } from '../intro/useLoreIntro.js'
import { gameCatalog } from '../../../data/gameCatalog.js'

// the engine is the one heavy seam: the shell under test only talks to it through this object
const engine = vi.hoisted(() => ({ hubs: [], ready: () => Promise.resolve() }))
vi.mock('../engine.js', () => ({
  createHub: (options) => {
    const hub = {
      options,
      state: { player: { x: 0, z: 0, heading: 0 } },
      ready: engine.ready(),
      select: vi.fn(),
      enter: vi.fn(async () => true),
      back: vi.fn(async () => true),
      setPeers: vi.fn(),
      peerLabels: () => [],
      setBottomInset: vi.fn(),
      pauseInput: vi.fn(),
      resetCamera: vi.fn(),
      position: () => null,
      dispose: vi.fn(),
    }
    engine.hubs.push(hub)
    return hub
  },
}))

const liveState = (over = {}) => ({
  ready: true,
  selected: null,
  nearDoor: null,
  nearNpc: null,
  nearFind: null,
  mode: 'explore',
  engine: 'webgl2',
  fps: 60,
  drawCalls: 10,
  sprint: { phase: 'ready', at: 0 },
  ...over,
})

async function mountScene() {
  const wrapper = mount(HubScene, {
    props: { games: gameCatalog },
    attachTo: document.body,
    global: {
      plugins: [createPinia()],
      provide: { [routerKey]: { replace: vi.fn(async () => {}) } },
      stubs: { LoreIntro: { template: '<div data-testid="lore-intro"></div>' } },
    },
  })
  await flushPromises()
  return wrapper
}
const hub = () => engine.hubs.at(-1)
const becomeReady = async (over) => {
  hub().options.onState(liveState(over))
  await flushPromises()
}
const status = (wrapper) => wrapper.get('[data-testid="hub-status"]').text()

beforeEach(() => {
  engine.hubs.length = 0
  engine.ready = () => Promise.resolve()
  _resetLoreIntroForTests()
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem(LORE_SEEN_KEY, '1')
  localStorage.setItem(HINT_SEEN_KEY, '3')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('hub shell', () => {
  it('lists every catalog game as a destination, none picked', async () => {
    const wrapper = await mountScene()
    for (const game of gameCatalog) {
      const button = wrapper.get(`[data-testid="dest-${game.id}"]`)
      expect(button.attributes('aria-pressed')).toBe('false')
    }
    wrapper.unmount()
  })

  it('says it is loading until the engine reports ready', async () => {
    const wrapper = await mountScene()
    expect(status(wrapper)).toBe('Loading the town')
    await becomeReady()
    expect(status(wrapper)).toBe('')
    wrapper.unmount()
  })

  it('picks a destination, shows Enter and announces the pick', async () => {
    const wrapper = await mountScene()
    await becomeReady()
    const button = wrapper.get('[data-testid="dest-cli-cyber-defender"]')
    await button.trigger('click')
    expect(hub().select).toHaveBeenCalledWith('cli-cyber-defender')
    expect(button.attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-testid="enter"]').text()).toContain('CLI Cyber Defender')
    wrapper.unmount()
  })

  it('emits enter after the swoop', async () => {
    const wrapper = await mountScene()
    await becomeReady()
    await wrapper.get('[data-testid="dest-cli-cyber-defender"]').trigger('click')
    await wrapper.get('[data-testid="enter"]').trigger('click')
    await flushPromises()
    expect(hub().enter).toHaveBeenCalledWith('cli-cyber-defender')
    expect(wrapper.emitted('enter')[0][0].id).toBe('cli-cyber-defender')
    wrapper.unmount()
  })

  it('still leads somewhere while the hub loads', async () => {
    const wrapper = await mountScene()
    await wrapper.get('[data-testid="dest-clearance-tower"]').trigger('click')
    await wrapper.get('[data-testid="enter"]').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('enter')[0][0].id).toBe('clearance-tower')
    expect(hub().enter).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('clears a pick on Escape and marks the key handled', async () => {
    const wrapper = await mountScene()
    await becomeReady()
    const button = wrapper.get('[data-testid="dest-cli-cyber-defender"]')
    await button.trigger('click')
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    window.dispatchEvent(event)
    await nextTick()
    expect(event.defaultPrevented).toBe(true)
    expect(button.attributes('aria-pressed')).toBe('false')
    wrapper.unmount()
  })

  it('reports a failed start once and offers the list instead', async () => {
    engine.ready = () => Promise.reject(new Error('no webgl'))
    const wrapper = await mountScene()
    await flushPromises()
    expect(wrapper.emitted('failed')).toHaveLength(1)
    expect(status(wrapper)).toContain('3D view unavailable')
    wrapper.unmount()
  })

  it('moves focus to Enter after a pick from the map', async () => {
    const wrapper = await mountScene()
    await becomeReady()
    const map = wrapper.findComponent({ name: 'HubMinimap' })
    await vi.waitFor(() =>
      expect(map.find('[data-testid="hub-map-clearance-tower"]').exists()).toBe(true),
    )
    await map.get('[data-testid="hub-map-toggle"]').trigger('click')
    await nextTick()
    const pin = map.get('[data-testid="hub-map-clearance-tower"]')
    pin.element.focus()
    await pin.trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('[data-testid="enter"]').element)
    wrapper.unmount()
  })

  it('hides the frame counter unless the url asks for it', async () => {
    const wrapper = await mountScene()
    await becomeReady()
    expect(wrapper.find('[data-testid="hub-stats"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('disposes the hub on leaving', async () => {
    const wrapper = await mountScene()
    const made = hub()
    wrapper.unmount()
    expect(made.dispose).toHaveBeenCalledTimes(1)
  })
})

describe('first visit with the lore intro', () => {
  beforeEach(() => {
    localStorage.removeItem(LORE_SEEN_KEY)
    localStorage.removeItem(HINT_SEEN_KEY)
  })

  it('holds the controls hint until the intro ends, and counts the visit once', async () => {
    const wrapper = await mountScene()
    await becomeReady()
    expect(wrapper.find('[data-testid="lore-intro"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="controls-hint"]').exists()).toBe(false)
    expect(localStorage.getItem(HINT_SEEN_KEY)).toBeNull()
    useLoreIntro().finish()
    await flushPromises()
    expect(wrapper.find('[data-testid="controls-hint"]').exists()).toBe(true)
    expect(localStorage.getItem(HINT_SEEN_KEY)).toBe('1')
    wrapper.unmount()
  })

  it('pauses the hub from the moment it is created', async () => {
    const wrapper = await mountScene()
    expect(hub().pauseInput).toHaveBeenCalledWith(true)
    wrapper.unmount()
  })

  it('lets go of the intro state when it is removed mid intro, without marking it seen', async () => {
    const wrapper = await mountScene()
    const lore = useLoreIntro()
    expect(lore.playing.value).toBe(true)
    wrapper.unmount()
    expect(lore.playing.value).toBe(false)
    expect(lore.hasSeen()).toBe(false)
  })
})
