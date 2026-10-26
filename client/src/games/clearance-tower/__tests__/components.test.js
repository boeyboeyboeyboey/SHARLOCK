import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AccessMatrix from '../components/AccessMatrix.vue'
import DayControls from '../components/DayControls.vue'
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
    expect(wrapper.get('.clear-visitor').text()).toContain('Contractor Vance reads')
    expect(wrapper.get('.clear-room.is-flagged').text()).toContain('Leaked')
    expect(wrapper.get('.clear-agent.is-active').text()).toContain('Contractor Vance')
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
    expect(wrapper.get('.clear-stars').attributes('aria-label')).toBe('2 out of 3 stars')
    expect(wrapper.text()).toContain('You said Blocked; it is Allowed.')
    expect(wrapper.text()).toContain('6 badge edits')
    expect(wrapper.findAll('button').map((button) => button.text())).not.toContain('Next case')
    expect(wrapper.text()).toContain(`Source: ${roleLevel.slides}`)
    expect(wrapper.text()).not.toContain('not saved')
  })

  it('lists cases with their scores and enables Finish climb only when ready', async () => {
    const levels = [
      { ...matrixLevel, submitted: true, result: { score: 90 } },
      { ...labelLevel, submitted: false },
    ]
    const wrapper = mount(LevelSelect, { props: { levels, readyToComplete: false } })
    expect(wrapper.text()).toContain('Scored 90 / 100')
    expect(wrapper.text()).toContain('1 of 2 cases run')
    expect(wrapper.get('button.is-primary').attributes('disabled')).toBeDefined()
    await wrapper.setProps({ readyToComplete: true })
    await wrapper.get('button.is-primary').trigger('click')
    expect(wrapper.emitted('finish')).toHaveLength(1)
    await wrapper.findAll('.clear-level-button')[1].trigger('click')
    expect(wrapper.emitted('select')[0]).toEqual([labelLevel.id])
  })
})
