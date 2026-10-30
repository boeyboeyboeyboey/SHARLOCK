import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { routes } from './index.js'

function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes })
}

describe('menu overlay routes', () => {
  it.each([
    ['/profile', 'profile'],
    ['/leaderboard', 'leaderboard'],
    ['/classes', 'classes'],
    ['/settings', 'settings'],
    ['/discoveries', 'discoveries'],
    ['/about', 'about'],
  ])('%s is a child of the town route and flagged as an overlay', async (path, name) => {
    const router = makeRouter()
    await router.push(path)
    const { matched, meta } = router.currentRoute.value
    expect(router.currentRoute.value.name).toBe(name)
    expect(matched.map((record) => record.name)).toEqual(['town', name])
    expect(meta.overlay).toBe(true)
    expect(meta.immersive).toBe(true)
  })

  it('keeps the public and account-aware meta of the former pages', async () => {
    const router = makeRouter()
    await router.push('/about')
    expect(router.currentRoute.value.meta.requiresAccount).toBe(false)
    await router.push('/profile')
    expect(router.currentRoute.value.meta.accountAware).toBe(true)
    expect(router.currentRoute.value.meta.requiresAccount).toBe(false)
    await router.push('/leaderboard')
    expect(router.currentRoute.value.meta.requiresAccount).toBe(true)
    await router.push('/discoveries')
    expect(router.currentRoute.value.meta.requiresAccount).toBe(true)
  })

  it('redirects /progress to the progress tab of the profile overlay', async () => {
    const router = makeRouter()
    await router.push('/progress')
    expect(router.currentRoute.value.fullPath).toBe('/profile?tab=progress')
    expect(router.currentRoute.value.name).toBe('profile')
  })

  it('keeps the navbar on every page outside the town', async () => {
    const router = makeRouter()
    for (const path of ['/instructor', '/admin', '/login']) {
      await router.push(path)
      expect(router.currentRoute.value.meta.immersive).toBeUndefined()
    }
  })

  it('gives the game screens the immersive shell with their own controls', async () => {
    const router = makeRouter()
    await router.push('/games/phishing-post-mortem')
    expect(router.currentRoute.value.meta.immersive).toBe(true)
    expect(router.currentRoute.value.meta.interior).toBe('phishing-post-mortem')
  })

  it('keeps the Times as an overlay of the town', async () => {
    const router = makeRouter()
    await router.push('/games/threat-briefing')
    expect(router.currentRoute.value.matched.map((record) => record.name)).toEqual(['town', 'news'])
    expect(router.currentRoute.value.meta.immersive).toBe(true)
  })
})
