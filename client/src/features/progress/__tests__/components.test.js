import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ProgressSummary from '../components/ProgressSummary.vue'
import AttemptHistory from '../components/AttemptHistory.vue'

const stubs = { PixelIcon: true }

describe('progress summary', () => {
  it('shows saved and unsaved games with points', () => {
    const wrapper = mount(ProgressSummary, {
      props: {
        games: [
          {
            gameId: 'sql-injection-arcade',
            completedCount: 2,
            bestScore: 80,
            maxScore: 100,
            points: 80,
            lastCompletedAt: '2026-10-20T10:00:00.000Z',
          },
        ],
        totalPoints: 80,
        maxPoints: 100,
        topicOutcomes: [{ topic: 'sql-injection', attempted: 2, passed: 1 }],
      },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('80 / 100')
    const saved = wrapper.get('[data-testid="game-sql-injection-arcade"]')
    expect(saved.text()).toContain('SQL Injection Arcade')
    expect(saved.text()).toContain('80 / 100')
    expect(wrapper.findAll('.progress-game')).toHaveLength(6)
    expect(wrapper.get('[data-testid="game-clearance-tower"]').text()).toContain(
      'Not a scored activity',
    )
    expect(wrapper.text()).toContain('1 of 2 passed')
  })
})

describe('attempt history', () => {
  it('shows an empty state', () => {
    const wrapper = mount(AttemptHistory, { props: { attempts: [], page: 1, total: 0 } })
    expect(wrapper.text()).toContain('No completed attempts')
    expect(wrapper.find('table').exists()).toBe(false)
  })

  it('emits change-page from the pager', async () => {
    const attempts = [
      {
        attemptId: 'a1',
        gameId: 'clearance-tower',
        score: 5,
        maxScore: 10,
        completedAt: '2026-10-20T10:00:00.000Z',
      },
    ]
    const wrapper = mount(AttemptHistory, { props: { attempts, page: 2, total: 25 } })
    expect(wrapper.text()).toContain('Clearance Tower')
    expect(wrapper.text()).toContain('Page 2 of 3')
    const [previous, next] = wrapper.findAll('nav button')
    await next.trigger('click')
    await previous.trigger('click')
    expect(wrapper.emitted('change-page')).toEqual([[3], [1]])
  })
})
