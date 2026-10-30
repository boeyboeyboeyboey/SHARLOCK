import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { shallowRef, defineComponent, h } from 'vue'
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

function mountMap(controls) {
  const Host = defineComponent({
    setup() {
      if (controls) provideTownControls(controls)
      return () => h(TownMap, { games: gameCatalog })
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
