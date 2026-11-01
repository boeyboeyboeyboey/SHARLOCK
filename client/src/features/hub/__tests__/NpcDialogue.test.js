import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import NpcDialogue from '../NpcDialogue.vue'

const props = { name: 'Postmaster', line: 'Sorted ten thousand letters.' }

describe('npc dialogue panel', () => {
  it('shows the speaker and the line as a labelled dialog', () => {
    const wrapper = mount(NpcDialogue, { props })
    expect(wrapper.get('[role="dialog"]').attributes('aria-labelledby')).toBe('npc-dialogue-name')
    expect(wrapper.get('h2').text()).toBe('Postmaster')
    expect(wrapper.get('[data-testid="npc-line"]').text()).toBe(props.line)
  })

  it('offers Next until the last line', async () => {
    const wrapper = mount(NpcDialogue, { props: { ...props, canEnter: true } })
    await wrapper.get('[data-testid="npc-next"]').trigger('click')
    expect(wrapper.emitted('next')).toHaveLength(1)
    expect(wrapper.find('[data-testid="npc-enter"]').exists()).toBe(false)
  })

  it('offers Go in and Close on the last line of a game keeper', async () => {
    const wrapper = mount(NpcDialogue, { props: { ...props, last: true, canEnter: true } })
    expect(wrapper.find('[data-testid="npc-next"]').exists()).toBe(false)
    await wrapper.get('[data-testid="npc-enter"]').trigger('click')
    await wrapper.get('[data-testid="npc-close"]').trigger('click')
    expect(wrapper.emitted('enter')).toHaveLength(1)
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('starts each new line at its top', async () => {
    const wrapper = mount(NpcDialogue, { props })
    const line = wrapper.get('[data-testid="npc-line"]').element
    line.scrollTop = 40
    await wrapper.setProps({ line: 'The next line.' })
    expect(line.scrollTop).toBe(0)
  })

  it('offers only Bye for a wanderer', async () => {
    const wrapper = mount(NpcDialogue, { props: { ...props, last: true } })
    expect(wrapper.find('[data-testid="npc-enter"]').exists()).toBe(false)
    const bye = wrapper.get('[data-testid="npc-close"]')
    expect(bye.text()).toBe('Bye')
    await bye.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('announces each new line and keeps focus when the last line swaps the buttons', async () => {
    const wrapper = mount(NpcDialogue, {
      props: { name: 'Publican', line: 'First', last: false, canEnter: true },
      attachTo: document.body,
    })
    expect(wrapper.get('[data-testid="npc-line"]').attributes('aria-live')).toBe('polite')
    wrapper.get('[data-testid="npc-next"]').element.focus()
    await wrapper.setProps({ line: 'Last', last: true })
    await nextTick()
    expect(document.activeElement).toBe(wrapper.get('[data-testid="npc-enter"]').element)
    wrapper.unmount()
  })

  it('does not take focus when it was elsewhere', async () => {
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    const wrapper = mount(NpcDialogue, {
      props: { name: 'Sweeper', line: 'First', last: false },
      attachTo: document.body,
    })
    await wrapper.setProps({ line: 'Last', last: true })
    await nextTick()
    expect(document.activeElement).toBe(outside)
    wrapper.unmount()
    outside.remove()
  })
})
