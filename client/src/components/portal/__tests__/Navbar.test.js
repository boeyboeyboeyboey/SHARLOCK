import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import Navbar from '../Navbar.vue'

async function mountNavbar(globalRoles, props = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  router.push('/')
  await router.isReady()
  const user = { username: 'tester', avatarId: 'mint', globalRoles }
  return mount(Navbar, { props: { user, ...props }, global: { plugins: [router] } })
}

const linkNamed = (wrapper, name) =>
  wrapper.findAll('a').find((link) => link.text().trim() === name)

describe('Navbar role buttons', () => {
  it('shows no role links to a student', async () => {
    const wrapper = await mountNavbar(['student'])
    expect(linkNamed(wrapper, 'Admin')).toBeUndefined()
    expect(linkNamed(wrapper, 'Instructor')).toBeUndefined()
  })

  it('links an admin to the admin workspace', async () => {
    const wrapper = await mountNavbar(['admin'])
    expect(linkNamed(wrapper, 'Admin').attributes('href')).toBe('/admin')
    expect(linkNamed(wrapper, 'Instructor')).toBeUndefined()
  })

  it('links an instructor to class enrollment', async () => {
    const wrapper = await mountNavbar(['instructor'], { town: true })
    expect(linkNamed(wrapper, 'Instructor').attributes('href')).toBe('/instructor')
    expect(linkNamed(wrapper, 'Admin')).toBeUndefined()
  })

  it('shows both links to a dual-role account', async () => {
    const wrapper = await mountNavbar(['instructor', 'admin'])
    expect(linkNamed(wrapper, 'Admin').attributes('href')).toBe('/admin')
    expect(linkNamed(wrapper, 'Instructor').attributes('href')).toBe('/instructor')
  })

  it('shows no role links when signed out', async () => {
    const wrapper = await mountNavbar([], { user: null })
    expect(linkNamed(wrapper, 'Admin')).toBeUndefined()
  })
})
