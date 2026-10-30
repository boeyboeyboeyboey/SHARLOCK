import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getProgress: vi.fn(),
  listAttempts: vi.fn(),
  auth: null,
}))

vi.mock('../../auth/store.js', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('../api.js', () => ({
  getProgress: mocks.getProgress,
  listAttempts: mocks.listAttempts,
  progressErrorMessage: () => 'Progress failed.',
}))

import ProgressPage from '../ProgressPage.vue'

const progress = {
  games: [
    {
      gameId: 'sql-injection-arcade',
      saves: true,
      completedCount: 1,
      bestScore: 9,
      maxScore: 10,
      points: 90,
      lastCompletedAt: '2026-10-20T10:00:00.000Z',
    },
  ],
  savingGameIds: ['sql-injection-arcade'],
  totalPoints: 90,
  maxPoints: 100,
  topicOutcomes: [],
  achievements: [
    {
      key: 'first-clue',
      name: 'First clue',
      description: 'Complete any saved activity.',
      earnedAt: '2026-10-20T10:00:00.000Z',
    },
  ],
  catalogue: [
    { key: 'first-clue', name: 'First clue', description: 'Complete any saved activity.' },
    { key: 'perfect-case', name: 'Perfect case', description: 'Earn the maximum score.' },
  ],
}

function mountPage() {
  return mount(ProgressPage, {
    global: {
      stubs: {
        RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
        PixelIcon: true,
        SessionNotice: { template: '<div><slot /></div>' },
      },
    },
  })
}

describe('progress page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth = reactive({
      status: 'authenticated',
      user: { id: 'u1', username: 'Case_Finder', avatarId: 'blue' },
      requestError: null,
      restoreSession: vi.fn(),
    })
    mocks.listAttempts.mockResolvedValue({ attempts: [], page: 1, total: 0 })
  })

  it('shows loading then the progress data', async () => {
    mocks.getProgress.mockResolvedValue(progress)
    const wrapper = mountPage()
    expect(wrapper.text()).toContain('Loading your progress')
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('Your learning progress.')
    expect(wrapper.text()).toContain('90 / 100')
    expect(wrapper.text()).toContain('First clue')
    expect(mocks.listAttempts).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }))
  })

  it('shows the empty state for a new student', async () => {
    mocks.getProgress.mockResolvedValue({
      ...progress,
      games: [{ ...progress.games[0], completedCount: 0, points: 0 }],
      totalPoints: 0,
      achievements: [],
    })
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('No results yet')
    expect(mocks.listAttempts).not.toHaveBeenCalled()
  })

  it('lists unearned badges as locked with visible text', async () => {
    mocks.getProgress.mockResolvedValue(progress)
    const wrapper = mountPage()
    await flushPromises()
    const locked = wrapper.findAll('.achievement-badge--locked')
    expect(locked).toHaveLength(1)
    expect(locked[0].text()).toContain('Perfect case')
    expect(locked[0].text()).toContain('Locked')
    expect(locked[0].text()).toContain('Earn the maximum score.')
    const earned = wrapper.findAll('.achievement-badge:not(.achievement-badge--locked)')
    expect(earned).toHaveLength(1)
    expect(earned[0].text()).not.toContain('Locked')
  })

  it('shows every badge as locked when none are earned', async () => {
    mocks.getProgress.mockResolvedValue({ ...progress, achievements: [] })
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('Your first badge is waiting')
    expect(wrapper.findAll('.achievement-badge--locked')).toHaveLength(2)
  })

  it('shows an error and retries', async () => {
    mocks.getProgress.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(progress)
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Progress failed.')
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('90 / 100')
  })

  it('offers sign in when anonymous', async () => {
    mocks.auth.status = 'anonymous'
    mocks.auth.user = null
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.get('section[aria-label="Sign in"]').text()).toContain('Sign in')
    expect(mocks.getProgress).not.toHaveBeenCalled()
  })
})
