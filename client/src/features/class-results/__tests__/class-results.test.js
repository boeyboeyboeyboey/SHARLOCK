import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../../../services/api.js', () => ({ api: { get: apiMocks.get } }))

import { getClassResults, getStudentAttempts, resultsErrorMessage } from '../api.js'
import ClassResults from '../ClassResults.vue'
import ResultsSummary from '../ResultsSummary.vue'

const results = {
  cohort: { id: 'c1', name: 'Blue', term: 'T1' },
  activeStudents: 3,
  games: [
    {
      gameId: 'sql-injection-arcade',
      rulesetVersion: 'v1',
      studentsAttempted: 2,
      averageBestPercent: 75,
      topics: [{ topic: 'sql-injection', studentsAttempted: 2, studentsPassed: 1 }],
    },
    {
      gameId: 'unknown-game',
      rulesetVersion: null,
      studentsAttempted: 0,
      averageBestPercent: null,
      topics: [],
    },
  ],
  students: [
    {
      id: 's1',
      username: 'Casey_Student',
      avatarId: 'mint',
      completedAttempts: 2,
      lastCompletedAt: '2026-10-20T10:00:00.000Z',
      games: [{ gameId: 'sql-injection-arcade', bestPercent: 80 }],
    },
    {
      id: 's2',
      username: 'Quiet_Student',
      avatarId: 'mint',
      completedAttempts: 0,
      lastCompletedAt: null,
      games: [],
    },
  ],
  page: 1,
  pageSize: 50,
  total: 2,
}
const attemptsResult = {
  student: { id: 's1', username: 'Casey_Student', avatarId: 'mint' },
  attempts: [
    {
      id: 'a1',
      gameId: 'sql-injection-arcade',
      rulesetVersion: 'v1',
      score: 8,
      maxScore: 10,
      completedAt: '2026-10-20T10:00:00.000Z',
      topicOutcomes: [{ topic: 'sql-injection', achieved: true }],
    },
  ],
  page: 1,
  pageSize: 10,
  total: 1,
}

describe('class results api', () => {
  beforeEach(() => {
    apiMocks.get.mockReset()
    apiMocks.get.mockResolvedValue({ data: {} })
  })

  it('requests results and student attempts with the right paths and params', async () => {
    await getClassResults('c 1', { page: 2 })
    expect(apiMocks.get).toHaveBeenCalledWith('/cohorts/c%201/results', {
      params: { page: '2' },
      signal: undefined,
    })
    await getStudentAttempts('c1', 's1', { gameId: 'g', page: 3 })
    expect(apiMocks.get).toHaveBeenLastCalledWith('/cohorts/c1/students/s1/attempts', {
      params: { page: '3', gameId: 'g' },
      signal: undefined,
    })
    await getStudentAttempts('c1', 's1')
    expect(apiMocks.get.mock.calls.at(-1)[1].params).toEqual({ page: '1' })
  })

  it('maps error statuses to safe messages', () => {
    expect(resultsErrorMessage({ response: { status: 404 } })).toBe(
      "This class's results are not available.",
    )
    expect(resultsErrorMessage({ response: { status: 429 } })).toContain('Too many')
  })
})

describe('results summary', () => {
  it('shows No attempts yet for zero or null and never NaN', () => {
    const wrapper = mount(ResultsSummary, { props: { games: results.games, activeStudents: 3 } })
    expect(wrapper.findAll('.class-results__game')[1].text()).toContain('No attempts yet')
    expect(wrapper.text()).toContain('2 of 3 students attempted')
    expect(wrapper.text()).toContain('75%')
    expect(wrapper.text()).toContain('1 of 2 passed')
    expect(wrapper.text()).toContain('unknown-game')
    expect(wrapper.text()).not.toContain('NaN')
  })
})

describe('class results container', () => {
  beforeEach(() => {
    apiMocks.get.mockReset()
    apiMocks.get.mockImplementation(async (path) => {
      if (path.endsWith('/results')) return { data: results }
      return { data: attemptsResult }
    })
  })

  function mountResults(props = { cohortId: 'c1' }) {
    return mount(ClassResults, { props, attachTo: document.body })
  }

  it('renders students with a dash for no attempt', async () => {
    const wrapper = mountResults()
    expect(wrapper.text()).toContain('Loading class results')
    await flushPromises()
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('80%')
    expect(rows[1].text()).toContain('Not attempted')
    expect(rows[1].text()).toContain('No activity yet')
    wrapper.unmount()
  })

  it('opens attempts for a student and Back restores focus to the student button', async () => {
    const wrapper = mountResults()
    await flushPromises()
    await wrapper.get('[data-student-id="s1"]').trigger('click')
    await flushPromises()
    expect(apiMocks.get).toHaveBeenLastCalledWith('/cohorts/c1/students/s1/attempts', {
      params: { page: '1' },
      signal: expect.any(AbortSignal),
    })
    expect(wrapper.text()).toContain('8 / 10')
    expect(wrapper.text()).toContain('sql-injection')
    await wrapper.get('select').setValue('sql-injection-arcade')
    await flushPromises()
    expect(apiMocks.get.mock.calls.at(-1)[1].params.gameId).toBe('sql-injection-arcade')
    const back = wrapper.findAll('button').find((button) => button.text() === 'Back to students')
    await back.trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('[data-student-id="s1"]').element)
    wrapper.unmount()
  })

  it('requests the next student page', async () => {
    apiMocks.get.mockImplementation(async () => ({ data: { ...results, total: 120 } }))
    const wrapper = mountResults()
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Next')
      .trigger('click')
    await flushPromises()
    expect(apiMocks.get.mock.calls.at(-1)[1].params.page).toBe('2')
    wrapper.unmount()
  })

  it('requests the next attempts page', async () => {
    const wrapper = mountResults()
    await flushPromises()
    apiMocks.get.mockImplementation(async (path) => ({
      data: path.endsWith('/results') ? results : { ...attemptsResult, total: 25 },
    }))
    await wrapper.get('[data-student-id="s1"]').trigger('click')
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Next')
      .trigger('click')
    await flushPromises()
    expect(apiMocks.get.mock.calls.at(-1)[1].params.page).toBe('2')
    wrapper.unmount()
  })

  it('shows the unavailable state without retry on 404', async () => {
    apiMocks.get.mockRejectedValue({ response: { status: 404 } })
    const wrapper = mountResults()
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain(
      "This class's results are not available.",
    )
    expect(wrapper.text()).not.toContain('Try again')
    wrapper.unmount()
  })

  it('shows a generic error with retry that reloads', async () => {
    apiMocks.get.mockRejectedValueOnce({ response: { status: 500 } })
    const wrapper = mountResults()
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('temporarily unavailable')
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Class summary')
    wrapper.unmount()
  })

  it('shows an empty state for a class without students', async () => {
    apiMocks.get.mockResolvedValue({
      data: { ...results, students: [], total: 0, activeStudents: 0 },
    })
    const wrapper = mountResults()
    await flushPromises()
    expect(wrapper.text()).toContain('No students in this class yet')
    wrapper.unmount()
  })

  it('ignores a stale response after the class changes', async () => {
    let resolveFirst
    apiMocks.get.mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
    apiMocks.get.mockResolvedValueOnce({
      data: { ...results, cohort: { ...results.cohort, id: 'c2' }, students: [], total: 0 },
    })
    const wrapper = mountResults()
    await wrapper.setProps({ cohortId: 'c2' })
    await flushPromises()
    resolveFirst({ data: results })
    await flushPromises()
    expect(wrapper.text()).toContain('No students in this class yet')
    wrapper.unmount()
  })
})
