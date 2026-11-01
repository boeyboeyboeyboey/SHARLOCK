import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import LoginPage from '../pages/LoginPage.vue'
import LoginForm from '../components/LoginForm.vue'

vi.mock('../api.js', async () => {
  const actual = await vi.importActual('../api.js')
  return {
    ...actual,
    requestSession: vi.fn().mockResolvedValue({ user: null }),
    requestCsrfToken: vi.fn().mockResolvedValue('token'),
  }
})

async function mountAt(query, { arrivedFrom } = {}) {
  const page = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', component: LoginPage },
      { path: '/register', component: page },
      { path: '/about', component: page },
      { path: '/', component: page },
      { path: '/settings', component: page },
    ],
  })
  if (arrivedFrom) {
    router.beforeEach((to) =>
      to.path === arrivedFrom ? { path: '/login', query: { reason: 'required' } } : true,
    )
    await router.push(arrivedFrom)
  } else await router.push({ path: '/login', query })
  await router.isReady()
  const wrapper = mount(LoginPage, {
    global: { plugins: [router], stubs: { PixelIcon: true } },
  })
  await flushPromises()
  return wrapper
}

describe('sign-in page', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('tells a first-time visitor what Sharlock is', async () => {
    const wrapper = await mountAt({ reason: 'required' })
    expect(wrapper.text()).toContain('game-based way to learn cybersecurity')
    expect(wrapper.get('a[href="/about"]').text()).toContain('What is Sharlock?')
  })

  it('offers a next step for a forgotten password', async () => {
    const wrapper = await mountAt({})
    expect(wrapper.text()).toContain(
      'Forgot your password? Ask your instructor or school administrator to send you a reset link.',
    )
  })

  it('says why a guarded page led here', async () => {
    const wrapper = await mountAt({}, { arrivedFrom: '/settings' })
    expect(wrapper.get('[role="status"]').text()).toBe('Sign in to open that page.')
  })

  it('has nothing to explain when the town or a typed sign-in link led here', async () => {
    const town = await mountAt({}, { arrivedFrom: '/' })
    expect(town.text()).not.toContain('Sign in to open that page.')
    const direct = await mountAt({ reason: 'required' })
    expect(direct.text()).not.toContain('Sign in to open that page.')
  })

  it('explains an expired session with nothing to press', async () => {
    const wrapper = await mountAt({ reason: 'expired' })
    expect(wrapper.get('[role="status"]').text()).toContain('Your session has ended.')
    expect(wrapper.findAll('button').map((button) => button.text())).not.toContain('Try again')
  })

  it('says when a newer sign-in ended the session and where a reset comes from', async () => {
    const wrapper = await mountAt({ reason: 'elsewhere' })
    const notice = wrapper.get('[role="status"]').text()
    expect(notice).toContain('signed in somewhere else')
    expect(notice).toContain('ask your instructor or school administrator')
  })

  it('confirms a password reset', async () => {
    const wrapper = await mountAt({ passwordReset: '1' })
    expect(wrapper.get('[role="status"]').text()).toContain('Your password was updated.')
  })

  it('shows no notice on a plain visit', async () => {
    const wrapper = await mountAt({})
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })
})

describe('sign-in form', () => {
  it('asks for a password without stating a length rule', async () => {
    const wrapper = mount(LoginForm, { attachTo: document.body })
    await wrapper.get('#login-identifier').setValue('learner@example.test')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('#login-password-error').text()).toBe('Enter your password.')
    expect(wrapper.text()).not.toMatch(/12|128|Unicode/)
    expect(wrapper.emitted('submit')).toBeUndefined()
    wrapper.unmount()
  })

  it('leaves a short password for the server to judge', async () => {
    const wrapper = mount(LoginForm)
    await wrapper.get('#login-identifier').setValue('learner@example.test')
    await wrapper.get('#login-password').setValue('short')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toEqual([
      [{ identifier: 'learner@example.test', password: 'short' }],
    ])
  })

  it('keeps the show-password button in the tab order', () => {
    const wrapper = mount(LoginForm)
    const toggle = wrapper.get('button[aria-label="Show password"]')
    expect(toggle.attributes('tabindex')).toBeUndefined()
    expect(toggle.attributes('aria-pressed')).toBe('false')
  })
})
