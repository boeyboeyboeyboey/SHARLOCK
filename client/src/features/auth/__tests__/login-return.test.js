import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import LoginPage from '../pages/LoginPage.vue'
import LoginForm from '../components/LoginForm.vue'
import { useAuthStore } from '../store.js'

const mocks = vi.hoisted(() => ({
  query: {},
  replace: vi.fn(),
  resolve: vi.fn(),
  user: { id: 'student', globalRoles: ['student'] },
}))
vi.mock('../store.js', async () => {
  const { reactive } = await import('vue')
  const store = reactive({
    status: 'anonymous',
    user: mocks.user,
    requestError: null,
    pendingVerification: null,
    login: async () => {
      store.status = 'authenticated'
      return mocks.user
    },
  })
  return { useAuthStore: () => store }
})
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: mocks.query }),
  useRouter: () => ({ replace: mocks.replace }),
}))
vi.mock('../../cohorts/journey.js', () => ({ resolveEnrollmentDestination: mocks.resolve }))

async function signInWith(returnTo) {
  mocks.query = { returnTo }
  useAuthStore().status = 'anonymous'
  const wrapper = mount(LoginPage, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' }, PixelIcon: true } },
  })
  wrapper.findComponent(LoginForm).vm.$emit('submit', { identifier: 'a', password: 'b' })
  await flushPromises()
  wrapper.unmount()
  return mocks.replace.mock.calls.at(-1)[0]
}

describe('coming back after signing in', () => {
  beforeEach(() => {
    mocks.replace.mockReset()
    mocks.resolve.mockResolvedValue('/')
  })

  it('returns to the game page it was sent from', async () => {
    expect(await signInWith('/games/clearance-tower?attempt=climb-1')).toBe(
      '/games/clearance-tower?attempt=climb-1',
    )
  })

  it.each(['https://example.test/games/x', '//example.test/games/x', '/admin', '/games/x?y=z'])(
    'ignores %s',
    async (target) => {
      expect(await signInWith(target)).toBe('/')
    },
  )

  it('lets a class invitation or onboarding come first', async () => {
    mocks.resolve.mockResolvedValue('/join-class?onboarding=1')
    expect(await signInWith('/games/clearance-tower')).toBe('/join-class?onboarding=1')
  })
})
