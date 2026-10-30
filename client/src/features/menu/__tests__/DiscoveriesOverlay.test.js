import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

let wrapper

async function mountWith(found) {
  vi.resetModules()
  localStorage.setItem('sharlock.discoveries', JSON.stringify(found))
  const { default: DiscoveriesOverlay } = await import('../overlays/DiscoveriesOverlay.vue')
  const { finds } = await import('../../hub/scenes/wharf/finds.js')
  wrapper = mount(DiscoveriesOverlay, { attachTo: document.body })
  return finds
}
const item = (id) => document.body.querySelector(`[data-testid="discovery-${id}"]`)

beforeEach(() => localStorage.clear())
afterEach(() => wrapper?.unmount())

describe('DiscoveriesOverlay', () => {
  it('shows only the pocket hint for everything while nothing is found', async () => {
    const finds = await mountWith([])
    expect(document.body.querySelector('[data-testid="discoveries-count"]').textContent).toContain(
      '0/6',
    )
    for (const find of finds) {
      expect(item(find.id).textContent).toContain('???')
      expect(item(find.id).textContent).toContain(`Somewhere in the ${find.pocket}`)
      expect(item(find.id).textContent).not.toContain(find.name)
    }
  })

  it('shows name, card line and note for a found entry and hides the rest', async () => {
    const finds = await mountWith(['tailgater'])
    const found = finds.find((f) => f.id === 'tailgater')
    const text = item('tailgater').textContent
    expect(text).toContain(found.name)
    expect(text).toContain(found.lines[0])
    expect(text).toContain("Sharlock's note")
    expect(text).toContain(found.note)
    expect(item('handbill').textContent).toContain('???')
    expect(item('handbill').textContent).not.toContain("Sharlock's note")
  })

  it('keeps the catalogue order and asks to close', async () => {
    const finds = await mountWith(['handbill', 'sticky-note'])
    const ids = [...document.body.querySelectorAll('[data-testid^="discovery-"]')].map((n) =>
      n.getAttribute('data-testid').replace('discovery-', ''),
    )
    expect(ids).toEqual(finds.map((f) => f.id))
    document.body.querySelector('[data-testid="menu-overlay-close"]').click()
    expect(wrapper.emitted('request-close')).toHaveLength(1)
  })
})
