import { afterEach, describe, expect, it } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import Navbar from '../Navbar.vue'

const user = { username: 'detective_boey', avatarId: 'capybara', globalRoles: ['student'] }
const wrappers = []

function mountNavbar(props = {}) {
  const wrapper = mount(Navbar, {
    props: { user, ...props },
    attachTo: document.body,
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  wrappers.push(wrapper)
  return wrapper
}

afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('top bar', () => {
  it('links the logo home and offers only the Menu button, with no sidebar or view switch', () => {
    const wrapper = mountNavbar()
    expect(wrapper.getComponent(RouterLinkStub).props('to')).toBe('/')
    const menu = wrapper.get('[data-testid="menu-button"]')
    expect(menu.text()).toContain('Menu')
    expect(wrapper.find('[role="group"][aria-label="View mode"]').exists()).toBe(false)
    expect(wrapper.find('aside').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Open navigation and profile"]').exists()).toBe(false)
  })

  it('asks to open the menu from the button and reflects the expanded state', async () => {
    const wrapper = mountNavbar()
    const menu = wrapper.get('[data-testid="menu-button"]')
    expect(menu.attributes('aria-expanded')).toBe('false')
    await menu.trigger('click')
    expect(wrapper.emitted('update:menuOpen')[0]).toEqual([true])
    await wrapper.setProps({ menuOpen: true })
    expect(menu.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('dialog').element.open).toBe(true)
  })

  it('shows sign in and create account in the drawer when signed out', () => {
    const wrapper = mountNavbar({ user: null })
    const names = wrapper.findAll('.menu-link').map((node) => node.text())
    expect(names).toContain('Sign in')
    expect(names).toContain('Create account')
    expect(names).not.toContain('Sign out')
  })

  it('passes sign out through', async () => {
    const wrapper = mountNavbar()
    await wrapper.get('[data-testid="site-menu-sign-out"]').trigger('click')
    expect(wrapper.emitted('signOut')).toHaveLength(1)
  })

  it('opens on an unhandled Escape', async () => {
    const wrapper = mountNavbar()
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(wrapper.emitted('update:menuOpen')?.[0]).toEqual([true])
  })
})
