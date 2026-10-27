import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useAuthStore } from '../store.js'
import LoginForm from '../components/LoginForm.vue'
import RegisterForm from '../components/RegisterForm.vue'
import AvatarPicker from '../components/AvatarPicker.vue'
import AccountSummary from '../components/AccountSummary.vue'
import LoginPage from '../pages/LoginPage.vue'
import RegisterPage from '../pages/RegisterPage.vue'

const authRequests = vi.hoisted(() => ({
  requestCsrfToken: vi.fn(),
  requestCurrentUser: vi.fn(),
  requestLogin: vi.fn(),
  requestLogout: vi.fn(),
  requestRegistration: vi.fn(),
  requestVerifyEmail: vi.fn(),
  requestResendVerification: vi.fn(),
}))

vi.mock('../api.js', async () => {
  const actual = await vi.importActual('../api.js')
  return { ...actual, ...authRequests }
})

const account = Object.freeze({
  id: '66f0a35f2d84787cce1a1001',
  email: 'detective@example.test',
  username: 'Case_Finder',
  avatarId: 'blue',
  globalRoles: ['student'],
  passwordHash: 'private-value',
  authVersion: 22,
})

const verification = Object.freeze({
  email: account.email,
  delivery: 'sent',
  expiresAt: '2026-10-19T12:10:00.000Z',
  resendAvailableAt: '2026-10-19T12:00:30.000Z',
})

// registration ends at the code screen; the account only signs in once its code is confirmed
async function registerAndVerify(auth, signedInToken = 'signed-in-token') {
  authRequests.requestRegistration.mockResolvedValue({
    verification,
    csrfToken: 'pending-token',
  })
  authRequests.requestVerifyEmail.mockResolvedValue({ user: account, csrfToken: signedInToken })
  await auth.register({
    email: account.email,
    username: account.username,
    password: 'Correct-Horse-🔒-2026',
    avatarId: account.avatarId,
  })
  return auth.verifyEmail('123456')
}

function rejectedAuth(code, status, message = 'private backend detail') {
  return Object.assign(new Error(message), {
    response: { status, data: { error: { code, message } }, headers: {} },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('auth store', () => {
  it('deduplicates forced restoration and keeps only the public user DTO', async () => {
    let resolveCurrentUser
    authRequests.requestCurrentUser.mockReturnValue(
      new Promise((resolve) => {
        resolveCurrentUser = resolve
      }),
    )
    authRequests.requestCsrfToken.mockResolvedValue('memory-only-token')
    const auth = useAuthStore()

    const first = auth.restoreSession({ force: true })
    const second = auth.restoreSession({ force: true })
    expect(auth.status).toBe('loading')
    expect(authRequests.requestCurrentUser).toHaveBeenCalledTimes(1)
    resolveCurrentUser(account)

    const restored = await Promise.all([first, second])
    expect(restored[0]).toEqual({
      id: account.id,
      email: account.email,
      username: account.username,
      avatarId: account.avatarId,
      globalRoles: ['student'],
    })
    expect(restored[1]).toEqual(restored[0])
    expect(auth.user).toEqual(restored[0])
    expect(auth.csrfToken).toBe('memory-only-token')
    expect(authRequests.requestCsrfToken).toHaveBeenCalledTimes(1)
    expect(auth.user).not.toHaveProperty('passwordHash')
    expect(auth.user).not.toHaveProperty('authVersion')
  })

  it('keeps the current identity visible during a forced session check', async () => {
    authRequests.requestCsrfToken.mockResolvedValue('anonymous-token')
    let resolveCurrentUser
    authRequests.requestCurrentUser.mockReturnValue(
      new Promise((resolve) => {
        resolveCurrentUser = resolve
      }),
    )
    const auth = useAuthStore()
    await registerAndVerify(auth)

    const restoring = auth.restoreSession({ force: true })
    expect(auth.status).toBe('authenticated')
    expect(auth.user.username).toBe(account.username)
    resolveCurrentUser(account)
    await expect(restoring).resolves.toMatchObject({ username: account.username })
  })

  it('sends only the four approved registration fields and waits for the emailed code', async () => {
    authRequests.requestCsrfToken.mockResolvedValue('anonymous-token')
    authRequests.requestRegistration.mockResolvedValue({
      verification: { ...verification, passwordHash: 'must-not-be-kept' },
      csrfToken: 'pending-token',
    })
    authRequests.requestVerifyEmail.mockResolvedValue({
      user: { ...account, passwordHash: 'must-not-be-kept' },
      csrfToken: 'rotated-token',
    })
    const auth = useAuthStore()

    const registered = await auth.register({
      email: ' Detective@Example.test ',
      username: ' Case_Finder ',
      password: 'Correct-Horse-🔒-2026',
      avatarId: 'detective',
      passwordConfirmation: 'must never reach the API',
    })

    expect(authRequests.requestRegistration).toHaveBeenCalledWith(
      {
        email: 'detective@example.test',
        username: 'Case_Finder',
        password: 'Correct-Horse-🔒-2026',
        avatarId: 'detective',
      },
      'anonymous-token',
    )
    expect(Object.keys(authRequests.requestRegistration.mock.calls[0][0])).toEqual([
      'email',
      'username',
      'password',
      'avatarId',
    ])
    // no identity yet: the code screen is next, and only public fields are kept
    expect(registered).toBeNull()
    expect(auth.status).not.toBe('authenticated')
    expect(auth.user).toBeNull()
    expect(auth.pendingVerification).toEqual(verification)
    expect(auth.csrfToken).toBe('pending-token')

    await auth.verifyEmail('123 456')
    expect(authRequests.requestVerifyEmail).toHaveBeenCalledWith(
      { code: '123456' },
      'pending-token',
    )
    expect(auth.status).toBe('authenticated')
    expect(auth.pendingVerification).toBeNull()
    expect(auth.csrfToken).toBe('rotated-token')
    expect(auth.user).not.toHaveProperty('passwordHash')
  })

  it('validates the code locally and surfaces a wrong code without losing the screen', async () => {
    authRequests.requestCsrfToken.mockResolvedValue('anonymous-token')
    authRequests.requestRegistration.mockResolvedValue({ verification, csrfToken: 'pending-token' })
    const auth = useAuthStore()
    await auth.register({
      email: account.email,
      username: account.username,
      password: 'Correct-Horse-🔒-2026',
      avatarId: account.avatarId,
    })

    await expect(auth.verifyEmail('12345')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    expect(authRequests.requestVerifyEmail).not.toHaveBeenCalled()

    authRequests.requestVerifyEmail.mockRejectedValue(
      rejectedAuth('VERIFICATION_CODE_INVALID', 400),
    )
    await expect(auth.verifyEmail('123456')).rejects.toMatchObject({
      message: 'That code is not right. Check it and try again.',
    })
    expect(auth.pendingVerification).toEqual(verification)
    expect(auth.status).not.toBe('authenticated')

    // when the server forgot the sign-up, the screen returns to the form
    authRequests.requestVerifyEmail.mockRejectedValue(rejectedAuth('VERIFICATION_NOT_PENDING', 409))
    await expect(auth.verifyEmail('123456')).rejects.toMatchObject({
      code: 'VERIFICATION_NOT_PENDING',
    })
    expect(auth.pendingVerification).toBeNull()
  })

  it('resends a code and replaces the pending details', async () => {
    authRequests.requestCsrfToken.mockResolvedValue('anonymous-token')
    authRequests.requestRegistration.mockResolvedValue({ verification, csrfToken: 'pending-token' })
    const auth = useAuthStore()
    await auth.register({
      email: account.email,
      username: account.username,
      password: 'Correct-Horse-🔒-2026',
      avatarId: account.avatarId,
    })

    const later = { ...verification, resendAvailableAt: '2026-10-19T12:01:00.000Z' }
    authRequests.requestResendVerification.mockResolvedValue({ verification: later })
    await auth.resendVerification()
    expect(authRequests.requestResendVerification).toHaveBeenCalledWith('pending-token')
    expect(auth.pendingVerification).toEqual(later)

    auth.cancelVerification()
    expect(auth.pendingVerification).toBeNull()
    await expect(auth.resendVerification()).resolves.toBeNull()
  })

  it('holds a correct-password login of an unconfirmed account at the code screen', async () => {
    authRequests.requestCsrfToken.mockResolvedValue('anonymous-token')
    authRequests.requestLogin.mockResolvedValue({ verification, csrfToken: 'pending-token' })
    const auth = useAuthStore()

    const result = await auth.login({
      identifier: account.email,
      password: 'Correct-Horse-🔒-2026',
    })
    expect(result).toBeNull()
    expect(auth.pendingVerification).toEqual(verification)
    expect(auth.status).not.toBe('authenticated')
  })

  it('refreshes a rejected CSRF token without replaying the sign-in POST', async () => {
    authRequests.requestCsrfToken
      .mockResolvedValueOnce('stale-token')
      .mockResolvedValueOnce('fresh-token')
    authRequests.requestLogin.mockRejectedValue(rejectedAuth('CSRF_INVALID', 403))
    const auth = useAuthStore()

    await expect(
      auth.login({ identifier: 'detective@example.test', password: 'Correct-Horse-🔒-2026' }),
    ).rejects.toMatchObject({ code: 'CSRF_INVALID' })

    expect(authRequests.requestLogin).toHaveBeenCalledTimes(1)
    expect(authRequests.requestLogin).toHaveBeenCalledWith(
      { identifier: 'detective@example.test', password: 'Correct-Horse-🔒-2026' },
      'stale-token',
    )
    expect(authRequests.requestCsrfToken).toHaveBeenCalledTimes(2)
    expect(auth.csrfToken).toBe('fresh-token')
    expect(auth.requestError.message).toBe(
      'Your security check expired. Review the form and try again.',
    )
    expect(auth.requestError.message).not.toContain('private backend detail')
  })

  it('ignores a restoration response that arrives after local invalidation', async () => {
    let resolveCurrentUser
    authRequests.requestCurrentUser.mockReturnValue(
      new Promise((resolve) => {
        resolveCurrentUser = resolve
      }),
    )
    const auth = useAuthStore()
    const restoring = auth.restoreSession({ force: true })
    auth.invalidateSession()
    resolveCurrentUser(account)

    await expect(restoring).resolves.toBeNull()
    expect(auth.status).toBe('anonymous')
    expect(auth.user).toBeNull()
    expect(authRequests.requestCsrfToken).not.toHaveBeenCalled()
  })

  it('returns the newer signed-in account when a stale restore finishes after login', async () => {
    let resolveCurrentUser
    authRequests.requestCurrentUser.mockReturnValue(
      new Promise((resolve) => {
        resolveCurrentUser = resolve
      }),
    )
    const newerAccount = { ...account, id: 'new-session-id', username: 'NewSession' }
    authRequests.requestCsrfToken.mockResolvedValue('pre-login-token')
    authRequests.requestLogin.mockResolvedValue({ user: newerAccount, csrfToken: 'login-token' })
    const auth = useAuthStore()

    const restoring = auth.restoreSession({ force: true })
    await auth.login({ identifier: account.email, password: 'Correct-Horse-🔒-2026' })
    resolveCurrentUser(account)

    await expect(restoring).resolves.toMatchObject({
      id: newerAccount.id,
      username: newerAccount.username,
    })
    expect(auth.user).toMatchObject({ id: newerAccount.id, username: newerAccount.username })
    expect(auth.csrfToken).toBe('login-token')
  })

  it('blocks a restore that starts during a login mutation', async () => {
    let finishLogin
    authRequests.requestCsrfToken.mockResolvedValue('pre-login-token')
    authRequests.requestLogin.mockReturnValue(
      new Promise((resolve) => {
        finishLogin = resolve
      }),
    )
    const auth = useAuthStore()

    const signingIn = auth.login({ identifier: account.email, password: 'Correct-Horse-🔒-2026' })
    await Promise.resolve()
    await expect(auth.restoreSession({ force: true })).rejects.toMatchObject({
      code: 'ACCOUNT_ACTION_PENDING',
    })
    finishLogin({ user: account, csrfToken: 'login-token' })
    await expect(signingIn).resolves.toMatchObject({ username: account.username })
  })

  it('keeps the user visible while logout is pending and clears it after success', async () => {
    authRequests.requestCsrfToken.mockResolvedValue('anonymous-token')
    let finishLogout
    authRequests.requestLogout.mockReturnValue(
      new Promise((resolve) => {
        finishLogout = resolve
      }),
    )
    const auth = useAuthStore()
    await registerAndVerify(auth)

    const signingOut = auth.logout()
    expect(auth.logoutPending).toBe(true)
    expect(auth.user.username).toBe(account.username)
    await expect(auth.restoreSession({ force: true })).rejects.toMatchObject({
      code: 'ACCOUNT_ACTION_PENDING',
    })
    expect(authRequests.requestCurrentUser).not.toHaveBeenCalled()
    finishLogout()
    await signingOut

    expect(auth.logoutPending).toBe(false)
    expect(auth.status).toBe('anonymous')
    expect(auth.user).toBeNull()
  })

  it('keeps the account available when logout could not reach the server', async () => {
    authRequests.requestCsrfToken.mockResolvedValue('anonymous-token')
    authRequests.requestLogout.mockRejectedValue(new Error('private transport details'))
    const auth = useAuthStore()
    await registerAndVerify(auth)

    await expect(auth.logout()).rejects.toMatchObject({
      message: 'We could not reach Sharlock. Check your connection and try again.',
    })
    expect(auth.status).toBe('authenticated')
    expect(auth.user.username).toBe(account.username)
    expect(auth.logoutPending).toBe(false)
    expect(auth.requestError.message).not.toContain('private transport details')
  })

  it('retries logout once with a fresh token after a stale security check', async () => {
    authRequests.requestCsrfToken.mockResolvedValue('anonymous-token')
    const auth = useAuthStore()
    await registerAndVerify(auth)
    authRequests.requestCsrfToken.mockResolvedValue('fresh-token')
    authRequests.requestLogout
      .mockRejectedValueOnce(rejectedAuth('CSRF_INVALID', 403))
      .mockResolvedValueOnce(undefined)

    await auth.logout()

    expect(authRequests.requestLogout).toHaveBeenCalledTimes(2)
    expect(authRequests.requestLogout).toHaveBeenLastCalledWith('fresh-token')
    expect(auth.status).toBe('anonymous')
    expect(auth.user).toBeNull()
    expect(auth.requestError).toBeNull()
    expect(auth.logoutPending).toBe(false)
  })

  it('stays signed in when the logout retry is also rejected', async () => {
    authRequests.requestCsrfToken.mockResolvedValue('anonymous-token')
    const auth = useAuthStore()
    await registerAndVerify(auth)
    authRequests.requestLogout.mockRejectedValue(rejectedAuth('CSRF_INVALID', 403))

    await expect(auth.logout()).rejects.toMatchObject({ code: 'CSRF_INVALID' })

    expect(authRequests.requestLogout).toHaveBeenCalledTimes(2)
    expect(auth.status).toBe('authenticated')
    expect(auth.user.username).toBe(account.username)
    expect(auth.requestError.code).toBe('CSRF_INVALID')
    expect(auth.logoutPending).toBe(false)
  })

  it('invalidates identity after an authenticated restore returns 401', async () => {
    authRequests.requestCurrentUser.mockRejectedValue(rejectedAuth('AUTHENTICATION_REQUIRED', 401))
    const auth = useAuthStore()

    await expect(auth.restoreSession({ force: true })).resolves.toBeNull()
    expect(auth.status).toBe('anonymous')
    expect(auth.user).toBeNull()
    expect(auth.requestError).toBeNull()
  })

  it('maps failed credentials to a safe message without exposing backend details', async () => {
    authRequests.requestCsrfToken.mockResolvedValue('token')
    authRequests.requestLogin.mockRejectedValue(rejectedAuth('INVALID_CREDENTIALS', 401))
    const auth = useAuthStore()

    await expect(
      auth.login({ identifier: 'detective@example.test', password: 'Correct-Horse-🔒-2026' }),
    ).rejects.toMatchObject({ message: 'Email, username or password is incorrect.' })
    expect(auth.requestError.message).toBe('Email, username or password is incorrect.')
    expect(auth.requestError.message).not.toContain('private backend detail')
    expect(auth.status).toBe('unknown')
  })

  it('uses safe fallback messages for prototype-named error codes', async () => {
    authRequests.requestCsrfToken.mockResolvedValue('token')
    const auth = useAuthStore()

    for (const code of ['constructor', '__proto__', 'toString']) {
      authRequests.requestLogin.mockRejectedValueOnce(
        rejectedAuth(code, 400, `private detail for ${code}`),
      )

      await expect(
        auth.login({ identifier: 'detective@example.test', password: 'Correct-Horse-🔒-2026' }),
      ).rejects.toMatchObject({
        message: 'Sharlock could not complete that request. Please try again.',
      })
      expect(auth.requestError.message).toBe(
        'Sharlock could not complete that request. Please try again.',
      )
      expect(auth.requestError.message).not.toContain(`private detail for ${code}`)
    }
  })
})

describe('auth forms and account summary', () => {
  it('accepts a 12-code-point password with required composition and emits only approved fields', async () => {
    const wrapper = mount(RegisterForm)
    const password = 'AlphaBravo1!'
    expect(Array.from(password)).toHaveLength(12)
    await wrapper.get('#register-email').setValue('policy-check@example.test')
    await wrapper.get('#register-username').setValue('Policy_Check')
    await wrapper.get('#register-password').setValue(password)
    await wrapper.get('#register-confirmation').setValue(password)

    expect(wrapper.get('#register-password-hint').text().replace(/\s+/g, ' ').trim()).toBe(
      'Use at least 12 characters, including an uppercase letter and a special character. Spaces are allowed.',
    )

    await wrapper.get('form').trigger('submit')

    const payload = wrapper.emitted('submit')[0][0]
    expect(Object.keys(payload)).toEqual(['email', 'username', 'password', 'avatarId'])
    expect(payload).toEqual({
      email: 'policy-check@example.test',
      username: 'Policy_Check',
      password,
      avatarId: 'mint',
    })
    wrapper.unmount()
  })

  it('accepts a 32-character username and rejects 33 characters', async () => {
    const wrapper = mount(RegisterForm)
    const username = wrapper.get('#register-username')
    const accepted = 'A'.repeat(32)
    const rejected = 'B'.repeat(33)
    await wrapper.get('#register-email').setValue('policy-check@example.test')
    await username.setValue(accepted)
    await wrapper.get('#register-password').setValue('AlphaBravo1!')
    await wrapper.get('#register-confirmation').setValue('AlphaBravo1!')

    expect(username.attributes('maxlength')).toBe('32')
    expect(wrapper.get('#register-username-hint').text()).toContain('3–32')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')[0][0].username).toBe(accepted)

    await username.setValue(rejected)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('#register-username').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('#register-username-error').text()).toContain('3 to 32')
    expect(wrapper.emitted('submit')).toHaveLength(1)
    wrapper.unmount()
  })

  it.each([
    ['uppercase letter', 'alphabravo1!'],
    ['special character', 'AlphaBravo12'],
  ])('blocks a 12-code-point password without a %s', async (_label, password) => {
    const wrapper = mount(RegisterForm)
    expect(Array.from(password)).toHaveLength(12)
    await wrapper.get('#register-email').setValue('policy-check@example.test')
    await wrapper.get('#register-username').setValue('Policy_Check')
    await wrapper.get('#register-password').setValue(password)
    await wrapper.get('#register-confirmation').setValue(password)
    await wrapper.get('form').trigger('submit')

    expect(wrapper.get('#register-password').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('#register-password-error').text()).not.toBe('')
    expect(wrapper.emitted('submit')).toBeUndefined()
    wrapper.unmount()
  })

  it('keeps the sidebar account copy off the sign-in and registration pages', async () => {
    // those pages show account problems in their own card; the duplicate in the sidebar made it
    // taller than the window, which adds a scrollbar that takes 18px of its 236px
    const { routes } = await import('../../../router/index.js')
    for (const path of ['/login', '/register']) {
      expect(routes.find((route) => route.path === path).meta.hideAccountSummary).toBe(true)
    }
  })

  it('warns after a field is left and clears the warning as soon as it is valid', async () => {
    const wrapper = mount(RegisterForm)
    const email = wrapper.get('#register-email')

    // nothing is flagged while typing or when an empty field is left
    await email.setValue('abc')
    expect(wrapper.find('#register-email-error').exists()).toBe(false)
    await email.trigger('blur')
    expect(wrapper.get('#register-email-error').text()).toContain('valid email')
    expect(email.attributes('aria-invalid')).toBe('true')
    // the banner waits for a submit attempt
    expect(wrapper.find('.auth-error-summary').exists()).toBe(false)

    await email.setValue('abc@school.edu')
    expect(wrapper.find('#register-email-error').exists()).toBe(false)
    expect(email.attributes('aria-invalid')).toBe('false')

    await wrapper.get('#register-username').trigger('blur')
    expect(wrapper.find('#register-username-error').exists()).toBe(false)

    // mismatch follows both password fields once the confirmation has been left
    await wrapper.get('#register-password').setValue('Correct-Horse-2026!')
    const confirmation = wrapper.get('#register-confirmation')
    await confirmation.setValue('Correct-Horse')
    await confirmation.trigger('blur')
    expect(wrapper.get('#register-confirmation-error').text()).toBe('Passwords must match.')
    await confirmation.setValue('Correct-Horse-2026!')
    expect(wrapper.find('#register-confirmation-error').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the banner after a submit attempt and hides it once every field is fixed', async () => {
    const wrapper = mount(RegisterForm)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.find('.auth-error-summary').exists()).toBe(true)

    await wrapper.get('#register-email').setValue('detective@example.test')
    await wrapper.get('#register-username').setValue('Case_Finder')
    await wrapper.get('#register-password').setValue('Correct-Horse-🔒-2026')
    await wrapper.get('#register-confirmation').setValue('Correct-Horse-🔒-2026')
    expect(wrapper.find('.auth-error-summary').exists()).toBe(false)
    expect(wrapper.findAll('.auth-field-error')).toHaveLength(0)
    wrapper.unmount()
  })

  it('clears a server-reported field error when that field is edited', async () => {
    const wrapper = mount(RegisterForm, {
      props: { error: 'Check the highlighted fields.', fieldErrors: { username: 'Taken.' } },
    })
    expect(wrapper.get('#register-username-error').text()).toBe('Taken.')
    expect(wrapper.find('.auth-error-summary').exists()).toBe(true)

    await wrapper.get('#register-username').setValue('Another_Name')
    expect(wrapper.find('#register-username-error').exists()).toBe(false)
    expect(wrapper.find('.auth-error-summary').exists()).toBe(false)
    wrapper.unmount()
  })

  it('blocks registration on confirmation mismatch and excludes confirmation after match', async () => {
    const wrapper = mount(RegisterForm)
    await wrapper.get('#register-email').setValue('detective@example.test')
    await wrapper.get('#register-username').setValue('Case_Finder')
    await wrapper.get('#register-password').setValue('Correct-Horse-🔒-2026')
    await wrapper.get('#register-confirmation').setValue('Different-Horse-🔒-2026')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.text()).toContain('Passwords must match.')
    expect(wrapper.emitted('submit')).toBeUndefined()

    await wrapper.get('#register-confirmation').setValue('Correct-Horse-🔒-2026')
    await wrapper.get('form').trigger('submit')
    const payload = wrapper.emitted('submit')[0][0]
    expect(payload).toEqual({
      email: 'detective@example.test',
      username: 'Case_Finder',
      password: 'Correct-Horse-🔒-2026',
      avatarId: 'mint',
    })
    expect(payload).not.toHaveProperty('passwordConfirmation')
    wrapper.unmount()
  })

  it('labels the sign-in field for email or username and submits a normalized username', async () => {
    const wrapper = mount(LoginForm)
    expect(wrapper.get('label[for="login-identifier"]').text()).toBe('Email or username')
    expect(wrapper.get('#login-identifier').attributes('type')).toBe('text')
    await wrapper.get('#login-identifier').setValue(' Detective_01 ')
    await wrapper.get('#login-password').setValue('Correct-Horse-🔒-2026')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')[0][0]).toEqual({
      identifier: 'detective_01',
      password: 'Correct-Horse-🔒-2026',
    })
    wrapper.unmount()
  })

  it('does not truncate valid Unicode passwords', async () => {
    const wrapper = mount(LoginForm)
    const password = '🔐'.repeat(15)
    const input = wrapper.get('#login-password')
    expect(input.attributes('maxlength')).toBeUndefined()
    await wrapper.get('#login-identifier').setValue('detective@example.test')
    await input.setValue(password)
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')[0][0].password).toBe(password)
    wrapper.unmount()
  })

  it('disables editable sign-in and registration controls while pending', () => {
    const login = mount(LoginForm, { props: { pending: true } })
    expect(login.get('#login-identifier').element.disabled).toBe(true)
    expect(login.get('#login-password').element.disabled).toBe(true)
    expect(login.get('.auth-password-toggle').element.disabled).toBe(true)
    login.unmount()

    const register = mount(RegisterForm, { props: { pending: true } })
    for (const selector of [
      '#register-email',
      '#register-username',
      '#register-password',
      '#register-confirmation',
    ]) {
      expect(register.get(selector).element.disabled).toBe(true)
    }
    expect(
      register.findAll('.auth-password-toggle').every((button) => button.element.disabled),
    ).toBe(true)
    expect(
      register.findAll('input[type="radio"]').every((input) => input.element.matches(':disabled')),
    ).toBe(true)
    register.unmount()
  })

  it('lists the six authoritative keyboard-operable avatar presets', async () => {
    const wrapper = mount(AvatarPicker, { props: { selected: 'mint' } })
    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(6)
    await wrapper.get('input[value="blue"]').setValue()
    expect(wrapper.emitted('update:selected')[0]).toEqual(['blue'])
    expect(wrapper.text()).toContain('Blue Cap')
    expect(wrapper.text()).toContain('Peach Bow')
    wrapper.unmount()
  })

  it('shows a real account summary without fabricated scores or achievements', () => {
    const wrapper = mount(AccountSummary, {
      props: { status: 'authenticated', user: account },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    expect(wrapper.text()).toContain('Case_Finder')
    expect(wrapper.text()).toContain('detective@example.test')
    expect(wrapper.text()).toContain('Results are not saved')
    expect(wrapper.text()).not.toMatch(/points|badge|rank|completed/i)
    expect(wrapper.get('img').attributes('src')).toBe('/images/avatars/blue.png')
    wrapper.unmount()
  })

  it('renders the login and registration pages inside the shared router shell', async () => {
    const loginRouter = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/login', component: LoginPage }],
    })
    await loginRouter.push('/login')
    const login = mount(LoginPage, { global: { plugins: [createPinia(), loginRouter] } })
    expect(login.get('h1').text()).toBe('Sign in to Sharlock')
    expect(login.get('form').exists()).toBe(true)
    expect(login.text()).toContain('Instructor? Ask your administrator for an activation link.')
    login.unmount()

    const registerRouter = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/register', component: RegisterPage }],
    })
    await registerRouter.push('/register')
    const register = mount(RegisterPage, {
      global: { plugins: [createPinia(), registerRouter] },
    })
    expect(register.get('h1').text()).toBe('Create a student account')
    expect(register.findAll('input[name="avatarId"]')).toHaveLength(6)
    expect(register.text()).toContain('Instructor? Ask your administrator for an activation link.')
    register.unmount()
  })
})
