import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import LoginPage from '../pages/LoginPage.vue'
import RegisterPage from '../pages/RegisterPage.vue'

const mocks = vi.hoisted(() => ({
  user: { id: 'student', globalRoles: ['student'] },
  login: vi.fn(),
  register: vi.fn(),
  verifyEmail: vi.fn(),
  replace: vi.fn(),
  resolve: vi.fn(),
}))
vi.mock('../store.js', async () => {
  const { reactive } = await import('vue')
  const store = reactive({
    status: 'anonymous',
    user: mocks.user,
    requestError: null,
    pendingVerification: null,
    clearSessionEnd: () => {},
  })
  const signIn =
    (operation) =>
    async (...args) => {
      const user = await operation(...args)
      store.status = 'authenticated'
      return user
    }
  store.login = signIn((...args) => mocks.login(...args))
  // registration ends at the email-code step; the code signs the account in
  store.register = async (...args) => {
    await mocks.register(...args)
    store.pendingVerification = { email: 'student@example.test' }
    return null
  }
  store.verifyEmail = signIn((...args) => mocks.verifyEmail(...args))
  return { useAuthStore: () => store }
})
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: mocks.replace }),
}))
vi.mock('../../cohorts/journey.js', () => ({ resolveEnrollmentDestination: mocks.resolve }))

// one stub factory keeps a single component definition in the file
const stub = (label, makePayload, { exposeClear = false } = {}) =>
  defineComponent({
    emits: ['submit'],
    setup(_props, { emit, expose }) {
      if (exposeClear) expose({ clearSecrets: vi.fn() })
      return () => h('button', { onClick: () => emit('submit', makePayload()) }, label)
    },
  })
const Form = stub('Submit credentials', () => ({ identifier: 'student@example.test' }), {
  exposeClear: true,
})
const CodePanel = stub('Submit code', () => '123456')
const wrappers = []
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))
beforeEach(async () => {
  vi.clearAllMocks()
  const { useAuthStore } = await import('../store.js')
  const store = useAuthStore()
  store.status = 'anonymous'
  store.pendingVerification = null
  mocks.resolve.mockReset()
  mocks.login.mockResolvedValue(mocks.user)
  mocks.register.mockResolvedValue(null)
  mocks.verifyEmail.mockResolvedValue(mocks.user)
  mocks.replace.mockResolvedValue()
})

describe('account enrollment continuation', () => {
  it.each([
    ['login', LoginPage],
    ['register', RegisterPage],
  ])('retries class setup without repeating %s credentials', async (operation, Page) => {
    mocks.resolve
      .mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValueOnce('/join-class?onboarding=1')
    const wrapper = mount(Page, {
      global: {
        stubs: {
          LoginForm: Form,
          RegisterForm: Form,
          VerifyEmailPanel: CodePanel,
          RouterLink: true,
          PixelIcon: true,
          SessionNotice: true,
        },
      },
    })
    wrappers.push(wrapper)
    await wrapper.get('button').trigger('click')
    await flushPromises()
    // registration needs one more step: confirm the emailed code
    if (operation === 'register') {
      await wrapper.get('button').trigger('click')
      await flushPromises()
    }
    expect(wrapper.get('[role="alert"]').text()).toContain('Class setup is unavailable')
    expect(mocks[operation]).toHaveBeenCalledOnce()
    expect(mocks.resolve).toHaveBeenCalledWith(
      mocks.user,
      expect.objectContaining({ afterAccountAccess: true }),
    )
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(mocks[operation]).toHaveBeenCalledOnce()
    expect(mocks.replace).toHaveBeenCalledWith('/join-class?onboarding=1')
  })

  it('cancels continuation on departure and does not navigate after a stale response', async () => {
    let finish
    mocks.resolve.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const wrapper = mount(LoginPage, {
      global: {
        stubs: {
          LoginForm: Form,
          RouterLink: true,
          PixelIcon: true,
          SessionNotice: true,
        },
      },
    })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    const signal = mocks.resolve.mock.calls[0][1].signal
    wrapper.unmount()
    expect(signal.aborted).toBe(true)
    finish('/join-class?carry=1')
    await flushPromises()
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})
