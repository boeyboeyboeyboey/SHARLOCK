import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import AccessMatrix from '../components/AccessMatrix.vue'
import DayControls from '../components/DayControls.vue'
import EventLog from '../components/EventLog.vue'
import HintPanel from '../components/HintPanel.vue'
import LabelBoard from '../components/LabelBoard.vue'
import LevelDebrief from '../components/LevelDebrief.vue'
import LevelSelect from '../components/LevelSelect.vue'
import PredictionPanel from '../components/PredictionPanel.vue'
import RoleDesigner from '../components/RoleDesigner.vue'
import TowerView from '../components/TowerView.vue'
import {
  findLevel,
  publicLevel,
} from '../../../../../server/src/modules/games/clearance-tower/levels.js'

const matrixLevel = publicLevel(findLevel('the-matrix'))
const labelLevel = publicLevel(findLevel('compartments'))
const roleLevel = publicLevel(findLevel('roles-not-people'))

describe('clearance tower components', () => {
  it('toggles matrix rights with labelled buttons and shows the same grants as lists', async () => {
    const wrapper = mount(AccessMatrix, {
      props: { agents: matrixLevel.agents, files: matrixLevel.files, modelValue: [] },
    })
    const button = wrapper.get('[aria-label="Director Hale may read Ops Plan"]')
    expect(button.attributes('aria-pressed')).toBe('false')
    await button.trigger('click')
    expect(wrapper.emitted('update:modelValue')[0][0]).toEqual([
      { subject: 'director', object: 'ops', rights: ['r'] },
    ])

    await wrapper.setProps({
      modelValue: [{ subject: 'director', object: 'ops', rights: ['r', 'w'] }],
      view: 'acl',
    })
    expect(wrapper.text()).toContain('Director Hale: r w')
    await wrapper.setProps({ view: 'capability' })
    expect(wrapper.text()).toContain('Ops Plan: r w')
    await wrapper.get('button[aria-pressed="false"]').trigger('click')
    expect(wrapper.emitted('update:view')).toHaveLength(1)
  })

  it('updates a file label level and its categories', async () => {
    const wrapper = mount(LabelBoard, {
      props: {
        files: labelLevel.files,
        clearances: labelLevel.clearances,
        categories: labelLevel.categories,
        modelValue: labelLevel.startPolicy.objectLabels,
      },
    })
    await wrapper.get('select').setValue('secret')
    expect(wrapper.emitted('update:modelValue')[0][0].cyber).toEqual({
      level: 'secret',
      categories: [],
    })
    await wrapper.get('input[type="checkbox"]').setValue(true)
    expect(wrapper.emitted('update:modelValue')[1][0].cyber.categories).toEqual(['defense'])
  })

  it('adds a role and warns about a separation of duties conflict', async () => {
    const wrapper = mount(RoleDesigner, {
      props: { level: roleLevel, modelValue: { roles: [], assignments: [] } },
    })
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Add role')
      .trigger('click')
    expect(wrapper.emitted('update:modelValue')[0][0].roles).toHaveLength(1)

    await wrapper.setProps({
      modelValue: {
        roles: [{ id: 'role-1', name: 'Boss', permissions: ['write-register', 'read-audit'] }],
        assignments: [{ agent: 'dee', roleIds: ['role-1'] }],
      },
    })
    expect(wrapper.get('[role="status"]').text()).toContain('Agent Tan')
  })

  it('records one verdict per call', async () => {
    const wrapper = mount(PredictionPanel, {
      props: { prompts: matrixLevel.predictions, modelValue: {} },
    })
    await wrapper.get('input[name="prediction-p2"][value="deny"]').setValue(true)
    expect(wrapper.emitted('update:modelValue')[0][0]).toEqual({ p2: 'deny' })
  })

  it('offers pause while playing and disables stepping once finished', async () => {
    const wrapper = mount(DayControls, { props: { playing: true, position: 2, total: 9 } })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('pause')).toHaveLength(1)
    expect(wrapper.text()).toContain('Event 2 of 9')
    await wrapper.setProps({ playing: false, finished: true })
    for (const button of wrapper.findAll('button'))
      expect(button.attributes('disabled')).toBeDefined()
  })

  it('shows who is acting and marks a leaked file in the tower', () => {
    const leak = {
      id: 'a1',
      kind: 'attack',
      outcome: 'leaked',
      story: 'Contractor Vance browses for the Ops Plan.',
      steps: [{ agent: 'contractor', action: 'read', file: 'ops', allowed: true, reason: 'ok' }],
    }
    const wrapper = mount(TowerView, {
      props: {
        level: matrixLevel,
        policy: { grants: [] },
        currentEvent: leak,
        shownEvents: [leak],
      },
    })
    expect(wrapper.get('[data-testid="clear-visitor"]').text()).toContain('Contractor Vance reads')
    expect(wrapper.get('[data-testid="clear-flagged-room"]').text()).toContain('Leaked')
    expect(wrapper.get('[aria-current="true"]').text()).toContain('Contractor Vance')
  })

  const stoppedChain = {
    id: 'a2',
    kind: 'attack',
    outcome: 'stopped',
    story: 'The template copies the Joint Report.',
    steps: [
      { agent: 'director', action: 'write', file: 'defense', allowed: false, reason: 'No write.' },
      {
        agent: 'liaison',
        action: 'read',
        file: 'defense',
        allowed: null,
        reason: 'An earlier step was blocked, so this never happened.',
      },
    ],
  }

  it('logs a step after a blocked one as not reached instead of allowed', () => {
    const wrapper = mount(EventLog, { props: { level: labelLevel, events: [stoppedChain] } })
    expect(wrapper.text()).toContain('Director Hale writes to Defense Plan: blocked')
    expect(wrapper.text()).toContain('Liaison Voss reads Defense Plan: not reached')
    expect(wrapper.text()).not.toContain('allowed')
  })

  it('leaves a step that was never reached out of the floor plan', () => {
    const policy = {
      objectLabels: Object.fromEntries(
        labelLevel.files.map((file) => [file.id, { level: 'secret', categories: [] }]),
      ),
    }
    const wrapper = mount(TowerView, {
      props: {
        level: labelLevel,
        policy,
        currentEvent: stoppedChain,
        shownEvents: [stoppedChain],
      },
    })
    const visitors = wrapper.findAll('[data-testid="clear-visitor"]')
    expect(visitors).toHaveLength(1)
    expect(visitors[0].text()).toContain('Director Hale')
    expect(wrapper.get('[aria-current="true"]').text()).toContain('Director Hale')
  })

  it('tells the player why a leak, the allowance and blocked work changed the score', () => {
    const result = {
      score: 60,
      stars: 1,
      breakdown: [],
      meters: {
        leaks: 1,
        topicBlockedByLeak: true,
        workDone: 7,
        workTotal: 10,
        workAllowance: 3,
        securityShare: 0.5,
        excessRights: 0,
        dutyConflicts: [],
      },
      predictionReview: [],
      takeaways: [],
    }
    const wrapper = mount(LevelDebrief, { props: { level: matrixLevel, result } })
    expect(wrapper.text()).toContain('topic is not achieved, whatever the score')
    expect(wrapper.text()).toContain('blocks 3 tasks, so 7 completed earns the full work row')
    expect(wrapper.text()).toContain('security rows are scaled down')
  })

  it('leaves the clear-4 notes out of a climb saved under an older ruleset', () => {
    const result = {
      score: 80,
      stars: 2,
      breakdown: [],
      meters: { leaks: 1, workDone: 10, workTotal: 10, excessRights: 0, dutyConflicts: [] },
      predictionReview: [],
      takeaways: [],
    }
    const wrapper = mount(LevelDebrief, { props: { level: matrixLevel, result } })
    expect(wrapper.text()).not.toContain('whatever the score')
    expect(wrapper.text()).not.toContain('earns the full work row')
    expect(wrapper.text()).not.toContain('scaled down')
  })

  it('explains the score, the calls and the edit comparison in the debrief', () => {
    const wrapper = mount(LevelDebrief, {
      props: {
        level: roleLevel,
        hasNext: false,
        result: {
          score: 91,
          stars: 2,
          breakdown: [{ key: 'leaks', label: 'No leaks', points: 40, max: 40 }],
          meters: {
            leaks: 0,
            workDone: 7,
            workTotal: 7,
            excessRights: 0,
            dutyConflicts: [],
            tampering: 0,
          },
          edits: { badgeEdits: 6, matrixEdits: 10 },
          predictionReview: [
            {
              id: 'p1',
              request: 'Agent Quinn, an Operator, reads Payroll.',
              verdict: 'deny',
              answer: 'allow',
              correct: false,
              explanation: 'Roles carry permissions.',
            },
          ],
          takeaways: ['Roles scale.'],
        },
      },
    })
    expect(wrapper.get('[aria-label="2 out of 3 stars"]').text()).toBe('★★☆')
    expect(wrapper.text()).toContain('You said Blocked; it is Allowed.')
    expect(wrapper.text()).toContain('6 badge edits')
    expect(wrapper.findAll('button').map((button) => button.text())).not.toContain('Next case')
    expect(wrapper.text()).toContain(`Source: ${roleLevel.slides}`)
    expect(wrapper.text()).not.toContain('not saved')
  })

  const buttonNamed = (wrapper, name) =>
    wrapper.findAll('button').find((button) => button.text().includes(name))
  const onePlayed = [
    { ...matrixLevel, submitted: true, result: { score: 90 } },
    { ...labelLevel, submitted: false },
  ]

  it('lists cases with their scores and enables Finish climb only when ready', async () => {
    const wrapper = mount(LevelSelect, { props: { levels: onePlayed, readyToComplete: false } })
    expect(wrapper.text()).toContain('Scored 90 / 100')
    expect(wrapper.text()).toContain('1 of 2 cases run')
    expect(buttonNamed(wrapper, 'Finish climb').attributes('disabled')).toBeDefined()
    await buttonNamed(wrapper, labelLevel.title).trigger('click')
    expect(wrapper.emitted('select')[0]).toEqual([labelLevel.id])
  })

  describe('confirming an unfinished climb', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('asks for a second press once the delay has passed', async () => {
      const wrapper = mount(LevelSelect, { props: { levels: onePlayed, readyToComplete: true } })
      await buttonNamed(wrapper, 'Finish climb').trigger('click')
      expect(wrapper.emitted('finish')).toBeUndefined()
      expect(wrapper.get('[role="status"]').text()).toContain('1 cases you have not run score 0')

      await vi.advanceTimersByTimeAsync(800)
      await buttonNamed(wrapper, 'Finish with 1 of 2 cases? Press again to save').trigger('click')
      expect(wrapper.emitted('finish')).toHaveLength(1)
      expect(buttonNamed(wrapper, 'Finish climb')).toBeDefined()
    })

    it('ignores the second click of a double-click', async () => {
      const wrapper = mount(LevelSelect, { props: { levels: onePlayed, readyToComplete: true } })
      await buttonNamed(wrapper, 'Finish climb').trigger('click')
      await buttonNamed(wrapper, 'Finish with').trigger('click')
      expect(wrapper.emitted('finish')).toBeUndefined()
      expect(buttonNamed(wrapper, 'Finish with').attributes('aria-disabled')).toBe('true')
    })

    it('can be cancelled, and focus moving to Cancel keeps the question open', async () => {
      const wrapper = mount(LevelSelect, { props: { levels: onePlayed, readyToComplete: true } })
      await buttonNamed(wrapper, 'Finish climb').trigger('click')
      await buttonNamed(wrapper, 'Finish with').trigger('blur')
      await buttonNamed(wrapper, 'Keep climbing').trigger('click')
      expect(buttonNamed(wrapper, 'Finish with')).toBeUndefined()
      await vi.advanceTimersByTimeAsync(800)
      await buttonNamed(wrapper, 'Finish climb').trigger('click')
      expect(wrapper.emitted('finish')).toBeUndefined()
      wrapper.unmount()
    })
  })

  it('finishes on one press once every case has run, and never while a request is pending', async () => {
    const levels = onePlayed.map((level) => ({ ...level, submitted: true, result: { score: 90 } }))
    const wrapper = mount(LevelSelect, { props: { levels, readyToComplete: true, pending: true } })
    const finish = buttonNamed(wrapper, 'Finish climb')
    expect(finish.attributes('aria-disabled')).toBe('true')
    expect(finish.attributes('disabled')).toBeUndefined()
    await finish.trigger('click')
    expect(wrapper.emitted('finish')).toBeUndefined()
    await wrapper.setProps({ pending: false })
    await finish.trigger('click')
    expect(wrapper.emitted('finish')).toHaveLength(1)
  })

  it('wraps each badge checkbox in a named label', async () => {
    const wrapper = mount(RoleDesigner, {
      props: {
        level: roleLevel,
        modelValue: {
          roles: [{ id: 'role-1', name: 'Boss', permissions: [] }],
          assignments: [],
        },
      },
    })
    const label = wrapper.findAll('label').find((item) => item.text() === 'Agent Tan holds Boss')
    await label.get('input[type="checkbox"]').setValue(true)
    expect(wrapper.emitted('update:modelValue')[0][0].assignments).toEqual([
      { agent: 'dee', roleIds: ['role-1'] },
    ])
  })

  it('offers a costed hint, then another, then reports none left', async () => {
    const hints = { used: 0, max: 2, cost: 10, texts: [] }
    const wrapper = mount(HintPanel, { props: { hints } })
    const button = wrapper.get('button')
    expect(button.text()).toContain('Hint')
    expect(button.text()).toContain('−10 points')
    expect(button.attributes('disabled')).toBeUndefined()
    await button.trigger('click')
    expect(wrapper.emitted('request')).toHaveLength(1)

    await wrapper.setProps({ hints: { ...hints, used: 1, texts: ['Check least privilege.'] } })
    expect(wrapper.get('button').text()).toContain('Another hint')
    expect(wrapper.text()).toContain('Check least privilege.')

    await wrapper.setProps({ hints: { ...hints, used: 2, texts: ['One.', 'Two.'] } })
    expect(wrapper.get('button').text()).toBe('No more hints')
    expect(wrapper.get('button').attributes('aria-disabled')).toBe('true')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('request')).toHaveLength(1)
  })

  it('keeps the hint button focusable but inert while a request runs', async () => {
    const hints = { used: 0, max: 2, cost: 10, texts: [] }
    const wrapper = mount(HintPanel, { props: { hints, disabled: true } })
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('button').attributes('aria-disabled')).toBe('true')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('request')).toBeUndefined()
  })

  it('shows hints used and points lost on the case file', () => {
    const result = {
      score: 70,
      stars: 1,
      hintsUsed: 2,
      hintPenalty: 20,
      breakdown: [],
      meters: { leaks: 0, workDone: 1, workTotal: 1, excessRights: 0, dutyConflicts: [] },
      predictionReview: [],
      takeaways: [],
    }
    const wrapper = mount(LevelDebrief, { props: { level: matrixLevel, result } })
    expect(wrapper.text()).toContain('Hints: 2 (−20)')
  })
})
