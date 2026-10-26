import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createApp, h, nextTick, ref } from 'vue'
import { sendVerifierMessage, startSession } from '../simulator.js'
import ConversationTabs from '../components/ConversationTabs.vue'
import Screen from '../SocialEngineeringSimulator.vue'
import ChatThread from '../components/ChatThread.vue'
import DebriefPanel from '../components/DebriefPanel.vue'
import DecisionBar from '../components/DecisionBar.vue'
import MessageComposer from '../components/MessageComposer.vue'
import ScenarioBrief from '../components/ScenarioBrief.vue'

vi.mock('../../../features/attempts/api.js', async (original) => ({
  ...(await original()),
  listAttemptContexts: vi.fn().mockResolvedValue({ cohorts: [], total: 0 }),
}))

vi.mock('../simulator.js', async (original) => ({
  ...(await original()),
  startSession: vi.fn(),
  sendMessage: vi.fn(),
  completeSession: vi.fn(),
  sendVerifierMessage: vi.fn(),
  requestNudge: vi.fn(),
}))

describe('scenario brief', () => {
  const props = {
    brief: {
      title: 'IT Service Desk is paging you',
      objective: 'A help-desk agent asks for the reset code.',
      turnBudget: 8,
    },
    persona: { id: 'it-helpdesk', displayName: 'Jordan Vale (IT Service Desk)' },
  }

  it('shows the brief and persona and emits start', async () => {
    const wrapper = mount(ScenarioBrief, { props })
    expect(wrapper.text()).toContain('IT Service Desk is paging you')
    expect(wrapper.text()).toContain('Jordan Vale (IT Service Desk)')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('start')).toHaveLength(1)
  })

  it('shows the reset code in the brief when one is provided', () => {
    const wrapper = mount(ScenarioBrief, { props: { ...props, resetCode: 'SYNTH-RESET-4821' } })
    expect(wrapper.get('[data-testid="soc-reset-code"]').text()).toBe('SYNTH-RESET-4821')
  })

  it('renders the brief without a code when the server sends none', () => {
    const wrapper = mount(ScenarioBrief, { props })
    expect(wrapper.find('[data-testid="soc-reset-code"]').exists()).toBe(false)
  })
})

describe('chat thread', () => {
  it('renders both speakers and a pending indicator', () => {
    const wrapper = mount(ChatThread, {
      props: {
        messages: [
          { role: 'colleague', content: 'Hi there' },
          { role: 'you', content: 'Who is this?' },
        ],
        pending: true,
        personaName: 'Jordan Vale',
      },
    })
    expect(wrapper.get('[role="log"]').attributes('aria-live')).toBe('polite')
    expect(wrapper.text()).toContain('Hi there')
    expect(wrapper.text()).toContain('Who is this?')
    expect(wrapper.get('[role="status"]').text()).toContain('replying')
  })
})

describe('message composer', () => {
  it('emits the trimmed text on submit and clears the field', async () => {
    const wrapper = mount(MessageComposer, { props: { disabled: false, maxLength: 1000 } })
    const field = wrapper.get('textarea')
    await field.setValue('  hello there  ')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('send')[0]).toEqual(['hello there'])
  })

  it('sends on Enter but not on Shift+Enter', async () => {
    const wrapper = mount(MessageComposer, { props: { disabled: false, maxLength: 1000 } })
    const field = wrapper.get('textarea')
    await field.setValue('ping')
    await field.trigger('keydown', { key: 'Enter', shiftKey: true })
    expect(wrapper.emitted('send')).toBeUndefined()
    await field.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('send')[0]).toEqual(['ping'])
  })

  it('does not emit when disabled', async () => {
    const wrapper = mount(MessageComposer, { props: { disabled: true, maxLength: 1000 } })
    await wrapper.get('textarea').setValue('nope')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('send')).toBeUndefined()
  })
})

describe('decision bar', () => {
  it('renders the three decisions and emits the chosen id', async () => {
    const wrapper = mount(DecisionBar, { props: { disabled: false } })
    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(3)
    await buttons[1].trigger('click')
    expect(wrapper.emitted('decide')[0]).toEqual(['verify-independently'])
  })

  it('gives no hint about which choice is right', () => {
    const wrapper = mount(DecisionBar, { props: { disabled: false } })
    const danger = wrapper.get('.soc-button-danger')
    expect(danger.get('.soc-decision-desc').text()).toBe('Hand over the reset code.')
    expect(wrapper.findAll('.soc-decision-note')).toHaveLength(0)
    expect(wrapper.text()).not.toMatch(/unsafe/i)
  })

  it('disables every choice when asked', () => {
    const wrapper = mount(DecisionBar, { props: { disabled: true } })
    expect(
      wrapper.findAll('button').every((button) => button.attributes('disabled') !== undefined),
    ).toBe(true)
  })
})

describe('debrief panel', () => {
  const result = {
    score: 75,
    maxScore: 100,
    outcome: 'partial',
    breakdown: [
      { key: 'noLeak', label: 'Protected the reset code', points: 60, max: 60 },
      { key: 'verify', label: 'Verified through an independent channel', points: 0, max: 25 },
      { key: 'efficiency', label: 'Stayed within the turn budget', points: 15, max: 15 },
    ],
    debrief: {
      summary: 'You protected the code.',
      tactic: 'authority',
      saferesponse: 'verify',
      note: '',
    },
    saved: false,
  }

  it('shows the score, breakdown and saved confirmation and emits restart', async () => {
    const wrapper = mount(DebriefPanel, { props: { result: { ...result, saved: true } } })
    expect(wrapper.text()).toContain('75 / 100')
    expect(wrapper.text()).toContain('Protected the reset code')
    expect(wrapper.text()).toContain('Result saved to your account.')
    expect(wrapper.text()).not.toContain('Try saving again')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('restart')).toHaveLength(1)
  })

  it('shows the save error and emits retry-save when the result was not saved', async () => {
    const unsaved = { ...result, saveError: { code: 'X', message: 'Could not save.' } }
    const wrapper = mount(DebriefPanel, { props: { result: unsaved } })
    expect(wrapper.text()).toContain('Could not save.')
    expect(wrapper.text()).not.toContain('Result saved to your account.')
    await wrapper.get('[role="alert"] button').trigger('click')
    expect(wrapper.emitted('retry-save')).toHaveLength(1)
  })

  it('disables the retry button while retrying', () => {
    const wrapper = mount(DebriefPanel, { props: { result, retrying: true } })
    expect(wrapper.get('[role="alert"] button').attributes('disabled')).toBeDefined()
  })

  it.each([
    [false, 'resisted', 'Resisted'],
    [false, 'partial', 'Partly safe'],
    [false, 'compromised', 'Compromised'],
    [true, 'resisted', 'Handled correctly'],
    [true, 'partial', 'Over-cautious'],
    [true, 'compromised', 'Shared too soon'],
  ])('labels legitimate=%s %s as %s', (legitimate, outcome, label) => {
    const wrapper = mount(DebriefPanel, { props: { result: { ...result, legitimate, outcome } } })
    expect(wrapper.get('.soc-debrief-eyebrow').text()).toContain(label)
  })

  it('treats a result without a legitimate flag as an attack', () => {
    const wrapper = mount(DebriefPanel, { props: { result } })
    expect(wrapper.get('.soc-debrief-eyebrow').text()).toContain('Partly safe')
  })
})

describe('conversation tabs', () => {
  const tabs = [
    { id: 'attacker', label: 'Jordan Vale', unread: 0 },
    { id: 'verifier', label: 'Marcus Tan', unread: 2 },
  ]

  it('renders a tablist with the active tab selected and unread as text', () => {
    const wrapper = mount(ConversationTabs, { props: { tabs, activeId: 'attacker' } })
    expect(wrapper.get('[role="tablist"]').exists()).toBe(true)
    const buttons = wrapper.findAll('[role="tab"]')
    expect(buttons).toHaveLength(2)
    expect(buttons[0].attributes('aria-selected')).toBe('true')
    expect(buttons[1].attributes('aria-selected')).toBe('false')
    expect(buttons[0].attributes('tabindex')).toBe('0')
    expect(buttons[1].attributes('tabindex')).toBe('-1')
    expect(buttons[1].text()).toContain('2 new')
    expect(buttons[0].text()).not.toContain('new')
  })

  it('emits select on click and ArrowRight/ArrowLeft', async () => {
    const wrapper = mount(ConversationTabs, { props: { tabs, activeId: 'attacker' } })
    const buttons = wrapper.findAll('[role="tab"]')
    await buttons[1].trigger('click')
    expect(wrapper.emitted('select')[0]).toEqual(['verifier'])
    await buttons[0].trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('select')[1]).toEqual(['verifier'])
    await buttons[0].trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('select')[2]).toEqual(['verifier'])
  })
})

describe('decision bar in colleague mode', () => {
  it('hides only the verify button and drops the explanatory hint', () => {
    const wrapper = mount(DecisionBar, {
      props: { hideVerify: true, colleagueName: 'Marcus Tan' },
    })
    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0].text()).toContain('Refuse and end')
    expect(buttons[1].text()).toContain('Share the code')
    expect(wrapper.text()).not.toContain('Verify through a known channel')
    expect(wrapper.find('.soc-decisions-hint').exists()).toBe(false)
    expect(buttons.every((b) => b.attributes('disabled') === undefined)).toBe(true)
  })

  it('emits refuse and share-code from the two remaining buttons', async () => {
    const wrapper = mount(DecisionBar, { props: { hideVerify: true, colleagueName: 'Marcus Tan' } })
    const buttons = wrapper.findAll('button')
    await buttons[0].trigger('click')
    await buttons[1].trigger('click')
    expect(wrapper.emitted('decide')).toEqual([['refuse'], ['share-code']])
  })

  it('is unchanged by default: three enabled buttons and the original hint', () => {
    const wrapper = mount(DecisionBar, { props: {} })
    expect(wrapper.findAll('button')).toHaveLength(3)
    expect(wrapper.findAll('button').every((b) => b.attributes('disabled') === undefined)).toBe(
      true,
    )
    expect(wrapper.text()).toContain('Check who is really asking before you decide.')
    expect(wrapper.text()).not.toMatch(/safe play|protecting/i)
    expect(wrapper.text()).not.toContain('Check this request with')
  })

  it('marks the two-choice rail as compact so the cards keep their natural height', () => {
    const colleague = mount(DecisionBar, {
      props: { hideVerify: true, colleagueName: 'Marcus Tan' },
    })
    expect(colleague.find('.soc-decisions').classes()).toContain('is-compact')
    const fallback = mount(DecisionBar, { props: {} })
    expect(fallback.find('.soc-decisions').classes()).not.toContain('is-compact')
  })
})

describe('reset code card in the decision rail', () => {
  it('shows the player their reset code at the top of the rail, in both modes', () => {
    for (const props of [
      { resetCode: 'SYNTH-RESET-4821' },
      { resetCode: 'SYNTH-RESET-4821', hideVerify: true },
    ]) {
      const wrapper = mount(DecisionBar, { props })
      const card = wrapper.find('.soc-code-card')
      expect(card.exists()).toBe(true)
      expect(card.text()).toContain('Your reset code')
      expect(card.find('[data-testid="soc-reset-code-chat"]').text()).toBe('SYNTH-RESET-4821')
      expect(wrapper.find('.soc-decisions').element.firstElementChild).toBe(card.element)
    }
  })

  it('is absent when the server sent no code', () => {
    expect(mount(DecisionBar, { props: {} }).find('.soc-code-card').exists()).toBe(false)
  })
})

describe('colleague card in the decision rail', () => {
  it('shows the colleague name and role in colleague mode', () => {
    const wrapper = mount(DecisionBar, {
      props: { hideVerify: true, colleagueName: 'Marcus Tan', colleagueRole: 'IT Service Centre' },
    })
    const card = wrapper.find('.soc-colleague-card')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain('Marcus Tan')
    expect(card.text()).toContain('IT Service Centre')
  })

  it('shows initials in an avatar that screen readers skip', () => {
    const avatar = (name) =>
      mount(DecisionBar, { props: { hideVerify: true, colleagueName: name } }).find(
        '.soc-colleague-avatar',
      )
    expect(avatar('Marcus Tan').text()).toBe('MT')
    expect(avatar('Marcus Tan').attributes('aria-hidden')).toBe('true')
    expect(avatar('Lee Ann Goh').text()).toBe('LA')
    expect(avatar('Dana').text()).toBe('D')
  })

  it('is absent in fallback mode and omits an empty role', () => {
    expect(mount(DecisionBar, { props: {} }).find('.soc-colleague-card').exists()).toBe(false)
    const noRole = mount(DecisionBar, { props: { hideVerify: true, colleagueName: 'Marcus Tan' } })
    expect(noRole.find('.soc-colleague-card').exists()).toBe(true)
    expect(noRole.find('.soc-colleague-role').exists()).toBe(false)
  })
})

describe('debrief your check section', () => {
  const result = {
    score: 90,
    maxScore: 100,
    outcome: 'resisted',
    breakdown: [],
    debrief: { summary: 's', tactic: 't', saferesponse: 'r', note: '' },
  }

  it('lists the check conversation with escaped text', () => {
    const wrapper = mount(DebriefPanel, {
      props: {
        result,
        verifierName: 'Marcus Tan',
        verifierMessages: [
          { role: 'you', content: 'Did Jordan page you?' },
          { role: 'colleague', content: '<b>No</b>' },
        ],
      },
    })
    expect(wrapper.text()).toContain('Your check')
    const items = wrapper.findAll('.soc-check li')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('You')
    expect(items[1].text()).toContain('Marcus Tan')
    expect(items[1].text()).toContain('<b>No</b>')
    expect(wrapper.find('.soc-check b').exists()).toBe(false)
  })

  it('omits the section without messages', () => {
    const wrapper = mount(DebriefPanel, { props: { result } })
    expect(wrapper.text()).not.toContain('Your check')
  })
})

describe('composer restoreText', () => {
  // mounted with the app's own Vue (createApp) so v-model and watchers run on one runtime
  it('restores failed text into an empty draft only', async () => {
    const restore = ref('')
    const el = document.createElement('div')
    // eslint-disable-next-line vue/one-component-per-file
    const app = createApp({ render: () => h(MessageComposer, { restoreText: restore.value }) })
    app.mount(el)
    const field = el.querySelector('textarea')
    restore.value = 'lost words'
    await nextTick()
    expect(field.value).toBe('lost words')

    field.value = 'typing now'
    field.dispatchEvent(new Event('input'))
    restore.value = ''
    await nextTick()
    restore.value = 'second'
    await nextTick()
    expect(field.value).toBe('typing now')
    app.unmount()
  })
})

// the screen is mounted with the app's own Vue (createApp) so its lifecycle hooks and
// reactivity run against the same runtime as the composable
describe('simulator screen with a colleague', () => {
  const base = {
    sessionId: '11111111-1111-1111-1111-111111111111',
    persona: { id: 'it-helpdesk', displayName: 'Jordan Vale' },
    brief: { title: 't', objective: 'o', turnBudget: 8 },
    openingMessage: 'attacker line',
  }

  async function mountScreen(verifier) {
    startSession.mockResolvedValue({ ...base, verifier })
    const el = document.createElement('div')
    document.body.append(el)
    const app = createApp(Screen)
    // eslint-disable-next-line vue/one-component-per-file
    app.component('RouterLink', { render: () => h('a') })
    app.mount(el)
    await flushPromises()
    el.querySelector('form button').click()
    await flushPromises()
    el.querySelector('.soc-brief button, button').click()
    await flushPromises()
    return { app, el }
  }

  const tabButtons = (el) => [...el.querySelectorAll('[role="tab"]')]
  const verifyButton = (el) =>
    [...el.querySelectorAll('.soc-decisions button')].find((b) =>
      b.textContent.includes('Verify through a known channel'),
    )
  const decisionCount = (el) => el.querySelectorAll('.soc-decisions button').length

  it('shows the chooser first and starts the run with the chosen context', async () => {
    startSession.mockResolvedValue({ ...base, verifier: null })
    const el = document.createElement('div')
    document.body.append(el)
    const app = createApp(Screen)
    // eslint-disable-next-line vue/one-component-per-file
    app.component('RouterLink', { render: () => h('a') })
    app.mount(el)
    await flushPromises()
    expect(startSession).not.toHaveBeenCalled()
    expect(el.textContent).toContain('Save this case to')
    el.querySelector('form button').click()
    await flushPromises()
    expect(startSession).toHaveBeenCalledWith({ kind: 'personal' }, expect.anything())
    expect(el.textContent).toContain('Begin the conversation')
    app.unmount()
    el.remove()
  })

  it('restores the draft after each of two identical failed colleague sends', async () => {
    sendVerifierMessage.mockRejectedValue({
      response: {
        status: 503,
        data: { error: { code: 'LLM_UPSTREAM_UNAVAILABLE', message: 'no' } },
      },
    })
    const { app, el } = await mountScreen({ displayName: 'Marcus Tan', turnBudget: 5 })
    tabButtons(el)[1].click()
    await nextTick()
    const field = el.querySelector('textarea')
    const sendText = async (text) => {
      field.value = text
      field.dispatchEvent(new Event('input'))
      await nextTick()
      el.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }))
      await flushPromises()
    }
    await sendText('hello')
    expect(field.value).toBe('hello')
    await sendText('hello')
    expect(sendVerifierMessage).toHaveBeenCalledTimes(2)
    expect(field.value).toBe('hello')
    app.unmount()
    el.remove()
  })

  it('shows no tab strip and an enabled verify button without a colleague', async () => {
    const { app, el } = await mountScreen(null)
    expect(el.querySelector('[role="tablist"]')).toBeNull()
    expect(decisionCount(el)).toBe(3)
    expect(verifyButton(el).disabled).toBe(false)
    expect(el.textContent).not.toContain('Check this request with')
    expect(el.textContent).toContain('Turn 0 of 8')
    app.unmount()
    el.remove()
  })

  it('shows the strip, drops the verify decision, and switches thread contents', async () => {
    sendVerifierMessage.mockResolvedValue({
      reply: 'colleague line',
      verifierTurnsUsed: 1,
      verifierTurnBudget: 5,
      leaked: false,
      ended: false,
    })
    const { app, el } = await mountScreen({ displayName: 'Marcus Tan', turnBudget: 5 })
    expect(tabButtons(el)).toHaveLength(2)
    expect(el.textContent).toContain('attacker line')
    expect(decisionCount(el)).toBe(2)
    expect(verifyButton(el)).toBeUndefined()
    expect(el.textContent).toContain('Your colleague')

    tabButtons(el)[1].click()
    await nextTick()
    expect(el.textContent).toContain('Checks 0 of 5')
    expect(el.textContent).not.toContain('attacker line')

    const field = el.querySelector('textarea')
    field.value = 'hi'
    field.dispatchEvent(new Event('input'))
    await nextTick()
    el.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }))
    await flushPromises()
    expect(sendVerifierMessage).toHaveBeenCalled()
    expect(el.textContent).toContain('colleague line')
    expect(el.textContent).toContain('Checks 1 of 5')
    expect(verifyButton(el)).toBeUndefined()

    tabButtons(el)[0].click()
    await nextTick()
    expect(el.textContent).toContain('attacker line')
    expect(el.textContent).toContain('Turn 0 of 8')
    app.unmount()
    el.remove()
  })
})
