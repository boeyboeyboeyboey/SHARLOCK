import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import {
  checkPuzzle,
  generatePuzzle,
} from '../../../../../../server/src/modules/games/botnet-tag/puzzles.js'
import AccountBody from '../AccountBody.vue'
import FirewallBody from '../FirewallBody.vue'
import HashBody from '../HashBody.vue'
import PatchBody from '../PatchBody.vue'
import ProcessBody from '../ProcessBody.vue'
import PuzzlePanel from '../PuzzlePanel.vue'
import PuzzleResult from '../PuzzleResult.vue'
import SpoofBody from '../SpoofBody.vue'

// seeded rng so every sample is the same run to run
function seeded(seed) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const sample = (kind) => generatePuzzle(kind, seeded(7))
const last = (wrapper) => wrapper.emitted('change').at(-1)[0]

describe('puzzle result', () => {
  it('tells a late solver that the station was taken', () => {
    const wrapper = mount(PuzzleResult, {
      props: { notice: 'Someone patched this station first' },
    })
    expect(wrapper.get('[data-testid="puzzle-notice"]').text()).toBe(
      'Someone patched this station first',
    )
  })

  it('shows a lockout over the notice', () => {
    const wrapper = mount(PuzzleResult, { props: { lockMs: 2000, notice: 'taken' } })
    expect(wrapper.find('[data-testid="puzzle-notice"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="puzzle-locked"]').text()).toContain('2s')
  })
})

describe('firewall', () => {
  it('stays incomplete until every row is set, then emits choices the server accepts', async () => {
    const puzzle = sample('firewall')
    const wrapper = mount(FirewallBody, { props: { data: puzzle.public } })
    expect(wrapper.text()).toContain(puzzle.public.role)
    expect(wrapper.findAll('li')).toHaveLength(puzzle.public.services.length)
    expect(last(wrapper)).toBeNull()
    for (const [i, verdict] of puzzle.answer.entries()) {
      await wrapper.findAll('li')[i].get(`input[value="${verdict}"]`).setValue(true)
    }
    expect(last(wrapper)).toEqual({ choices: puzzle.answer })
    expect(checkPuzzle('firewall', puzzle.answer, last(wrapper))).toBe(true)
  })
})

describe('patch', () => {
  it('pairs services with patches by selecting a service then a patch', async () => {
    const puzzle = sample('patch')
    const wrapper = mount(PatchBody, { props: { data: puzzle.public } })
    expect(last(wrapper)).toBeNull()
    for (const [i, id] of puzzle.answer.entries()) {
      await wrapper.get(`[data-testid="patch-service-${i}"]`).trigger('click')
      await wrapper.get(`[data-testid="patch-${id}"]`).trigger('click')
    }
    expect(last(wrapper)).toEqual({ choices: puzzle.answer })
    expect(checkPuzzle('patch', puzzle.answer, last(wrapper))).toBe(true)
  })

  it('advances to the next unpaired service after each patch', async () => {
    const puzzle = sample('patch')
    const wrapper = mount(PatchBody, { props: { data: puzzle.public } })
    await wrapper.get(`[data-testid="patch-${puzzle.answer[0]}"]`).trigger('click')
    expect(wrapper.get('[data-testid="patch-service-1"]').attributes('aria-pressed')).toBe('true')
  })
})

const indexCases = [
  ['process', ProcessBody, 'process'],
  ['hash', HashBody, 'hash'],
  ['spoof', SpoofBody, 'spoof'],
  ['account', AccountBody, 'account'],
]
describe.each(indexCases)('%s', (kind, Body) => {
  it('emits the chosen index in the server shape', async () => {
    const puzzle = sample(kind)
    const wrapper = mount(Body, { props: { data: puzzle.public } })
    expect(last(wrapper)).toBeNull()
    const radios = wrapper.findAll('input[type="radio"]')
    await radios[puzzle.answer].setValue(true)
    expect(last(wrapper)).toEqual({ index: puzzle.answer })
    expect(checkPuzzle(kind, puzzle.answer, last(wrapper))).toBe(true)
  })
})

describe('hash body', () => {
  it('shows the published hash and every candidate without marking the match', () => {
    const puzzle = sample('hash')
    const wrapper = mount(HashBody, { props: { data: puzzle.public } })
    expect(wrapper.get('[data-testid="hash-published"]').text()).toContain(
      puzzle.public.published.replace(/\s/g, '').slice(0, 8),
    )
    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(3)
  })
})

describe('puzzle panel', () => {
  const props = () => ({ kind: 'spoof', data: sample('spoof').public, msLeft: 12000 })

  it('shows the title, seconds left and a disabled submit until complete', async () => {
    const wrapper = mount(PuzzlePanel, { props: props() })
    expect(wrapper.get('[role="dialog"]').attributes('aria-labelledby')).toBe('pz-title')
    expect(wrapper.get('#pz-title').text()).toContain('Sender')
    expect(wrapper.get('[data-testid="puzzle-time"]').text()).toBe('12s')
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('100')
    expect(wrapper.get('[data-testid="puzzle-submit"]').attributes('disabled')).toBeDefined()
    await wrapper.setProps({ msLeft: 6000 })
    expect(wrapper.get('[data-testid="puzzle-time"]').text()).toBe('6s')
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('50')
  })

  it('submits the chosen answer by button and by Enter', async () => {
    const wrapper = mount(PuzzlePanel, { props: props() })
    await wrapper.findAll('input[type="radio"]')[1].setValue(true)
    const submit = wrapper.get('[data-testid="puzzle-submit"]')
    expect(submit.attributes('disabled')).toBeUndefined()
    await submit.trigger('click')
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('submit')).toEqual([[{ index: 1 }], [{ index: 1 }]])
  })

  it('ignores Enter while incomplete', async () => {
    const wrapper = mount(PuzzlePanel, { props: props() })
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('closes on Escape and on the Close button', async () => {
    const wrapper = mount(PuzzlePanel, { props: props(), attachTo: document.body })
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    await wrapper.get('[data-testid="puzzle-close"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(2)
    wrapper.unmount()
  })

  it('closes on Escape when focus has left the panel, and stops listening once gone', async () => {
    const wrapper = mount(PuzzlePanel, { props: props(), attachTo: document.body })
    document.body.focus()
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    document.body.dispatchEvent(escape)
    const closes = wrapper.emitted('close')
    expect(closes).toHaveLength(1)
    expect(escape.defaultPrevented).toBe(true)
    wrapper.unmount()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(closes).toHaveLength(1)
  })

  it('leaves Escape to an open dialog such as the site menu', () => {
    const wrapper = mount(PuzzlePanel, { props: props(), attachTo: document.body })
    const dialog = document.createElement('dialog')
    dialog.setAttribute('open', '')
    document.body.append(dialog)
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(wrapper.emitted('close')).toBeUndefined()
    dialog.remove()
    wrapper.unmount()
  })

  it('is a modal dialog that keeps Tab inside', async () => {
    const wrapper = mount(PuzzlePanel, { props: props(), attachTo: document.body })
    const panel = wrapper.get('[role="dialog"]')
    expect(panel.attributes('aria-modal')).toBe('true')
    const tab = (shiftKey = false) =>
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true }),
      )
    const close = wrapper.get('[data-testid="puzzle-close"]').element
    const focusable = [...panel.element.querySelectorAll('button, input')].filter(
      (item) => !item.disabled,
    )
    // submit is disabled until an answer is chosen, so close is the last stop
    expect(focusable.at(-1)).toBe(close)
    close.focus()
    tab()
    expect(document.activeElement).toBe(focusable[0])
    tab(true)
    expect(document.activeElement).toBe(close)
    document.body.focus()
    document.activeElement.blur()
    tab()
    expect(document.activeElement).toBe(focusable[0])
    wrapper.unmount()
  })

  it('moves focus in on open and back to the opener on close', async () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const wrapper = mount(PuzzlePanel, { props: props(), attachTo: document.body })
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(wrapper.get('[role="dialog"]').element),
    )
    wrapper.unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })
})

describe('puzzle result', () => {
  it('shows the lockout seconds, else Patched, else nothing', async () => {
    const wrapper = mount(PuzzleResult, { props: { lockMs: 4200, patched: true } })
    expect(wrapper.get('[data-testid="puzzle-locked"]').text()).toContain('5s')
    expect(wrapper.find('[data-testid="puzzle-reason"]').exists()).toBe(false)
    await wrapper.setProps({ reason: 'Too late: the window closed' })
    expect(wrapper.get('[data-testid="puzzle-reason"]').text()).toContain('Too late')
    await wrapper.setProps({ lockMs: 0 })
    expect(wrapper.get('[data-testid="puzzle-patched"]').text()).toContain('Patched')
    await wrapper.setProps({ patched: false })
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })
})
