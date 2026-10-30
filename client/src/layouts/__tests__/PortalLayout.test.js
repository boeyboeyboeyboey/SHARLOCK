import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import PortalLayout from '../PortalLayout.vue'
import { useAuthStore } from '../../features/auth/store.js'

const wrappers = []

async function mountAt(path, meta = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const page = { template: '<h1 tabindex="-1">Page</h1>' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path, component: page, meta }],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(PortalLayout, {
    attachTo: document.body,
    global: { plugins: [pinia, router] },
  })
  wrappers.push(wrapper)
  return { wrapper, auth: useAuthStore() }
}

afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('portal layout', () => {
  it('has a top bar with a Menu button and no sidebar', async () => {
    const { wrapper } = await mountAt('/forbidden')
    expect(wrapper.find('header').exists()).toBe(true)
    expect(wrapper.get('[data-testid="menu-button"]').text()).toContain('Menu')
    expect(wrapper.find('aside.portal-sidebar').exists()).toBe(false)
    expect(wrapper.find('#portal-menu').exists()).toBe(false)
  })

  it('opens the site menu drawer from the Menu button', async () => {
    const { wrapper } = await mountAt('/forbidden')
    await wrapper.get('[data-testid="menu-button"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="site-menu"]').element.open).toBe(true)
    expect(wrapper.findAll('nav[aria-label="Site menu"]')).toHaveLength(1)
  })

  it('drops the top bar on immersive routes', async () => {
    const { wrapper } = await mountAt('/room', { immersive: true })
    expect(wrapper.find('header').exists()).toBe(false)
  })
})
