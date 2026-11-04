import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import {
  installPageWipes,
  sectionConfig,
  sectionOf,
  WIPE_COLUMNS,
  WIPE_COVER_MS,
  WIPE_HOLD_MS,
  WIPE_PATTERNS,
  WIPE_ROWS,
  WIPE_SECTIONS,
  wipe,
  wipeDuration,
} from '../pixel-wipe.js'

const page = { render: () => null }

// a router shaped like the app's: town with the newspaper dialog as a child, the other main tabs,
// and a couple of ordinary pages
function createTestRouter({ signedOut = false, laterGuard, hold = 0 } = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        name: 'town',
        component: page,
        children: [{ path: '/games/threat-briefing', name: 'news', component: page }],
      },
      { path: '/profile', component: page, meta: { overlay: true } },
      { path: '/settings', component: page, meta: { overlay: true } },
      { path: '/discoveries', component: page, meta: { overlay: true } },
      { path: '/classes', component: page, meta: { overlay: true } },
      { path: '/leaderboard', component: page, meta: { overlay: true } },
      { path: '/games/clearance-tower', component: page },
      { path: '/games/cli-cyber-defender', component: page },
      { path: '/games/brand-new-game', component: page },
      { path: '/login', name: 'login', component: page },
      { path: '/about', name: 'about', component: page, meta: { overlay: true } },
      { path: '/register', component: page },
      { path: '/join-class', component: page },
      { path: '/instructor', component: page },
      { path: '/admin', component: page },
    ],
  })
  // the account guard runs first and may redirect a signed-out visitor away from town
  router.beforeEach((to) => (signedOut && to.name === 'town' ? { path: '/login' } : true))
  installPageWipes(router, { hold }) // no hold by default keeps the other tests quick
  if (laterGuard) router.beforeResolve(laterGuard)
  return router
}

// every phase the overlay goes through while `action` runs, and which tab's wipe played
async function observe(action) {
  const phases = [wipe.phase]
  const sections = new Set()
  const watch = setInterval(() => {
    if (phases.at(-1) !== wipe.phase) phases.push(wipe.phase)
    if (wipe.phase !== 'idle') sections.add(wipe.section)
  }, 5)
  await action()
  await vi.waitFor(() => expect(wipe.phase).toBe('idle'), { timeout: 3000 })
  clearInterval(watch)
  if (phases.at(-1) !== wipe.phase) phases.push(wipe.phase)
  return { phases, sections: [...sections] }
}

afterEach(() => {
  vi.unstubAllGlobals()
  wipe.phase = 'idle'
})

describe('wipe patterns', () => {
  const grid = (pattern) =>
    Array.from({ length: WIPE_ROWS }, (_, row) =>
      Array.from({ length: WIPE_COLUMNS }, (_, column) => pattern(column, row)),
    )

  it('are all different from one another', () => {
    const shapes = Object.values(WIPE_PATTERNS).map((pattern) => JSON.stringify(grid(pattern)))
    expect(new Set(shapes).size).toBe(shapes.length)
  })

  it('start at once and every tab takes the same time to cover the screen', () => {
    for (const name of Object.keys(WIPE_SECTIONS)) {
      const delays = grid(WIPE_PATTERNS[WIPE_SECTIONS[name].pattern]).flat()
      expect(Math.min(...delays)).toBe(0)
      expect(wipeDuration(name)).toBe(WIPE_COVER_MS)
    }
  })

  it('add up to about 1.6 seconds from first block to last', () => {
    const total = WIPE_COVER_MS + WIPE_HOLD_MS + WIPE_COVER_MS
    expect(total).toBeGreaterThanOrEqual(1550)
    expect(total).toBeLessThanOrEqual(1600)
  })

  it('gives every tab its own emoji', () => {
    const emoji = Object.values(WIPE_SECTIONS).map((section) => section.emoji)
    expect(emoji.every(Boolean)).toBe(true)
    expect(new Set(emoji).size).toBe(emoji.length)
    expect(WIPE_SECTIONS.profile.emoji).toBe('🔍')
    expect(WIPE_SECTIONS.town.emoji).toBe('🗺️')
  })

  it('gives profile and town different patterns, colours and labels', () => {
    expect(WIPE_SECTIONS.profile.pattern).not.toBe(WIPE_SECTIONS.town.pattern)
    expect(WIPE_SECTIONS.profile.color).not.toBe(WIPE_SECTIONS.town.color)
    expect(WIPE_SECTIONS.profile.label).not.toBe(WIPE_SECTIONS.town.label)
  })
})

describe('sectionOf', () => {
  it('names the main tabs and leaves other pages alone', async () => {
    const router = createTestRouter()
    const sectionAt = async (path) => {
      await observe(() => router.push(path)) // let any wipe finish before the next step
      return sectionOf(router.currentRoute.value)
    }
    expect(await sectionAt('/')).toBe('town')
    expect(await sectionAt('/games/threat-briefing')).toBe('town')
    expect(await sectionAt('/profile')).toBe('profile')
    expect(await sectionAt('/classes')).toBe('classes')
    expect(await sectionAt('/leaderboard')).toBe('leaderboard')
    expect(await sectionAt('/about')).toBe('about')
    expect(await sectionAt('/login')).toBe('login')
    expect(await sectionAt('/register')).toBe('register')
    expect(await sectionAt('/join-class')).toBe('joinClass')
    expect(await sectionAt('/instructor')).toBe('instructor')
    expect(await sectionAt('/admin')).toBe('admin')
    expect(await sectionAt('/games/clearance-tower')).toBe('game:clearance-tower')
    // the newspaper dialog is part of town, not a game
    expect(await sectionAt('/games/threat-briefing')).toBe('town')
    // every step plays a full wipe, so the walk through all the tabs outlasts the default timeout
  }, 30000)
})

describe('game doors', () => {
  it('gives each game its own door colour and emoji, named from the catalog', () => {
    const doors = ['cli-cyber-defender', 'clearance-tower', 'phishing-post-mortem'].map((id) =>
      sectionConfig(`game:${id}`),
    )
    expect(doors.every((door) => door.kind === 'doors')).toBe(true)
    expect(new Set(doors.map((door) => door.color)).size).toBe(doors.length)
    expect(new Set(doors.map((door) => door.emoji)).size).toBe(doors.length)
    expect(sectionConfig('game:clearance-tower').label).toBe('Entering Clearance Tower…')
  })

  it('gives a game with no entry the plain wooden door and still takes the same time', () => {
    const door = sectionConfig('game:brand-new-game')
    expect(door.emoji).toBe('🚪')
    expect(door.label).toBe('Opening the door…')
    expect(wipeDuration('game:brand-new-game')).toBe(WIPE_COVER_MS)
  })

  it('rejects a section name it does not know', () => {
    expect(() => sectionConfig('nowhere')).toThrow('Unknown wipe section')
  })
})

describe('installPageWipes', () => {
  it('stays out of the way on the first page load', async () => {
    const router = createTestRouter()
    expect((await observe(() => router.push('/profile'))).phases).toEqual(['idle'])
  })

  it('covers, navigates underneath, then reveals when town is reached from another page', async () => {
    const router = createTestRouter()
    await router.push('/login')

    const started = Date.now()
    let navigatedAt = 0
    router.afterEach(() => {
      navigatedAt ||= Date.now() - started
    })
    const { phases, sections } = await observe(() => router.push('/'))

    expect(phases).toEqual(['idle', 'cover', 'reveal', 'idle'])
    expect(sections).toEqual(['town'])
    expect(router.currentRoute.value.name).toBe('town')
    // the route only changes once the screen is covered
    expect(navigatedAt).toBeGreaterThanOrEqual(wipeDuration('town') - 5)
  })

  it.each(['/profile', '/leaderboard', '/classes', '/about', '/settings', '/discoveries'])(
    'plays no wipe opening or closing %s over the town',
    async (path) => {
      const router = createTestRouter()
      await router.push('/')
      expect((await observe(() => router.push(path))).sections).toEqual([])
      expect((await observe(() => router.push('/'))).sections).toEqual([])
    },
  )

  it('plays no wipe moving between overlays while the town stays behind', async () => {
    const router = createTestRouter()
    await router.push('/')
    expect((await observe(() => router.push('/profile'))).sections).toEqual([])
    expect((await observe(() => router.push('/leaderboard'))).sections).toEqual([])
    expect((await observe(() => router.push('/about'))).sections).toEqual([])
  })

  it('plays the overlay’s own wipe when it opens from a game, since the town is not behind', async () => {
    const router = createTestRouter()
    await router.push('/')
    await observe(() => router.push('/games/clearance-tower'))
    expect((await observe(() => router.push('/profile'))).sections).toEqual(['profile'])
  })

  it('plays the doors when a game is the destination and the town wipe on the way back', async () => {
    const router = createTestRouter()
    await router.push('/')
    const into = await observe(() => router.push('/games/clearance-tower'))
    expect(into.phases).toEqual(['idle', 'cover', 'reveal', 'idle'])
    expect(into.sections).toEqual(['game:clearance-tower'])

    // one game to another is a new door; back to town is the town wipe
    expect((await observe(() => router.push('/games/cli-cyber-defender'))).sections).toEqual([
      'game:cli-cyber-defender',
    ])
    expect((await observe(() => router.push('/'))).sections).toEqual(['town'])
  })

  it('does not replay the doors for a move within the same game', async () => {
    const router = createTestRouter()
    await router.push('/')
    await observe(() => router.push('/games/clearance-tower'))
    expect((await observe(() => router.push('/games/clearance-tower?level=2'))).phases).toEqual([
      'idle',
    ])
  })

  it('keeps the destination card on screen for the hold before clearing', async () => {
    const router = createTestRouter({ hold: 400 })
    await router.push('/login')
    let navigatedAt = 0
    router.afterEach(() => {
      navigatedAt ||= Date.now()
    })
    let revealAt = 0
    const watch = setInterval(() => {
      if (wipe.phase === 'reveal') revealAt ||= Date.now()
    }, 5)
    await observe(() => router.push('/profile'))
    clearInterval(watch)
    expect(revealAt - navigatedAt).toBeGreaterThanOrEqual(380)
  })

  it('lets a click or key press skip the rest of the hold', async () => {
    const router = createTestRouter({ hold: 5000 })
    await router.push('/login')
    const started = Date.now()
    const finished = observe(() => router.push('/profile'))
    // wait until the page has changed underneath and the hold is running, then click
    await new Promise((resolve) => setTimeout(resolve, wipeDuration('profile') + 200))
    expect(wipe.phase).toBe('cover')
    window.dispatchEvent(new Event('pointerdown'))
    await finished
    expect(Date.now() - started).toBeLessThan(wipeDuration('profile') * 2 + 1500)
  })

  it('does not play when staying within the same tab, including the newspaper dialog', async () => {
    const router = createTestRouter()
    await router.push('/about')
    await observe(() => router.push('/profile'))

    expect((await observe(() => router.push('/profile?tab=badges'))).phases).toEqual(['idle'])

    await observe(() => router.push('/'))
    expect((await observe(() => router.push('/games/threat-briefing'))).phases).toEqual(['idle'])
    expect((await observe(() => router.push('/'))).phases).toEqual(['idle'])
  })

  it('plays when arriving from an ordinary page', async () => {
    const router = createTestRouter()
    await router.push('/login')
    expect((await observe(() => router.push('/profile'))).sections).toEqual(['profile'])
    expect((await observe(() => router.push('/login'))).sections).toEqual(['login'])
  })

  it('plays the About wipe, with its own look, when About is the destination', async () => {
    const router = createTestRouter()
    await router.push('/login')
    const { phases, sections } = await observe(() => router.push('/about'))

    expect(phases).toEqual(['idle', 'cover', 'reveal', 'idle'])
    expect(sections).toEqual(['about'])
    expect(WIPE_SECTIONS.about.pattern).not.toBe(WIPE_SECTIONS.town.pattern)
    expect(WIPE_SECTIONS.about.pattern).not.toBe(WIPE_SECTIONS.profile.pattern)
  })

  it('plays the sign-in wipe when a signed-out visitor is redirected to sign-in', async () => {
    const router = createTestRouter({ signedOut: true })
    await router.push('/about')
    const { phases, sections } = await observe(() => router.push('/'))
    expect(phases).toEqual(['idle', 'cover', 'reveal', 'idle'])
    expect(sections).toEqual(['login'])
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('is skipped for reduced motion', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const router = createTestRouter()
    await router.push('/login')
    expect((await observe(() => router.push('/profile'))).phases).toEqual(['idle'])
    expect(router.currentRoute.value.path).toBe('/profile')
  })

  it('never leaves the overlay up when a later guard throws', async () => {
    const router = createTestRouter({
      laterGuard: (to) => {
        if (to.path === '/profile') throw new Error('guard failed')
        return true
      },
    })
    await router.push('/login')
    const { phases } = await observe(() => router.push('/profile').catch(() => {}))
    expect(phases).toContain('cover')
    expect(wipe.phase).toBe('idle')
  })
})
