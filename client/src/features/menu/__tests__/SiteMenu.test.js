import { describe, expect, it } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import SiteMenu from '../SiteMenu.vue'

const student = { username: 'detective_boey', avatarId: 'capybara', globalRoles: ['student'] }
const instructor = { ...student, globalRoles: ['instructor'] }
const admin = { ...student, globalRoles: ['admin', 'instructor'] }

function mountMenu(props = {}) {
  return mount(SiteMenu, {
    props: { open: false, user: student, ...props },
    attachTo: document.body,
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}
const labels = (wrapper) => wrapper.findAll('.menu-link').map((node) => node.text())

describe('site menu', () => {
  it('shows the discoveries count', async () => {
    const wrapper = mountMenu()
    expect(wrapper.get('[data-testid="menu-discoveries"]').text()).toMatch(/Discoveries\s+\d\/6/)
    wrapper.unmount()
  })

  it('opens the dialog when asked and shows the header with the username note', async () => {
    const wrapper = mountMenu()
    expect(wrapper.get('dialog').element.open).toBe(false)
    await wrapper.setProps({ open: true })
    expect(wrapper.get('dialog').element.open).toBe(true)
    expect(wrapper.get('#site-menu-title').text()).toBe('Sharlock Hub')
    expect(wrapper.get('.menu-user').text()).toContain('detective_boey')
    expect(wrapper.get('.menu-user').text()).toContain('Results are not saved')
    wrapper.unmount()
  })

  it('moves focus into the menu on open and asks to close on Escape', async () => {
    const wrapper = mountMenu()
    await wrapper.setProps({ open: true })
    await wrapper.vm.$nextTick()
    expect(document.activeElement).toBe(wrapper.get('[data-testid="site-menu-close"]').element)
    await wrapper.get('dialog').trigger('cancel')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('lists entries by role', () => {
    const studentMenu = mountMenu({ user: student })
    expect(labels(studentMenu)).toEqual([
      'Profile & progress',
      'Leaderboard',
      'Your classes',
      'Settings',
      'About Sharlock',
      'Sign out',
    ])
    const instructorMenu = mountMenu({ user: instructor })
    expect(labels(instructorMenu)).toContain('Class enrollment')
    expect(labels(instructorMenu)).not.toContain('Your classes')
    expect(labels(instructorMenu)).not.toContain('Administrator workspace')
    const adminMenu = mountMenu({ user: admin })
    expect(labels(adminMenu)).toContain('Administrator workspace')
    ;[studentMenu, instructorMenu, adminMenu].forEach((wrapper) => wrapper.unmount())
  })

  it('offers sign in and create account when signed out', () => {
    const wrapper = mountMenu({ user: null })
    expect(labels(wrapper)).toEqual(['Settings', 'About Sharlock', 'Sign in', 'Create account'])
    wrapper.unmount()
  })

  it('emits sign-out and disables the button while pending', async () => {
    const wrapper = mountMenu()
    await wrapper.get('[data-testid="site-menu-sign-out"]').trigger('click')
    expect(wrapper.emitted('sign-out')).toHaveLength(1)
    await wrapper.setProps({ logoutPending: true })
    const button = wrapper.get('[data-testid="site-menu-sign-out"]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.text()).toBe('Signing out…')
    wrapper.unmount()
  })

  it('emits navigate when an entry is chosen', async () => {
    const wrapper = mountMenu()
    await wrapper.findAllComponents(RouterLinkStub)[0].trigger('click')
    expect(wrapper.emitted('navigate')).toHaveLength(1)
    wrapper.unmount()
  })
})
