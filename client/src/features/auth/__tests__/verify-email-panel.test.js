import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import VerifyEmailPanel from '../components/VerifyEmailPanel.vue'

const NOW = new Date('2026-11-01T10:00:00.000Z').getTime()

function verification(overrides = {}) {
  return {
    email: 'learner@example.test',
    delivery: 'sent',
    expiresAt: new Date(NOW + 600_000).toISOString(),
    resendAvailableAt: new Date(NOW + 30_000).toISOString(),
    ...overrides,
  }
}

function mountPanel(props = {}) {
  return mount(VerifyEmailPanel, {
    attachTo: document.body,
    props: { verification: verification(), ...props },
  })
}

const boxes = (wrapper) => wrapper.findAll('input')
const values = (wrapper) => boxes(wrapper).map((box) => box.element.value)
const confirm = (wrapper) => wrapper.get('button[type="submit"]')
const resend = (wrapper) => wrapper.findAll('button').find((b) => /Resend/.test(b.text()))

async function paste(wrapper, text) {
  await boxes(wrapper)[0].trigger('paste', { clipboardData: { getData: () => text } })
  await nextTick()
}

describe('VerifyEmailPanel', () => {
  let wrapper

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW })
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.useRealTimers()
  })

  it('fills all six boxes from a paste and enables Confirm', async () => {
    wrapper = mountPanel()
    expect(confirm(wrapper).element.disabled).toBe(true)
    await paste(wrapper, '12-34 56')
    expect(values(wrapper)).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(confirm(wrapper).element.disabled).toBe(false)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toEqual([['123456']])
  })

  it('spreads several typed digits across the boxes and moves focus on', async () => {
    wrapper = mountPanel()
    await nextTick()
    await boxes(wrapper)[0].setValue('12')
    await nextTick()
    expect(values(wrapper).slice(0, 3)).toEqual(['1', '2', ''])
    expect(document.activeElement).toBe(boxes(wrapper)[2].element)
  })

  it('drops anything that is not a digit', async () => {
    wrapper = mountPanel()
    await boxes(wrapper)[0].setValue('x')
    expect(values(wrapper)[0]).toBe('')
  })

  it('steps back with Backspace on an empty box and with the arrow keys', async () => {
    wrapper = mountPanel()
    await paste(wrapper, '12')
    await boxes(wrapper)[2].trigger('keydown', { key: 'Backspace' })
    await nextTick()
    expect(values(wrapper).slice(0, 2)).toEqual(['1', ''])
    expect(document.activeElement).toBe(boxes(wrapper)[1].element)

    await boxes(wrapper)[1].trigger('keydown', { key: 'ArrowLeft' })
    await nextTick()
    expect(document.activeElement).toBe(boxes(wrapper)[0].element)
    await boxes(wrapper)[0].trigger('keydown', { key: 'ArrowRight' })
    await nextTick()
    expect(document.activeElement).toBe(boxes(wrapper)[1].element)
  })

  it('holds Resend until the countdown ends', async () => {
    wrapper = mountPanel()
    expect(resend(wrapper).text()).toBe('Resend in 30s')
    expect(resend(wrapper).element.disabled).toBe(true)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(resend(wrapper).text()).toBe('Resend code')
    expect(resend(wrapper).element.disabled).toBe(false)
  })

  it('says a new code was sent after a resend, and clears the boxes', async () => {
    wrapper = mountPanel({
      verification: verification({ resendAvailableAt: new Date(NOW).toISOString() }),
    })
    await paste(wrapper, '123456')
    await resend(wrapper).trigger('click')
    expect(wrapper.emitted('resend')).toHaveLength(1)
    expect(values(wrapper)).toEqual(['', '', '', '', '', ''])
    expect(wrapper.text()).not.toContain('A new code was sent')

    await wrapper.setProps({
      verification: verification({ resendAvailableAt: new Date(NOW + 30_000).toISOString() }),
    })
    expect(wrapper.get('[role="status"]').text()).toBe(
      'A new code was sent. The old one no longer works.',
    )
  })

  it('states how long a code lasts', () => {
    wrapper = mountPanel()
    expect(wrapper.text()).toContain('Codes expire after 10 minutes.')
    expect(wrapper.text()).toContain('learner@example.test')
  })

  it('explains a failed send and a code that was already sent', () => {
    wrapper = mountPanel({ verification: verification({ delivery: 'failed' }) })
    expect(wrapper.get('[role="status"]').text()).toContain('could not send the code')
    wrapper.unmount()
    wrapper = mountPanel({ verification: verification({ delivery: 'recent' }) })
    expect(wrapper.get('[role="status"]').text()).toContain('already sent')
  })

  it('clears the boxes and returns to the first one when a code is rejected', async () => {
    wrapper = mountPanel()
    await paste(wrapper, '123456')
    await wrapper.setProps({ error: 'That code is not right.' })
    await nextTick()
    expect(values(wrapper)).toEqual(['', '', '', '', '', ''])
    expect(wrapper.get('[role="alert"]').text()).toContain('That code is not right.')
    expect(document.activeElement).toBe(boxes(wrapper)[0].element)
    boxes(wrapper).forEach((box) => expect(box.attributes('aria-invalid')).toBe('true'))
  })

  it('emits cancel for a different email', async () => {
    wrapper = mountPanel()
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Use a different email')
      .trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('stops its countdown when unmounted', () => {
    wrapper = mountPanel()
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
    wrapper = null
  })
})
