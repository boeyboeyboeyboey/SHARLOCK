import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AttemptForm from '../components/AttemptForm.vue'
import BlindAnswer from '../components/BlindAnswer.vue'
import CasePanel from '../components/CasePanel.vue'
import HintPanel from '../components/HintPanel.vue'
import RepairSelector from '../components/RepairSelector.vue'
import ResultPanel from '../components/ResultPanel.vue'
import RunHud from '../components/RunHud.vue'
import RunReview from '../components/RunReview.vue'

const baseCase = {
  caseId: 'abc123',
  number: 2,
  kind: 'union',
  title: 'Smuggle rows into a search',
  scenario: 'The manifests page searches a column.',
  goal: 'Make the search page show data from the staff table.',
  query: "SELECT port, ship FROM manifests WHERE port LIKE '%‹search›%'",
  resultColumns: ['port', 'ship'],
  schemaHint: [{ table: 'staff', columns: ['user', 'pass'] }],
}

describe('RunHud', () => {
  it('shows the clock, lives and tries in a timed run', () => {
    const wrapper = mount(RunHud, {
      props: {
        timed: true,
        number: 3,
        score: 40,
        lives: 2,
        maxLives: 3,
        secondsLeft: 125,
        triesLeft: 2,
        triesMax: 3,
      },
    })
    const text = wrapper.text()
    expect(text).toContain('Case 3')
    expect(text).toContain('Lives 2 of 3')
    expect(text).toContain('2:05')
    expect(text).toContain('Tries left 2 of 3')
  })

  it('shows progress through the practice cases and no clock', () => {
    const wrapper = mount(RunHud, { props: { number: 4, totalCases: 12, score: 0 } })
    expect(wrapper.text()).toContain('Case 4 of 12')
    expect(wrapper.text()).not.toContain('Time left')
    expect(wrapper.text()).not.toContain('Lives')
  })

  it('labels a repair slot', () => {
    const wrapper = mount(RunHud, { props: { repair: true, number: null } })
    expect(wrapper.get('[data-testid="sql-hud-case"]').text()).toBe('Repair')
  })
})

describe('CasePanel', () => {
  it('shows the scenario, goal, query and schema', () => {
    const wrapper = mount(CasePanel, { props: { current: baseCase } })
    expect(wrapper.text()).toContain('Case 2: Smuggle rows into a search')
    expect(wrapper.get('pre').text()).toContain('‹search›')
    expect(wrapper.get('mark').text()).toBe('‹search›')
    expect(wrapper.text()).toContain('Goal: Make the search page show data')
    expect(wrapper.text()).toContain('staff(user, pass)')
    expect(wrapper.attributes('data-case-id')).toBe('abc123')
  })

  it('names the case a repair applies to', () => {
    const wrapper = mount(CasePanel, {
      props: {
        current: {
          ...baseCase,
          kind: 'repair',
          number: null,
          title: 'Choose the fix',
          query: null,
        },
      },
    })
    expect(wrapper.find('pre').exists()).toBe(false)
    expect(wrapper.text()).toContain('Choose the fix')
  })
})

describe('AttemptForm', () => {
  const fields = [
    { id: 'username', label: 'Username' },
    { id: 'password', label: 'Passcode' },
  ]

  it('labels every field and emits the inputs in order', async () => {
    const wrapper = mount(AttemptForm, { props: { fields } })
    await wrapper.get('input#sql-field-username').setValue("' OR 1=1--")
    await wrapper.get('input#sql-field-password').setValue('x')
    expect(wrapper.get('label[for="sql-field-username"]').text()).toBe('Username')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')[0][0]).toEqual(["' OR 1=1--", 'x'])
  })

  it('disables the controls while busy', () => {
    const wrapper = mount(AttemptForm, { props: { fields, disabled: true } })
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(wrapper.get('input').attributes('disabled')).toBeDefined()
  })
})

describe('BlindAnswer and RepairSelector', () => {
  it('emits the chosen answer', async () => {
    const wrapper = mount(BlindAnswer, { props: { question: 'Is it after M?' } })
    expect(wrapper.text()).toContain('Is it after M?')
    await wrapper.findAll('button')[1].trigger('click')
    expect(wrapper.emitted('answer')).toEqual([['no']])
  })

  it('emits the selected repair option id', async () => {
    const options = [
      { id: 'a', text: 'Block the word UNION' },
      { id: 'b', text: 'Use a parameterised query' },
    ]
    const wrapper = mount(RepairSelector, { props: { options } })
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await wrapper.findAll('input[type="radio"]')[1].setValue(true)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('select-repair')).toEqual([['b']])
  })
})

describe('HintPanel', () => {
  it('asks for a hint and then shows it as assisted', async () => {
    const wrapper = mount(HintPanel, { props: { hint: null, assisted: false } })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('hint')).toHaveLength(1)
    await wrapper.setProps({ hint: 'Close the string first.', assisted: true })
    expect(wrapper.text()).toContain('Assisted')
    expect(wrapper.text()).toContain('Close the string first.')
    expect(wrapper.find('button').exists()).toBe(false)
  })
})

describe('ResultPanel', () => {
  const last = {
    caseId: 'abc123',
    kind: 'union',
    title: 'Smuggle rows into a search',
    code: 'SUCCESS',
    message: 'The results now include rows from the login table.',
    leaked: { table: 'staff', columns: ['user', 'pass'], rows: [['clerk', 'pw1']] },
    closed: true,
    solved: true,
    points: 30,
    explanation: 'UNION appended another table.',
  }

  it('shows the message, leaked rows, outcome and explanation', () => {
    const wrapper = mount(ResultPanel, { props: { last, reviewing: true } })
    expect(wrapper.text()).toContain('The results now include rows from the login table.')
    expect(wrapper.text()).toContain('Rows the page now shows from staff')
    expect(wrapper.findAll('td').map((cell) => cell.text())).toEqual(['clerk', 'pw1'])
    expect(wrapper.text()).toContain('Solved: +30 points')
    expect(wrapper.text()).toContain('UNION appended another table.')
  })

  it('emits next while reviewing and finish at the end of the run', async () => {
    const reviewing = mount(ResultPanel, { props: { last, reviewing: true } })
    await reviewing.get('button').trigger('click')
    expect(reviewing.emitted('next')).toHaveLength(1)
    const final = mount(ResultPanel, { props: { last, reviewing: true, final: true } })
    await final.get('button').trigger('click')
    expect(final.emitted('finish')).toHaveLength(1)
  })

  it('has no buttons while a case is still open', () => {
    const open = { ...last, closed: false, leaked: null, explanation: null }
    expect(
      mount(ResultPanel, { props: { last: open } })
        .find('button')
        .exists(),
    ).toBe(false)
  })
})

describe('RunReview', () => {
  it('lists each slot with its outcome, points and assisted flag', () => {
    const wrapper = mount(RunReview, {
      props: {
        review: [
          { number: 1, kind: 'login-tautology', outcome: 'solved', points: 20, assisted: false },
          { number: null, kind: 'repair', outcome: 'failed', points: 0, assisted: false },
          { number: 2, kind: 'blind', outcome: 'solved', points: 20, assisted: true },
        ],
      },
    })
    const rows = wrapper.findAll('tbody tr').map((row) => row.findAll('td').map((c) => c.text()))
    expect(rows).toEqual([
      ['1', 'Login bypass', 'Solved', '20', 'No'],
      ['Repair', 'Repair', 'Failed', '0', 'No'],
      ['2', 'Boolean blind', 'Solved', '20', 'Yes'],
    ])
  })
})
