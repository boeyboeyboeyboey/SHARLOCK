import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import ProfileOverlay from '../overlays/ProfileOverlay.vue'
import { useAuthStore } from '../../auth/store.js'

vi.mock('../../profile/ProfilePage.vue', () => ({ default: { template: '<p>profile page</p>' } }))
vi.mock('../../progress/ProgressPage.vue', () => ({
  default: { template: '<p>progress page</p>' },
}))

async function mountAt(path) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/profile', component: { template: '<div />' } }],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(ProfileOverlay, {
    global: { plugins: [pinia, router] },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, router }
}
afterEach(() => {
  document.body.innerHTML = ''
})

describe('ProfileOverlay', () => {
  it('opens on the Profile tab, and on Progress for ?tab=progress', async () => {
    const first = await mountAt('/profile')
    expect(first.wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe('Profile')
    expect(first.wrapper.text()).toContain('profile page')
    first.wrapper.unmount()
    const second = await mountAt('/profile?tab=progress')
    expect(second.wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe('Progress')
    expect(second.wrapper.text()).toContain('progress page')
    second.wrapper.unmount()
  })

  it('changes tab on a click and on the arrow keys', async () => {
    const { wrapper, router } = await mountAt('/profile')
    await wrapper.get('[data-testid="profile-tab-progress"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.tab).toBe('progress')
    await wrapper
      .get('[data-testid="profile-tab-progress"]')
      .trigger('keydown', { key: 'ArrowLeft' })
    await flushPromises()
    expect(router.currentRoute.value.query.tab).toBe('profile')
    wrapper.unmount()
  })

  it('leaves the session failure to the page inside, so it is reported once', async () => {
    const { wrapper } = await mountAt('/profile')
    useAuthStore().requestError = { message: 'The account service is busy.' }
    await flushPromises()
    expect(wrapper.text()).not.toContain('The account service is busy.')
    wrapper.unmount()
  })
})
