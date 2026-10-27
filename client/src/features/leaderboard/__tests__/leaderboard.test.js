import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

const mocks = vi.hoisted(() => ({
  listMemberships: vi.fn(),
  listManagedCohorts: vi.fn(),
  getLeaderboardGames: vi.fn(),
  getLeaderboard: vi.fn(),
  auth: null,
  route: null,
  replace: vi.fn(),
}))

vi.mock('../../auth/store.js', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('../../cohorts/api.js', () => ({
  listMemberships: mocks.listMemberships,
  listManagedCohorts: mocks.listManagedCohorts,
}))
vi.mock('../api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getLeaderboardGames: mocks.getLeaderboardGames,
  getLeaderboard: mocks.getLeaderboard,
}))
vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ replace: mocks.replace }),
}))

import LeaderboardFilters from '../LeaderboardFilters.vue'
import LeaderboardPage from '../LeaderboardPage.vue'
import LeaderboardTable from '../LeaderboardTable.vue'

const bestBoard = {
  gameId: 'sql-injection-arcade',
  rulesetVersion: 'v1',
  competitive: false,
  view: 'best',
  rows: [
    { rank: 1, username: 'Casey_Student', avatarId: 'mint', score: 9, maxScore: 10, isSelf: false },
    { rank: 2, username: 'Me_Student', avatarId: 'mint', score: 8, maxScore: 10, isSelf: true },
  ],
  page: 1,
  pageSize: 25,
  total: 2,
  me: { rank: 2 },
}
const allTimeRows = [
  {
    rank: 1,
    username: 'Me_Student',
    avatarId: 'mint',
    points: 170,
    plays: 2,
    bestScore: 9,
    maxScore: 10,
    isSelf: true,
  },
]

function mountPage() {
  return mount(LeaderboardPage, {
    global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } },
  })
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock?.mockReset?.())
  mocks.auth = reactive({ user: { id: 'u1', globalRoles: ['student'] } })
  mocks.route = reactive({ query: {} })
  mocks.replace.mockImplementation(({ query }) => {
    mocks.route.query = query
  })
  mocks.listMemberships.mockResolvedValue({
    memberships: [{ cohortId: 'c1', cohortName: 'Blue', status: 'active', cohortStatus: 'active' }],
  })
  mocks.getLeaderboardGames.mockResolvedValue({
    games: [{ gameId: 'sql-injection-arcade', rulesetVersion: 'v1', competitive: false }],
  })
  mocks.getLeaderboard.mockResolvedValue(bestBoard)
})

describe('LeaderboardFilters', () => {
  it('emits the new class and game selection', async () => {
    const wrapper = mount(LeaderboardFilters, {
      props: {
        cohorts: [
          { cohortId: 'c1', cohortName: 'Blue' },
          { cohortId: 'c2', cohortName: 'Red' },
        ],
        games: [
          { gameId: 'g1', name: 'One' },
          { gameId: 'g2', name: 'Two' },
        ],
        modelValue: { cohortId: 'c1', gameId: 'g1' },
      },
    })
    await wrapper.find('select').setValue('c2')
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([
      [{ cohortId: 'c2', gameId: 'g1' }],
      [{ cohortId: 'c1', gameId: 'g2' }],
    ])
  })
})

describe('LeaderboardFilters game tabs', () => {
  const props = {
    cohorts: [{ cohortId: 'c1', cohortName: 'Blue' }],
    games: [
      { gameId: 'g1', name: 'One' },
      { gameId: 'g2', name: 'Two' },
      { gameId: 'g3', name: 'Three' },
    ],
    modelValue: { cohortId: 'c1', gameId: 'g1' },
  }

  it('marks the selected game and uses a roving tabindex', () => {
    const wrapper = mount(LeaderboardFilters, { props })
    const tabs = wrapper.findAll('[role="tab"]')
    const labelId = wrapper.find('[role="tablist"]').attributes('aria-labelledby')
    expect(wrapper.get(`#${labelId}`).text()).toBe('Game')
    expect(tabs.map((tab) => tab.attributes('aria-selected'))).toEqual(['true', 'false', 'false'])
    expect(tabs.map((tab) => tab.attributes('tabindex'))).toEqual(['0', '-1', '-1'])
  })

  it('moves focus with arrows, home and end without selecting', async () => {
    const wrapper = mount(LeaderboardFilters, { props, attachTo: document.body })
    const tabs = wrapper.findAll('[role="tab"]')
    tabs[0].element.focus()
    await tabs[0].trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(tabs[1].element)
    await tabs[1].trigger('keydown', { key: 'End' })
    expect(document.activeElement).toBe(tabs[2].element)
    await tabs[2].trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(tabs[0].element)
    await tabs[0].trigger('keydown', { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(tabs[2].element)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })
})

describe('LeaderboardTable', () => {
  it('renders best columns and marks the own row', () => {
    const wrapper = mount(LeaderboardTable, {
      props: { rows: bestBoard.rows, view: 'best', caption: 'Practice best scores' },
    })
    const headers = wrapper.findAll('thead th').map((th) => th.text())
    expect(headers).toEqual(['Rank', 'Player', 'Score'])
    expect(wrapper.text()).toContain('9 / 10')
    expect(wrapper.find('strong').text()).toBe('Me_Student')
    expect(wrapper.text()).toContain('(you)')
    expect(wrapper.findAll('strong')).toHaveLength(1)
    expect(wrapper.find('img').attributes('alt')).toMatch(/capybara avatar$/)
  })

  it('renders all-time columns', () => {
    const wrapper = mount(LeaderboardTable, { props: { rows: allTimeRows, view: 'all-time' } })
    expect(wrapper.findAll('thead th').map((th) => th.text())).toEqual([
      'Rank',
      'Player',
      'Points',
      'Plays',
      'Best',
    ])
    expect(wrapper.text()).toContain('170')
  })
})

describe('LeaderboardPage', () => {
  it('loads classes, games and the board for a student', async () => {
    const wrapper = mountPage()
    await flushPromises()
    expect(mocks.listMemberships).toHaveBeenCalled()
    expect(mocks.getLeaderboardGames).toHaveBeenCalledWith('c1', expect.anything())
    expect(mocks.getLeaderboard).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ gameId: 'sql-injection-arcade', view: 'best', page: 1 }),
    )
    expect(wrapper.text()).toContain('Practice best scores')
    expect(wrapper.text()).toContain('Casey_Student')
    expect(wrapper.text()).not.toContain('Your rank')
  })

  it('uses managed classes for instructors', async () => {
    mocks.auth.user.globalRoles = ['instructor']
    mocks.listManagedCohorts.mockResolvedValue({
      cohorts: [{ cohortId: 'c9', cohortName: 'Mine' }],
    })
    mountPage()
    await flushPromises()
    expect(mocks.listMemberships).not.toHaveBeenCalled()
    expect(mocks.getLeaderboardGames).toHaveBeenCalledWith('c9', expect.anything())
  })

  it('requests the all-time view when the tab is chosen', async () => {
    const wrapper = mountPage()
    await flushPromises()
    mocks.getLeaderboard.mockResolvedValue({
      ...bestBoard,
      view: 'all-time',
      rows: allTimeRows,
    })
    await wrapper.find('[role="tab"][aria-selected="false"]').trigger('click')
    await flushPromises()
    expect(mocks.getLeaderboard).toHaveBeenLastCalledWith(
      'c1',
      expect.objectContaining({ view: 'all-time' }),
    )
    expect(wrapper.text()).toContain('All-time points')
  })

  it('requests the chosen game when its tab is clicked', async () => {
    mocks.getLeaderboardGames.mockResolvedValue({
      games: [
        { gameId: 'sql-injection-arcade', rulesetVersion: 'v1', competitive: false },
        { gameId: 'clearance-tower', rulesetVersion: 'v1', competitive: false },
      ],
    })
    const wrapper = mountPage()
    await flushPromises()
    const gameTabs = wrapper
      .find('[role="tablist"][aria-labelledby="leaderboard-game-label"]')
      .findAll('[role="tab"]')
    expect(gameTabs.map((tab) => tab.attributes('aria-selected'))).toEqual(['true', 'false'])
    await gameTabs[1].trigger('click')
    await flushPromises()
    expect(mocks.route.query.game).toBe('clearance-tower')
    expect(mocks.getLeaderboard).toHaveBeenLastCalledWith(
      'c1',
      expect.objectContaining({ gameId: 'clearance-tower' }),
    )
    const updated = wrapper
      .find('[role="tablist"][aria-labelledby="leaderboard-game-label"]')
      .findAll('[role="tab"]')
    expect(updated.map((tab) => tab.attributes('aria-selected'))).toEqual(['false', 'true'])
  })

  it('shows the own rank when it is not on the current page', async () => {
    mocks.getLeaderboard.mockResolvedValue({
      ...bestBoard,
      rows: [bestBoard.rows[0]],
      total: 40,
      me: { rank: 31 },
    })
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('Your rank: 31')
    expect(wrapper.text()).toContain('Page 1 of 2')
  })

  it('links to classes when the student has none', async () => {
    mocks.listMemberships.mockResolvedValue({ memberships: [] })
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('Join a class to see its leaderboard.')
    expect(wrapper.find('a').attributes('href')).toBe('/classes')
  })

  it('shows an empty state when no game has scores', async () => {
    mocks.getLeaderboardGames.mockResolvedValue({ games: [] })
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('No scores yet.')
  })

  it('shows an alert when the board is unavailable', async () => {
    mocks.getLeaderboard.mockRejectedValue({ response: { status: 503 } })
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('temporarily unavailable')
  })
})
