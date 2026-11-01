import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TownMap from '../TownMap.vue'
import { gameCatalog } from '../../../data/gameCatalog.js'

// the real panzoom here, unlike the other map test: jsdom has no layout, so only the viewport size is supplied
// the package's main file is a umd build that node reads as an empty module, so the browser build is used
vi.mock(
  '@panzoom/panzoom',
  () => import('../../../../node_modules/@panzoom/panzoom/dist/panzoom.es.js'),
)
let view
function installSize() {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function () {
    return this.classList.contains('town-viewport') ? view.width : 0
  })
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function () {
    return this.classList.contains('town-viewport') ? view.height : 0
  })
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    disconnect() {}
  }
  globalThis.PointerEvent ??= class extends MouseEvent {}
})
beforeEach(() => {
  view = { width: 375, height: 667 }
  installSize()
})
afterEach(() => vi.restoreAllMocks())

function mountMap() {
  return mount(TownMap, {
    props: { games: gameCatalog },
    attachTo: document.body,
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  })
}

// where the player stands inside the viewport, from the transform actually on the world element
function playerOnScreen(wrapper) {
  const world = wrapper.get('.town-world').element
  const [, scale, x, y = 0] = world.style.transform
    .match(/scale\(([\d.]+)\) translate\((-?[\d.]+)(?:px)?(?:, (-?[\d.]+)(?:px)?)?\)/)
    .map((part) => (part === undefined ? undefined : Number(part)))
  const player = wrapper.get('[data-testid="town-player"]').element
  return {
    x: (parseFloat(player.style.left) + x) * scale,
    y: (parseFloat(player.style.top) + y) * scale,
  }
}

describe('first view of the 2d town', () => {
  it.each([
    [375, 667],
    [667, 375],
  ])('has sharlock in view at %i x %i', async (width, height) => {
    view = { width, height }
    const wrapper = mountMap()
    // panzoom writes its transforms on the next animation frame
    await vi.waitFor(() => {
      const at = playerOnScreen(wrapper)
      expect(at.x).toBeGreaterThan(0)
      expect(at.x).toBeLessThan(width)
      expect(at.y).toBeGreaterThan(0)
      expect(at.y).toBeLessThan(height)
    })
    wrapper.unmount()
  })
})

describe('escape inside the map', () => {
  function pressEscape(wrapper) {
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    let reachedWindow = false
    const listener = () => (reachedWindow = true)
    window.addEventListener('keydown', listener)
    wrapper.get('.town-viewport').element.dispatchEvent(event)
    window.removeEventListener('keydown', listener)
    return { reachedWindow, prevented: event.defaultPrevented }
  }

  it('reaches the menu when no card is open', async () => {
    const wrapper = mountMap()
    await flushPromises()
    expect(pressEscape(wrapper)).toEqual({ reachedWindow: true, prevented: false })
    wrapper.unmount()
  })

  it('closes an open card and stops there', async () => {
    const wrapper = mountMap()
    await flushPromises()
    await wrapper.get('[aria-label="Explore Clearance Tower"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('section[aria-labelledby="game-heading-clearance-tower"]').exists()).toBe(
      true,
    )
    expect(pressEscape(wrapper)).toEqual({ reachedWindow: false, prevented: true })
    await flushPromises()
    expect(wrapper.find('section[aria-labelledby="game-heading-clearance-tower"]').exists()).toBe(
      false,
    )
    wrapper.unmount()
  })
})

describe('people among the finds', () => {
  it.each(['tailgater', 'shoulder-surfer'])('%s is drawn', async (id) => {
    const wrapper = mountMap()
    await flushPromises()
    expect(wrapper.get(`[data-testid="town-find-${id}"]`).find('svg').exists()).toBe(true)
    wrapper.unmount()
  })
})
