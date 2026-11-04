import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import WelcomePage from '../WelcomePage.vue'

async function mountPage() {
  const router = createRouter({ history: createMemoryHistory(), routes: [] })
  await router.push('/')
  return mount(WelcomePage, { global: { plugins: [router] } })
}

describe('welcome page', () => {
  it('names the site and offers sign in, create account and about', async () => {
    const wrapper = await mountPage()
    expect(wrapper.get('h1').text()).toBe('Sharlock Hub')
    const target = (name) =>
      wrapper
        .findAll('a')
        .find((link) => link.text() === name)
        ?.attributes('href')
    expect(target('Sign in')).toBe('/login')
    expect(target('Create account')).toBe('/register')
    expect(target('About')).toBe('/about')
  })

  it('hides its backdrop from assistive technology', async () => {
    const wrapper = await mountPage()
    expect(wrapper.get('.welcome-scene').attributes('aria-hidden')).toBe('true')
    wrapper.findAll('.welcome-scene img').forEach((img) => expect(img.attributes('alt')).toBe(''))
  })
})
