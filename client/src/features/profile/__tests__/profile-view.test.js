import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getOwnProfile: vi.fn(),
  updateOwnProfile: vi.fn(),
  safeError: (error) => error,
  route: null,
  auth: null,
}))

vi.mock('vue-router', () => ({ useRoute: () => mocks.route }))
vi.mock('../../auth/store.js', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('../api.js', () => ({
  getOwnProfile: mocks.getOwnProfile,
  updateOwnProfile: mocks.updateOwnProfile,
  safeError: mocks.safeError,
}))

import Profile from '../ProfilePage.vue'

const currentUser = {
  id: '66f0a35f2d84787cce1a1001',
  email: 'detective@example.test',
  username: 'Case_Finder',
  avatarId: 'blue',
  globalRoles: ['student'],
}

function mountProfile() {
  return mount(Profile, {
    attachTo: document.body,
    global: {
      stubs: {
        RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
        PixelIcon: true,
        TrophyCase: true,
        SessionNotice: { template: '<div><slot /></div>' },
      },
    },
  })
}

describe('profile view', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.route = reactive({ path: '/profile' })
    mocks.auth = reactive({
      status: 'authenticated',
      user: { ...currentUser },
      requestError: null,
      restoreSession: vi.fn().mockResolvedValue({ ...currentUser }),
    })
    mocks.getOwnProfile.mockResolvedValue({ username: 'Case_Finder', avatarId: 'blue' })
  })

  it('edits only /profile and refreshes the shared identity after a saved response', async () => {
    mocks.updateOwnProfile.mockResolvedValue({ username: 'New_Case', avatarId: 'reader' })
    mocks.auth.restoreSession.mockResolvedValue({
      ...currentUser,
      username: 'New_Case',
      avatarId: 'reader',
    })
    const wrapper = mountProfile()
    await flushPromises()

    expect(mocks.getOwnProfile).toHaveBeenCalledOnce()
    await wrapper.get('button.profile-edit-button').trigger('click')
    await wrapper.get('#profile-username').setValue('New_Case')
    await wrapper.get('form[aria-label="Edit profile"]').trigger('submit')
    await flushPromises()

    expect(mocks.updateOwnProfile).toHaveBeenCalledWith({ username: 'New_Case', avatarId: 'blue' })
    expect(mocks.auth.restoreSession).toHaveBeenCalledWith({ force: true })
    expect(wrapper.get('.profile-overview h2').text()).toBe('New_Case')
    expect(wrapper.get('.profile-overview img').attributes('src')).toContain('reader')
    expect(wrapper.get('[role="status"]').text()).toContain('Profile saved')
    expect(document.activeElement).toBe(wrapper.get('button.profile-edit-button').element)
  })

  it('keeps successful profile values when shared identity refresh fails', async () => {
    mocks.updateOwnProfile.mockResolvedValue({ username: 'New_Case', avatarId: 'reader' })
    mocks.auth.restoreSession.mockRejectedValue(new Error('offline'))
    const wrapper = mountProfile()
    await flushPromises()
    await wrapper.get('button.profile-edit-button').trigger('click')
    await wrapper.get('#profile-username').setValue('New_Case')
    await wrapper.get('form[aria-label="Edit profile"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('.profile-overview h2').text()).toBe('New_Case')
    expect(wrapper.get('[role="alert"]').text()).toContain('profile was saved')
    expect(wrapper.get('.profile-refresh-error button').text()).toContain('Refresh account display')
  })

  it('reports a saved profile without showing identity when refresh finds an expired session', async () => {
    mocks.updateOwnProfile.mockResolvedValue({ username: 'Private_Name', avatarId: 'reader' })
    mocks.auth.restoreSession.mockImplementation(async () => {
      mocks.auth.status = 'anonymous'
      mocks.auth.user = null
      return null
    })
    const wrapper = mountProfile()
    await flushPromises()
    await wrapper.get('button.profile-edit-button').trigger('click')
    await wrapper.get('#profile-username').setValue('Private_Name')
    await wrapper.get('form[aria-label="Edit profile"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="status"]').text()).toContain('Your profile was saved')
    expect(wrapper.get('[role="status"]').text()).toContain('session ended')
    expect(wrapper.text()).not.toContain('Private_Name')
    expect(wrapper.text()).not.toContain('detective@example.test')
  })

  it('preserves an unsaved username and restores focus when editing is cancelled', async () => {
    const wrapper = mountProfile()
    await flushPromises()
    await wrapper.get('button.profile-edit-button').trigger('click')
    await wrapper.get('#profile-username').setValue('Draft_Name')
    await wrapper.get('form[aria-label="Edit profile"] button[type="button"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('form[aria-label="Edit profile"]').exists()).toBe(false)
    expect(wrapper.get('.profile-overview h2').text()).toBe('Case_Finder')
    expect(document.activeElement).toBe(wrapper.get('button.profile-edit-button').element)
  })

  it('keeps the edited draft and field conflict visible after a rejected save', async () => {
    mocks.updateOwnProfile.mockRejectedValue({
      message: 'That username is already in use. Choose another one.',
      fieldErrors: { username: 'That username is already in use. Choose another one.' },
    })
    const wrapper = mountProfile()
    await flushPromises()
    await wrapper.get('button.profile-edit-button').trigger('click')
    const username = wrapper.get('#profile-username')
    await username.setValue('Taken_Name')
    await wrapper.get('form[aria-label="Edit profile"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('form[aria-label="Edit profile"] #profile-username').element.value).toBe(
      'Taken_Name',
    )
    expect(wrapper.get('#profile-username-error').text()).toContain('already in use')
  })

  it('keeps an expired-session draft locally and explains that sign-in requires re-entry', async () => {
    mocks.updateOwnProfile.mockRejectedValue({
      status: 401,
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Your session has ended. Sign in again to continue.',
    })
    mocks.auth.restoreSession.mockImplementation(async () => {
      mocks.auth.status = 'anonymous'
      mocks.auth.user = null
      return null
    })
    const wrapper = mountProfile()
    await flushPromises()
    await wrapper.get('button.profile-edit-button').trigger('click')
    await wrapper.get('#profile-username').setValue('Draft_Name')
    await wrapper.get('form[aria-label="Edit profile"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="status"]').text()).toContain(
      'Your unsaved changes are still here for now',
    )
    expect(wrapper.get('[role="status"]').text()).toContain('you will need to re-enter them')
    expect(wrapper.text()).not.toContain('Draft_Name')
  })
})
