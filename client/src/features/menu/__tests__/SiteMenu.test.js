import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, shallowRef } from 'vue'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import SiteMenu from '../SiteMenu.vue'
import { provideTownControls } from '../townControls.js'
import { gameCatalog } from '../../../data/gameCatalog.js'
import { resetRoster, usePresenceRoster } from '../../hub/presence/roster.js'

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

  it('links the discoveries count to the log and closes the menu on use', async () => {
    const wrapper = mountMenu()
    const link = wrapper.getComponent('[data-testid="menu-discoveries"]')
    expect(link.props('to')).toBe('/discoveries')
    await link.trigger('click')
    expect(wrapper.emitted('navigate')).toHaveLength(1)
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

  describe('online in your class', () => {
    afterEach(resetRoster)

    it('is hidden unless the 3d hub is running presence', () => {
      const wrapper = mountMenu()
      expect(wrapper.find('[data-testid="menu-online"]').exists()).toBe(false)
      wrapper.unmount()
    })

    it('says so when another tab took over', async () => {
      const wrapper = mountMenu()
      usePresenceRoster().state.superseded = true
      await wrapper.vm.$nextTick()
      expect(wrapper.get('[data-testid="menu-online-elsewhere"]').text()).toBe(
        'Open in another tab',
      )
      expect(wrapper.find('[data-testid="menu-online"]').exists()).toBe(false)
      wrapper.unmount()
    })

    it('shows the count and a collapsible list of classmates', async () => {
      const { state } = usePresenceRoster()
      state.active = true
      state.peers = [
        { sid: 'a', username: 'ada', staff: false },
        { sid: 'b', username: 'mr_lee', staff: true },
      ]
      const wrapper = mountMenu()
      expect(wrapper.get('[data-testid="menu-online-toggle"]').text()).toBe(
        'Online in your class: 2',
      )
      const toggle = wrapper.get('[data-testid="menu-online-toggle"]')
      expect(toggle.attributes('aria-expanded')).toBe('false')
      expect(wrapper.get('[data-testid="menu-online-list"]').isVisible()).toBe(false)
      await toggle.trigger('click')
      expect(toggle.attributes('aria-expanded')).toBe('true')
      const items = wrapper.findAll('[data-testid="menu-online-list"] li').map((li) => li.text())
      expect(items).toEqual(['ada', 'mr_lee (staff)'])
      expect(wrapper.find('[data-testid="menu-online-class"]').exists()).toBe(false)
      wrapper.unmount()
    })

    it('gives staff a class picker that changes the chosen class', async () => {
      const { state } = usePresenceRoster()
      state.active = true
      state.staff = true
      state.classes = [
        { cohortId: 'c1', cohortName: 'One' },
        { cohortId: 'c2', cohortName: 'Two' },
      ]
      state.selectedCohortId = 'c1'
      const wrapper = mountMenu({ user: instructor })
      await wrapper.get('[data-testid="menu-online-class"]').setValue('c2')
      expect(state.selectedCohortId).toBe('c2')
      wrapper.unmount()
    })
  })
})

describe('places', () => {
  function mountWithControls(controls) {
    const Host = defineComponent({
      setup() {
        provideTownControls(controls)
        return () => h(SiteMenu, { open: true, user: student })
      },
    })
    return mount(Host, {
      attachTo: document.body,
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
  }

  it('lists every building only when the town registered a jump function', async () => {
    const jump = vi.fn()
    const wrapper = mountWithControls({ jumpTo: shallowRef(jump) })
    const places = wrapper.get('nav[aria-label="Places"]')
    expect(places.find('h3').text()).toBe('Places')
    expect(places.findAll('button').map((node) => node.text())).toEqual(
      gameCatalog.map((game) => game.name),
    )
    wrapper.unmount()
  })

  it('shows no places without a registered jump function', () => {
    const wrapper = mountWithControls({ jumpTo: shallowRef(null) })
    expect(wrapper.find('nav[aria-label="Places"]').exists()).toBe(false)
    wrapper.unmount()
    const bare = mountMenu({ open: true })
    expect(bare.find('nav[aria-label="Places"]').exists()).toBe(false)
    bare.unmount()
  })

  it('closes the menu and jumps to the chosen building', async () => {
    const jump = vi.fn()
    const wrapper = mountWithControls({ jumpTo: shallowRef(jump) })
    await wrapper.get('nav[aria-label="Places"] button').trigger('click')
    await flushPromises()
    expect(wrapper.getComponent(SiteMenu).emitted('navigate')).toHaveLength(1)
    expect(jump).toHaveBeenCalledWith(gameCatalog[0].id)
    wrapper.unmount()
  })
})
