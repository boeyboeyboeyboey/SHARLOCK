import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TriageEmailCard from '../components/TriageEmailCard.vue'
import TriageStatusBar from '../components/TriageStatusBar.vue'
import RoundFeedback from '../components/RoundFeedback.vue'
import TriageDebrief from '../components/TriageDebrief.vue'

const email = {
  roundId: 'r1',
  tier: 2,
  senderName: 'Aurora IT',
  senderAddress: 'it@aurora-dynarnics.example',
  replyTo: 'help@relay.example',
  subject: 'Verify now',
  receivedLabel: 'Mon 09:14',
  parts: [
    { id: 'p-sender', kind: 'sender', name: 'Aurora IT', address: 'it@aurora-dynarnics.example' },
    { id: 'p-reply', kind: 'replyTo', address: 'help@relay.example' },
    { id: 'p-body', kind: 'body', text: 'Your access expires today.' },
    { id: 'p-req', kind: 'request', text: 'Send the new bank details.' },
    {
      id: 'p-link',
      kind: 'link',
      label: 'Verify account',
      destination: 'https://evil.example/login',
    },
    { id: 'p-file', kind: 'attachment', fileName: 'invoice.zip', sizeLabel: '2 MB' },
    {
      id: 'p-qr',
      kind: 'qr',
      caption: 'Scan to sign in',
      decodedDestination: 'https://qr.example',
    },
  ],
}

const card = (props = {}) =>
  mount(TriageEmailCard, { props: { email, ...props }, attachTo: document.body })

describe('TriageEmailCard', () => {
  it('renders every part kind without anchors', () => {
    const wrapper = card()
    const text = wrapper.text()
    expect(text).toContain('Aurora IT')
    expect(text).toContain('it@aurora-dynarnics.example')
    expect(text).toContain('help@relay.example')
    expect(text).toContain('Verify now')
    expect(text).toContain('Mon 09:14')
    expect(text).toContain('Your access expires today.')
    expect(text).toContain('Send the new bank details.')
    expect(text).toContain('Verify account')
    expect(text).toContain('Goes to: https://evil.example/login')
    expect(text).toContain('invoice.zip · 2 MB')
    expect(text).toContain('Scan to sign in')
    expect(text).toContain('Points to: https://qr.example')
    expect(wrapper.find('a').exists()).toBe(false)
    expect(wrapper.find('[href]').exists()).toBe(false)
    expect(wrapper.findAll('button')).toHaveLength(0)
    wrapper.unmount()
  })

  it('makes every part a named button while picking and emits the part id', async () => {
    const wrapper = card({ picking: true })
    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(7)
    expect(wrapper.find('button[aria-label^="Report sender: Aurora IT <it@"]').exists()).toBe(true)
    await wrapper.find('button[aria-label^="Report link"]').trigger('click')
    expect(wrapper.emitted('select-part')[0]).toEqual(['p-link'])
    wrapper.unmount()
  })

  it('moves focus to the first part when picking starts', async () => {
    const wrapper = card()
    await wrapper.setProps({ picking: true })
    await wrapper.vm.$nextTick()
    expect(document.activeElement).toBe(wrapper.find('button').element)
    wrapper.unmount()
  })

  it('emits cancel-pick on Escape', async () => {
    const wrapper = card({ picking: true })
    await wrapper.find('button').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('cancel-pick')).toHaveLength(1)
    wrapper.unmount()
  })

  it('marks highlighted parts with text', () => {
    const wrapper = card({ highlightIds: ['p-link'] })
    expect(wrapper.findAll('.triage-tell-mark')).toHaveLength(1)
    expect(wrapper.text()).toContain('What gave it away')
    wrapper.unmount()
  })
})

describe('TriageStatusBar', () => {
  it('shows timer, score, streak multiplier and mistakes when timed', () => {
    const wrapper = mount(TriageStatusBar, {
      props: { timed: true, secondsLeft: 125, score: 80, streak: 3, mistakes: 1, maxMistakes: 3 },
    })
    expect(wrapper.find('[role="timer"]').text()).toBe('2:05')
    expect(wrapper.text()).toContain('Score 80')
    expect(wrapper.text()).toContain('Streak 3 ×2')
    expect(wrapper.text()).toContain('Mistakes 1 of 3')
    expect(wrapper.text()).not.toContain('Email')
  })

  it('shows a x3 multiplier from streak 6', () => {
    const wrapper = mount(TriageStatusBar, { props: { timed: true, secondsLeft: 90, streak: 6 } })
    expect(wrapper.text()).toContain('×3')
  })

  it('shows email progress when practising', () => {
    const wrapper = mount(TriageStatusBar, {
      props: { timed: false, score: 20, streak: 1, roundsPlayed: 4, totalRounds: 12 },
    })
    expect(wrapper.text()).toContain('Email 5 of 12')
    expect(wrapper.text()).toContain('Score 20')
    expect(wrapper.find('[role="timer"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Mistakes')
  })

  it('announces each time warning once', async () => {
    const wrapper = mount(TriageStatusBar, { props: { timed: true, secondsLeft: 75 } })
    const live = () => wrapper.find('[aria-live="polite"]').text()
    expect(live()).toBe('')
    await wrapper.setProps({ secondsLeft: 60 })
    expect(live()).toBe('1 minute left')
    await wrapper.setProps({ secondsLeft: 30 })
    expect(live()).toBe('30 seconds left')
    await wrapper.setProps({ secondsLeft: 10 })
    expect(live()).toBe('10 seconds left')
    await wrapper.setProps({ secondsLeft: 9 })
    expect(live()).toBe('10 seconds left')
  })
})

const last = {
  roundId: 'r1',
  call: 'report',
  partId: 'p-link',
  correct: true,
  tellHit: true,
  points: 40,
  verdict: 'phish',
  type: 'linkMismatch',
  tellPartIds: ['p-link'],
  explanation: 'The link text and destination differ.',
}

describe('RoundFeedback', () => {
  it('shows the timed strip variants without a button', () => {
    const correct = mount(RoundFeedback, { props: { last, email: null, timed: true } })
    expect(correct.text()).toBe('Correct +40')
    expect(correct.find('button').exists()).toBe(false)

    const partial = mount(RoundFeedback, {
      props: { last: { ...last, tellHit: false, points: 20 }, email: null, timed: true },
    })
    expect(partial.text()).toBe('Correct, but not the main tell +20')

    const mistake = mount(RoundFeedback, {
      props: {
        last: { ...last, correct: false, points: 0, call: 'trust' },
        email: null,
        timed: true,
      },
    })
    expect(mistake.text()).toBe('Mistake: Link goes elsewhere')
  })

  it('shows practice detail, focuses the next button and emits next', async () => {
    const wrapper = mount(RoundFeedback, {
      props: { last, email, timed: false },
      attachTo: document.body,
    })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('h3').text()).toBe('Phish')
    expect(wrapper.text()).toContain('Link goes elsewhere')
    expect(wrapper.text()).toContain('The link text and destination differ.')
    expect(wrapper.text()).toContain('Verify now')
    expect(wrapper.text()).toContain('What gave it away')
    const next = wrapper.find('button')
    expect(next.text()).toBe('Next email')
    expect(document.activeElement).toBe(next.element)
    await next.trigger('click')
    expect(wrapper.emitted('next')).toHaveLength(1)
    wrapper.unmount()
  })

  it('omits the email when it is not the previous round and offers results at the end', () => {
    const wrapper = mount(RoundFeedback, {
      props: { last, email: { ...email, roundId: 'other' }, timed: false, runOver: true },
    })
    expect(wrapper.text()).not.toContain('Verify now')
    expect(wrapper.find('button').text()).toBe('See results')
  })
})

const review = [
  {
    tier: 1,
    verdict: 'phish',
    type: 'lookalike',
    senderAddress: 'a@x.example',
    subject: 'First',
    call: 'report',
    correct: true,
    tellHit: true,
    points: 10,
    explanation: 'Domain is off by one letter.',
  },
  {
    tier: 1,
    verdict: 'legit',
    type: 'legit',
    senderAddress: 'b@y.example',
    subject: 'Second',
    call: 'report',
    correct: false,
    tellHit: false,
    points: 0,
    explanation: 'This one was genuine.',
  },
]

describe('TriageDebrief', () => {
  it('summarises the run and lists every round', () => {
    const wrapper = mount(TriageDebrief, {
      props: { review, score: 10, mistakes: 1, roundsPlayed: 2, timed: true, endReason: 'time' },
    })
    expect(wrapper.find('h2').text()).toBe('Run complete')
    expect(wrapper.text()).toContain("Time's up")
    expect(wrapper.text()).toContain('Timed class run')
    expect(wrapper.text()).toContain('Correct calls1 of 2')
    expect(wrapper.text()).toContain('Mistakes1')
    const items = wrapper.findAll('ol > li')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('First')
    expect(items[0].text()).toContain('a@x.example')
    expect(items[0].text()).toContain('Correct')
    expect(items[0].text()).toContain('Lookalike domain')
    expect(items[1].text()).toContain('Mistake')
    expect(items[1].text()).toContain('Genuine email')
    expect(items[1].text()).toContain('This one was genuine.')
  })

  it('shows the other end lines and practice mode', () => {
    const mistakes = mount(TriageDebrief, { props: { review, endReason: 'mistakes', timed: true } })
    expect(mistakes.text()).toContain('Ended on the third mistake')
    const rounds = mount(TriageDebrief, { props: { review, endReason: 'rounds', timed: false } })
    expect(rounds.text()).toContain('All 12 emails checked')
    expect(rounds.text()).toContain('Practice')
  })

  it('shows the round cap end line and no play again button', () => {
    const wrapper = mount(TriageDebrief, { props: { review, endReason: 'cap', timed: false } })
    expect(wrapper.text()).toContain('Round limit reached')
    expect(wrapper.findAll('button').filter((item) => item.text() === 'Play again')).toHaveLength(0)
  })
})

describe('TriageStatusBar motion', () => {
  afterEach(() => vi.unstubAllGlobals())

  const reducedMotion = (reduce) =>
    vi.stubGlobal('matchMedia', () => ({ matches: reduce, addEventListener() {} }))

  it('exposes the remaining time on a draining bar', async () => {
    const wrapper = mount(TriageStatusBar, { props: { timed: true, secondsLeft: 90 } })
    const bar = wrapper.get('[role="progressbar"]')
    expect(bar.attributes('aria-valuenow')).toBe('90')
    expect(bar.attributes('aria-valuetext')).toBe('1:30')
    await wrapper.setProps({ secondsLeft: 25 })
    expect(bar.attributes('aria-valuenow')).toBe('25')
    expect(wrapper.get('[role="timer"]').text()).toBe('0:25')
  })

  it('shows the multiplier badge only from streak 3', async () => {
    const wrapper = mount(TriageStatusBar, { props: { timed: true, secondsLeft: 90, streak: 2 } })
    expect(wrapper.text()).not.toContain('×')
    await wrapper.setProps({ streak: 3 })
    expect(wrapper.text()).toContain('Streak 3 ×2')
    await wrapper.setProps({ streak: 6 })
    expect(wrapper.text()).toContain('Streak 6 ×3')
  })

  it('jumps straight to the new score under reduced motion', async () => {
    reducedMotion(true)
    const wrapper = mount(TriageStatusBar, { props: { timed: true, secondsLeft: 90, score: 10 } })
    await wrapper.setProps({ score: 90 })
    expect(wrapper.text()).toContain('Score 90')
  })

  it('counts the score up and cancels the frame on unmount', async () => {
    reducedMotion(false)
    let pending = null
    vi.stubGlobal('requestAnimationFrame', (callback) => {
      pending = callback
      return 7
    })
    const cancel = vi.fn()
    vi.stubGlobal('cancelAnimationFrame', cancel)
    window.requestAnimationFrame = globalThis.requestAnimationFrame
    window.cancelAnimationFrame = cancel
    const wrapper = mount(TriageStatusBar, { props: { timed: true, secondsLeft: 90, score: 10 } })
    await wrapper.setProps({ score: 110 })
    expect(wrapper.text()).toContain('Score 10')
    pending(0)
    pending(250)
    await wrapper.vm.$nextTick()
    const mid = Number(wrapper.text().match(/Score (\d+)/)[1])
    expect(mid).toBeGreaterThan(10)
    expect(mid).toBeLessThan(110)
    pending(1000)
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Score 110')
    await wrapper.setProps({ score: 200 })
    wrapper.unmount()
    expect(cancel).toHaveBeenCalled()
  })
})

describe('RoundFeedback stamp', () => {
  it('stamps the call as text on the practice feedback', () => {
    const base = {
      roundId: 'r1',
      verdict: 'phish',
      correct: true,
      type: 'lookalike',
      explanation: 'x',
      points: 10,
      tellPartIds: [],
    }
    const reported = mount(RoundFeedback, { props: { last: { ...base, call: 'report' } } })
    expect(reported.text()).toContain('Reported')
    const trusted = mount(RoundFeedback, {
      props: { last: { ...base, call: 'trust', correct: false } },
    })
    expect(trusted.text()).toContain('Trusted')
  })
})
