import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useAuthStore } from '../../../features/auth/store.js'
import { readAttempt, writeAttempt } from '../../../features/attempts/api.js'
import SqlInjectionArcade from '../SqlInjectionArcade.vue'

vi.mock('../../../features/attempts/api.js', () => ({
  readAttempt: vi.fn(),
  writeAttempt: vi.fn(),
  listAttemptContexts: vi.fn().mockResolvedValue({ cohorts: [], total: 0 }),
  safeAttemptError: () => ({ message: 'error', status: 0 }),
}))

const loginFields = [
  { id: 'username', label: 'Username' },
  { id: 'password', label: 'Passcode' },
]

function current(overrides = {}) {
  return {
    caseId: 'aaa111',
    index: 0,
    number: 1,
    kind: 'login-tautology',
    tier: 1,
    title: 'Bypass the front desk',
    scenario: 'The customs house login page pastes both fields into the text.',
    goal: 'Get past the login without knowing any passcode.',
    query: "SELECT * FROM staff WHERE user = '‹username›' AND pass = '‹password›'",
    fields: loginFields,
    resultColumns: null,
    schemaHint: null,
    knownCrate: null,
    question: null,
    forKind: null,
    forTitle: null,
    options: null,
    triesMax: 3,
    triesLeft: 3,
    stage: null,
    canAnswer: false,
    phase: null,
    stored: null,
    assisted: false,
    hint: null,
    ...overrides,
  }
}

function snapshot({
  pub = {},
  curr = current(),
  status = 'active',
  mode = 'practice',
  ...rest
} = {}) {
  const timed = mode === 'standard'
  return {
    attemptId: 'att1',
    gameId: 'sql-injection-arcade',
    rulesetVersion: 'sql-2',
    context: { kind: timed ? 'cohort' : 'personal', cohortId: null },
    mode,
    status,
    revision: 1,
    deadlineAt: timed ? new Date(Date.now() + 120000).toISOString() : null,
    score: 0,
    maxScore: 1000,
    persisted: true,
    publicState: {
      mode,
      totalCases: timed ? null : 12,
      maxLives: timed ? 3 : null,
      lives: timed ? 3 : null,
      casesClosed: 0,
      score: 0,
      solved: 0,
      failed: 0,
      current: curr,
      last: null,
      ...pub,
    },
    ...rest,
  }
}

const lastOpen = {
  caseId: 'aaa111',
  kind: 'login-tautology',
  title: 'Bypass the front desk',
  code: 'NO_BREAKOUT',
  message: 'The input stayed inside its quotes, so the database treated it as plain data.',
  leaked: null,
  closed: false,
  solved: false,
  points: 0,
  explanation: null,
}

async function mountGame(first) {
  readAttempt.mockResolvedValue(first)
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = { howToPlayDismissed: ['sql-injection-arcade'] }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/games/sql-injection-arcade', component: SqlInjectionArcade },
    ],
  })
  await router.push('/games/sql-injection-arcade?attempt=att1')
  await router.isReady()
  const wrapper = mount(SqlInjectionArcade, {
    global: { plugins: [router, pinia] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

const button = (wrapper, name) => wrapper.findAll('button').find((item) => item.text() === name)
const lastBody = () => writeAttempt.mock.calls.at(-1)[1]

beforeEach(() => {
  readAttempt.mockReset()
  writeAttempt.mockReset()
})
afterEach(() => {
  document.body.innerHTML = ''
})

describe('login case', () => {
  it('shows the case, submits both fields and announces the result', async () => {
    const wrapper = await mountGame(snapshot())
    expect(wrapper.text()).toContain('Case 1: Bypass the front desk')
    expect(wrapper.text()).toContain('Case 1 of 12')
    expect(wrapper.text()).toContain('Tries left 3 of 3')
    await wrapper.get('input#sql-field-username').setValue("' OR 1=1--")
    await wrapper.get('input#sql-field-password').setValue('x')
    writeAttempt.mockResolvedValue(
      snapshot({ curr: current({ triesLeft: 2 }), pub: { last: lastOpen } }),
    )
    await wrapper.get('.sql-login').trigger('submit')
    await flushPromises()
    expect(writeAttempt.mock.calls.at(-1)[0]).toBe('/attempts/att1/actions')
    expect(lastBody().type).toBe('attempt')
    expect(lastBody().payload).toEqual({ caseId: 'aaa111', inputs: ["' OR 1=1--", 'x'] })
    const region = wrapper.get('[data-testid="sql-result"]')
    expect(region.attributes('aria-live')).toBe('polite')
    expect(region.text()).toContain('plain data')
    expect(wrapper.text()).toContain('Tries left 2 of 3')
  })
})

describe('union case', () => {
  it('shows the leaked table and moves on with Next case', async () => {
    const union = current({
      caseId: 'bbb222',
      kind: 'union',
      title: 'Smuggle rows into a search',
      fields: [{ id: 'search', label: 'Search' }],
      resultColumns: ['port', 'ship'],
    })
    const closed = {
      caseId: 'bbb222',
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
    const next = current({ caseId: 'ccc333', number: 3, title: 'Badge scanner with no quotes' })
    const wrapper = await mountGame(snapshot({ curr: union }))
    expect(wrapper.findAll('.sql-case-form input')).toHaveLength(1)
    writeAttempt.mockResolvedValue(snapshot({ curr: next, pub: { last: closed, casesClosed: 1 } }))
    await wrapper.get('input').setValue("zz' UNION SELECT user, pass FROM staff--")
    await wrapper.get('.sql-login').trigger('submit')
    await flushPromises()
    expect(wrapper.findAll('td').map((cell) => cell.text())).toEqual(['clerk', 'pw1'])
    expect(wrapper.text()).toContain('Solved: +30 points')
    expect(wrapper.find('.sql-login').exists()).toBe(false)
    await button(wrapper, 'Next case').trigger('click')
    expect(wrapper.find('.sql-login').exists()).toBe(true)
    expect(wrapper.get('[data-testid="sql-case"]').attributes('data-case-id')).toBe('ccc333')
  })
})

describe('blind case', () => {
  const blind = (extra) =>
    current({
      kind: 'blind',
      title: 'Ask the stock page a question',
      fields: [{ id: 'crate', label: 'Crate number' }],
      knownCrate: 'CR-1234',
      question: 'Is the first letter after M?',
      triesMax: 6,
      triesLeft: 6,
      stage: 1,
      ...extra,
    })

  it('offers Yes and No only once the proof is in', async () => {
    const wrapper = await mountGame(snapshot({ curr: blind() }))
    expect(wrapper.text()).toContain('CR-1234')
    expect(button(wrapper, 'Yes')).toBeUndefined()
    writeAttempt.mockResolvedValue(snapshot({ curr: blind({ canAnswer: true, stage: 2 }) }))
    await wrapper.get('input').setValue("CR-1234' AND 1=1--")
    await wrapper.get('.sql-login').trigger('submit')
    await flushPromises()
    await button(wrapper, 'Yes').trigger('click')
    await flushPromises()
    expect(lastBody().type).toBe('answer')
    expect(lastBody().payload).toEqual({ caseId: 'aaa111', value: 'yes' })
  })
})

describe('second-order case', () => {
  const second = (extra) =>
    current({
      kind: 'second-order',
      title: 'The name that waits',
      fields: [{ id: 'name', label: 'Username to register' }],
      phase: 'register',
      ...extra,
    })

  it('registers a name then changes the password', async () => {
    const wrapper = await mountGame(snapshot({ curr: second() }))
    expect(wrapper.find('label[for="sql-field-name"]').text()).toBe('Username to register')
    writeAttempt.mockResolvedValue(
      snapshot({ curr: second({ phase: 'change', stored: "ana'--" }) }),
    )
    await wrapper.get('input').setValue("ana'--")
    await wrapper.get('.sql-login').trigger('submit')
    await flushPromises()
    expect(lastBody().type).toBe('register')
    expect(lastBody().payload).toEqual({ caseId: 'aaa111', inputs: ["ana'--"] })
    expect(wrapper.text()).toContain("ana'--")
    expect(wrapper.find('.sql-case-form input').exists()).toBe(false)
    await button(wrapper, 'Change password').trigger('click')
    await flushPromises()
    expect(lastBody().type).toBe('change-password')
    expect(lastBody().payload).toEqual({ caseId: 'aaa111' })
  })
})

describe('repair slot', () => {
  it('chooses a fix and shows no hint button', async () => {
    const repair = current({
      kind: 'repair',
      number: null,
      title: 'Choose the fix',
      query: null,
      fields: [],
      triesMax: 1,
      triesLeft: 1,
      options: [
        { id: 'a', text: 'Block the word UNION' },
        { id: 'b', text: 'Use a parameterised query' },
      ],
    })
    const wrapper = await mountGame(snapshot({ curr: repair }))
    expect(wrapper.get('[data-testid="sql-hud-case"]').text()).toBe('Repair')
    expect(button(wrapper, 'Show a hint')).toBeUndefined()
    writeAttempt.mockResolvedValue(
      snapshot({ curr: null, pub: { last: { ...lastOpen, closed: true } } }),
    )
    await wrapper.findAll('input[type="radio"]')[1].setValue(true)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(lastBody().type).toBe('choose-fix')
    expect(lastBody().payload).toEqual({ caseId: 'aaa111', optionId: 'b' })
    expect(button(wrapper, 'Finish and save result')).toBeDefined()
  })
})

describe('practice hint and timed run', () => {
  it('requests a hint in practice and shows it as assisted', async () => {
    const wrapper = await mountGame(snapshot())
    writeAttempt.mockResolvedValue(
      snapshot({ curr: current({ assisted: true, hint: 'Close the string first.' }) }),
    )
    await button(wrapper, 'Show a hint').trigger('click')
    await flushPromises()
    expect(lastBody().type).toBe('hint')
    expect(wrapper.text()).toContain('Close the string first.')
    expect(wrapper.text()).toContain('Assisted')
    expect(button(wrapper, 'Show a hint')).toBeUndefined()
  })

  it('shows lives and the clock but no hint in a class run', async () => {
    const wrapper = await mountGame(snapshot({ mode: 'standard' }))
    expect(wrapper.text()).toContain('Lives 3 of 3')
    expect(wrapper.get('[data-testid="sql-hud-clock"]').text()).toMatch(/^[12]:\d\d$/)
    expect(wrapper.text()).toContain('Case 1')
    expect(wrapper.get('.sql-hud').text()).not.toContain('of 12')
    expect(button(wrapper, 'Show a hint')).toBeUndefined()
  })
})

describe('end screen', () => {
  it('shows the saved result and the review list', async () => {
    const done = snapshot({
      curr: null,
      status: 'completed',
      score: 50,
      maxScore: 1000,
      pub: {
        review: [
          { number: 1, kind: 'login-tautology', outcome: 'solved', points: 30, assisted: false },
          { number: null, kind: 'repair', outcome: 'solved', points: 10, assisted: true },
        ],
      },
      feedback: {
        verdictCode: 'SQL_RUN_FINISHED',
        casesSolved: 1,
        casesFailed: 0,
        repairsCorrect: 1,
        assistedCases: 1,
      },
    })
    const wrapper = await mountGame(done)
    expect(wrapper.text()).toContain('50 / 1000')
    expect(wrapper.text()).toContain('Result saved to your account.')
    expect(wrapper.text()).toContain('Solved 1, failed 0, repairs correct 1, assisted 1.')
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    await button(wrapper, 'Play again').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('The ledger has a loose lock')
  })
})
