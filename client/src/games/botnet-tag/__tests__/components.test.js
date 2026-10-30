import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import NeedsThreeD from '../components/NeedsThreeD.vue'
import TagHud from '../components/TagHud.vue'
import TagLobby from '../components/TagLobby.vue'
import TagResults from '../components/TagResults.vue'
import TouchControls from '../components/TouchControls.vue'
import UsePrompt from '../components/UsePrompt.vue'

const link = { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } }
const players = [
  { sid: 'me', username: 'ada', avatarId: 'mint', ready: true, isBot: false },
  { sid: 'b1', username: 'Grace', avatarId: 'blue', ready: true, isBot: true },
  { sid: 'p2', username: 'noor', avatarId: 'peach', ready: false, isBot: false },
]

describe('lobby', () => {
  it('lists the players with ready and bot tags and the player count', () => {
    const wrapper = mount(TagLobby, { props: { players, sid: 'me', className: 'Class 1A' } })
    const cards = wrapper.findAll('[data-testid="tag-player"]')
    expect(cards).toHaveLength(3)
    expect(wrapper.get('[aria-label="3 of 8 players"]').text()).toBe('3/8')
    expect(wrapper.get('[data-testid="tag-class"]').text()).toBe('Class 1A')
    expect(cards[1].text()).toContain('Bot')
    expect(cards[2].text()).toContain('Waiting')
    expect(cards[0].text()).toContain('✓ Ready')
    expect(cards[0].text()).toContain('ada')
  })

  it('toggles ready through an emit and shows the countdown digit', async () => {
    const wrapper = mount(TagLobby, {
      props: { players, sid: 'p2', countdownMs: 7200 },
    })
    expect(wrapper.get('[data-testid="tag-countdown"]').text()).toContain('8')
    const button = wrapper.get('[data-testid="tag-ready"]')
    expect(button.attributes('aria-pressed')).toBe('false')
    await button.trigger('click')
    expect(wrapper.emitted('ready')).toEqual([[true]])
    await wrapper.setProps({ sid: 'me' })
    expect(wrapper.get('[data-testid="tag-ready"]').attributes('aria-pressed')).toBe('true')
    await wrapper.get('[data-testid="tag-ready"]').trigger('click')
    expect(wrapper.emitted('ready').at(-1)).toEqual([false])
  })

  it('shows no countdown before the start', () => {
    const wrapper = mount(TagLobby, { props: { players, sid: 'me' } })
    expect(wrapper.get('[data-testid="tag-countdown"]').text()).toBe('')
  })
})

const rows = [
  {
    sid: 'me',
    username: 'ada',
    outcome: 'survived',
    sideWon: true,
    survivalSeconds: 180,
    patches: 2,
    tags: 0,
    score: 380,
  },
  {
    sid: 'b1',
    username: 'Grace',
    outcome: 'infected',
    sideWon: false,
    survivalSeconds: 11,
    patches: 0,
    tags: 1,
    score: 41,
  },
]

describe('results', () => {
  it('shows the winning side, one row per player and the saved notice', () => {
    const wrapper = mount(TagResults, {
      props: {
        results: { sideWon: 'survivors', rows },
        sid: 'me',
        saved: { saved: true, score: 380, maxScore: 400 },
      },
    })
    expect(wrapper.get('h1').text()).toContain('Survivors win')
    const body = wrapper.findAll('tbody tr')
    expect(body).toHaveLength(2)
    expect(body[0].text()).toContain('ada')
    expect(body[0].text()).not.toContain('You')
    expect(body[0].text()).toContain('✓ Survived')
    expect(body[0].text()).toContain('3:00')
    expect(body[1].text()).toContain('✕ Infected')
    expect(wrapper.get('[data-testid="tag-saved"]').text()).toContain('380/400')
  })

  it('names the botnet win and reports a failed save', () => {
    const wrapper = mount(TagResults, {
      props: { results: { sideWon: 'botnet', rows }, saved: { saved: false } },
    })
    expect(wrapper.get('h1').text()).toContain('Botnet wins')
    expect(wrapper.get('[data-testid="tag-saved"]').text()).toBe('Not saved')
  })

  it('emits play again and leave', async () => {
    const wrapper = mount(TagResults, { props: { results: { sideWon: 'botnet', rows } } })
    await wrapper.get('[data-testid="tag-again"]').trigger('click')
    await wrapper.get('[data-testid="tag-leave"]').trigger('click')
    expect(wrapper.emitted('again')).toHaveLength(1)
    expect(wrapper.emitted('leave')).toHaveLength(1)
    expect(wrapper.find('[data-testid="tag-saved"]').exists()).toBe(false)
  })
})

describe('hud', () => {
  it('shows the clock, the botnet count and the status', () => {
    const wrapper = mount(TagHud, { props: { msLeft: 125_000, infected: 2, total: 6 } })
    expect(wrapper.get('[data-testid="tag-timer"]').text()).toContain('2:05')
    expect(wrapper.find('[data-testid="tag-urgent"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="tag-botnet-count"]').text()).toContain('2/6')
    expect(wrapper.findAll('.tag-pips i.is-on')).toHaveLength(2)
    expect(wrapper.get('[data-testid="tag-status"]').text()).toBe('Clean')
    expect(wrapper.find('[data-testid="tag-immunity"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="tag-toast"]').exists()).toBe(false)
  })

  it('warns in the final 30 seconds', () => {
    const wrapper = mount(TagHud, { props: { msLeft: 29_000, infected: 1, total: 3 } })
    expect(wrapper.get('[data-testid="tag-urgent"]').attributes('aria-label')).toBe(
      'Final 30 seconds',
    )
  })

  it('shows immunity with its seconds and the latest toast', () => {
    const wrapper = mount(TagHud, {
      props: { msLeft: 60_000, infected: 1, total: 4, immunityMs: 9_100, toast: 'Pip tagged Nori' },
    })
    expect(wrapper.get('[data-testid="tag-status"]').text()).toBe('Immune')
    expect(wrapper.get('[data-testid="tag-immunity"]').text()).toContain('10s')
    expect(wrapper.get('[data-testid="tag-toast"]').text()).toBe('Pip tagged Nori')
  })

  it('shows infected over immune', () => {
    const wrapper = mount(TagHud, {
      props: { msLeft: 1, infected: 1, total: 3, selfInfected: true },
    })
    expect(wrapper.get('[data-testid="tag-status"]').text()).toBe('Infected')
  })
})

describe('needs 3d', () => {
  it('says so and links back to the town', () => {
    const wrapper = mount(NeedsThreeD, { global: { stubs: link } })
    expect(wrapper.get('h1').text()).toBe('Needs 3D')
    expect(wrapper.get('[data-testid="tag-back"]').attributes('href')).toBe('/')
  })
})

describe('use prompt', () => {
  it('emits use when clicked and shows the lock seconds instead while locked', async () => {
    const ready = mount(UsePrompt)
    await ready.get('[data-testid="tag-use"]').trigger('click')
    expect(ready.emitted('use')).toHaveLength(1)
    const locked = mount(UsePrompt, { props: { lockMs: 2400 } })
    expect(locked.get('[data-testid="tag-locked"]').text()).toBe('Locked 3s')
    expect(locked.find('[data-testid="tag-use"]').exists()).toBe(false)
  })
})

describe('touch controls', () => {
  it('emits jump and sprint taps and shows the sprint state', async () => {
    const wrapper = mount(TouchControls, { props: { sprintPhase: 'cooldown', sprintAt: 5 } })
    await wrapper.get('[data-testid="tag-jump"]').trigger('click')
    await wrapper.get('[data-testid="tag-sprint"]').trigger('click')
    expect(wrapper.emitted('jump')).toHaveLength(1)
    expect(wrapper.emitted('sprint')).toHaveLength(1)
    expect(wrapper.get('[data-testid="tag-sprint"]').attributes('aria-disabled')).toBe('true')
    expect(wrapper.text()).toContain('Sprint recharging')
  })
})
