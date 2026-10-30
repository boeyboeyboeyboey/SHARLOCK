import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, shallowRef, defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import TownMap from '../TownMap.vue'
import { provideTownControls } from '../../menu/townControls.js'
import { gameCatalog } from '../../../data/gameCatalog.js'

// panzoom is a camera library with no layout in jsdom, so a minimal stand-in is enough
vi.mock('@panzoom/panzoom', () => ({
  default: () => ({
    getScale: () => 1,
    getPan: () => ({ x: 0, y: 0 }),
    pan: () => {},
    zoom: () => {},
    zoomToPoint: () => {},
    setOptions: () => {},
    reset: () => {},
    destroy: () => {},
    handleDown: () => {},
    handleMove: () => {},
    handleUp: () => {},
  }),
}))

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    disconnect() {}
  }
})
afterEach(() => vi.restoreAllMocks())

function mountMap(controls, extra = reactive({})) {
  const Host = defineComponent({
    setup() {
      if (controls) provideTownControls(controls)
      return () => h(TownMap, { games: gameCatalog, ...extra })
    },
  })
  return mount(Host, {
    attachTo: document.body,
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  })
}

describe('town map controls', () => {
  it('has the zoom stack but no toolbar, location label or jump select', () => {
    const wrapper = mountMap(null)
    const zoom = wrapper.get('[role="group"][aria-label="Map zoom"]')
    expect(zoom.findAll('button').map((node) => node.attributes('aria-label'))).toEqual([
      'Zoom in',
      'Zoom out',
      'Reset view',
    ])
    expect(zoom.get('output').attributes('aria-label')).toBe('Map zoom level')
    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('SHARLOCK TOWN')
    wrapper.unmount()
  })

  it('registers a jump function that opens the chosen building card, and clears it on unmount', async () => {
    const controls = { jumpTo: shallowRef(null) }
    const wrapper = mountMap(controls)
    expect(typeof controls.jumpTo.value).toBe('function')
    controls.jumpTo.value('threat-briefing')
    await flushPromises()
    expect(wrapper.get('.game-info-card').text()).toContain(
      gameCatalog.find((game) => game.id === 'threat-briefing').name,
    )
    wrapper.unmount()
    expect(controls.jumpTo.value).toBeNull()
  })
})

describe('walking Sharlock', () => {
  let queue
  let clock
  beforeEach(() => {
    queue = []
    clock = 0
    vi.stubGlobal('requestAnimationFrame', (callback) => queue.push(callback))
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })
  afterEach(() => vi.unstubAllGlobals())

  const frames = async (count) => {
    for (let i = 0; i < count; i++) {
      clock += 1000 / 60
      queue.splice(0).forEach((callback) => callback(clock))
    }
    await flushPromises()
  }
  const key = (type, code, target = window) =>
    target.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }))
  const left = (wrapper) =>
    parseFloat(wrapper.get('[data-testid="town-player"]').element.style.left)

  it('walks right while D is held and faces that way', async () => {
    const wrapper = mountMap(null)
    const start = left(wrapper)
    key('keydown', 'KeyD')
    await frames(30)
    key('keyup', 'KeyD')
    await frames(3)
    expect(left(wrapper)).toBeGreaterThan(start + 40)
    expect(wrapper.get('[data-testid="town-player"]').attributes('data-facing')).toBe('right')
    wrapper.unmount()
  })

  it('does not walk while typing in a field or when paused', async () => {
    const extra = reactive({})
    const wrapper = mountMap(null, extra)
    const start = left(wrapper)
    const input = document.createElement('input')
    document.body.append(input)
    key('keydown', 'KeyD', input)
    await frames(10)
    input.remove()
    extra.paused = true
    await flushPromises()
    key('keydown', 'KeyD')
    await frames(10)
    expect(left(wrapper)).toBe(start)
    wrapper.unmount()
  })

  it('shows an Enter prompt at a door and opens the card on E like a click', async () => {
    const controls = { jumpTo: shallowRef(null) }
    const wrapper = mountMap(controls)
    expect(wrapper.find('[data-testid="door-prompt"]').exists()).toBe(false)
    controls.jumpTo.value('cli-cyber-defender')
    await flushPromises()
    const name = gameCatalog.find((game) => game.id === 'cli-cyber-defender').name
    expect(wrapper.get('[data-testid="door-prompt"]').attributes('aria-label')).toBe(
      `Enter ${name}`,
    )
    wrapper.findComponent(TownMap).vm.dismiss()
    await flushPromises()
    expect(wrapper.find('.game-info-card').exists()).toBe(false)
    key('keydown', 'KeyE')
    await flushPromises()
    expect(wrapper.get('.game-info-card').text()).toContain(name)
    wrapper.unmount()
  })

  it('activates a direct building from its door with Enter', async () => {
    const controls = { jumpTo: shallowRef(null) }
    const wrapper = mountMap(controls)
    controls.jumpTo.value('threat-briefing')
    await flushPromises()
    key('keydown', 'Enter')
    await flushPromises()
    expect(wrapper.findComponent(TownMap).emitted('activate')).toEqual([['/games/threat-briefing']])
    wrapper.unmount()
  })

  it('opens a keeper dialogue on E, steps through lines and goes in', async () => {
    const wrapper = mountMap(null)
    key('keydown', 'KeyA')
    await frames(220)
    key('keyup', 'KeyA')
    await frames(3)
    expect(wrapper.get('[data-testid="talk-prompt"]').attributes('aria-label')).toBe(
      'Talk to Publican',
    )
    key('keydown', 'KeyE')
    await flushPromises()
    const first = wrapper.get('[data-testid="npc-line"]').text()
    expect(wrapper.get('[data-testid="npc-dialogue"]').text()).toContain('Publican')
    key('keydown', 'KeyE')
    await flushPromises()
    expect(wrapper.get('[data-testid="npc-line"]').text()).not.toBe(first)
    while (!wrapper.find('[data-testid="npc-enter"]').exists()) {
      key('keydown', 'KeyE')
      await flushPromises()
    }
    await wrapper.get('[data-testid="npc-enter"]').trigger('click')
    expect(wrapper.find('[data-testid="npc-dialogue"]').exists()).toBe(false)
    expect(wrapper.get('.game-info-card').text()).toContain('Social')
    wrapper.unmount()
  })

  it('marks a discovery found on E', async () => {
    localStorage.clear()
    const wrapper = mountMap(null)
    key('keydown', 'KeyD')
    await frames(300)
    key('keyup', 'KeyD')
    await frames(3)
    key('keydown', 'KeyE')
    await flushPromises()
    expect(wrapper.get('[data-testid="npc-dialogue"]').text()).toContain('Lost memory stick')
    expect(JSON.parse(localStorage.getItem('sharlock.discoveries'))).toContain('usb-stick')
    wrapper.unmount()
  })
})
