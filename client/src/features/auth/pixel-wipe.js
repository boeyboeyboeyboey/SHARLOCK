import { reactive } from 'vue'
import { gameCatalog } from '../../data/gameCatalog.js'

// 8-bit screen wipes played when someone arrives on one of the main tabs from a different page:
// town, profile, classes, the leaderboard or about, and when opening a game; each tab has
// its own pattern, colour, emoji and label so moving between them feels different, and each game
// gets a pair of pixel doors that close, hold, then swing open onto the game. `PixelWipe.vue` (mounted once in App.vue)
// draws it; this module sequences it: blocks cover the screen, the route changes underneath, the
// screen is held covered so the card can be read, then the blocks clear.
//
// Timing: every pattern takes the same WIPE_COVER_MS to cover (and to clear), and the hold fills the
// rest, so each wipe lasts about 1.6 s from the first block to the last (0.42 + 0.73 + 0.42, plus
// two frames for the new page to paint).
export const WIPE_COLUMNS = 16
export const WIPE_ROWS = 10
export const WIPE_COVER_MS = 420
// after the last block turns on, a short settle before the next step
const SETTLE_MS = 60
// if a navigation never reports back, the overlay still clears
const WATCHDOG_MS = 8000
// how long the screen stays fully covered so the destination card can be read; a click or key
// press skips the rest of it
export const WIPE_HOLD_MS = 730

// Each pattern is first written in any convenient unit ("when does this block go, relative to the
// others"), then scaled so the first block goes at 0 ms and the last at WIPE_COVER_MS - SETTLE_MS.
const RAW_PATTERNS = {
  // sweeps from the top-left corner to the bottom-right
  diagonal: (column, row) => column + row,
  // interlaced shutters: even rows sweep left to right, odd rows right to left
  blinds: (column, row) => (row % 2 ? WIPE_COLUMNS - 1 - column : column),
  // bars rise from the bottom, each column starting at its own moment
  bars: (column, row) => ((column * 7) % WIPE_COLUMNS) * 14 + (WIPE_ROWS - 1 - row) * 16,
  // a checkerboard: the dark squares first, then the light ones, each with a little jitter
  checker: (column, row) => ((column + row) % 2) * 220 + ((column * 3 + row * 5) % 8) * 12,
  // rings spreading outward from the middle of the screen
  iris: (column, row) => Math.hypot(column - (WIPE_COLUMNS - 1) / 2, row - (WIPE_ROWS - 1) / 2),
}

function scaled(raw) {
  let earliest = Infinity
  let latest = -Infinity
  for (let row = 0; row < WIPE_ROWS; row += 1) {
    for (let column = 0; column < WIPE_COLUMNS; column += 1) {
      const value = raw(column, row)
      earliest = Math.min(earliest, value)
      latest = Math.max(latest, value)
    }
  }
  const span = WIPE_COVER_MS - SETTLE_MS
  return (column, row) => Math.round(((raw(column, row) - earliest) / (latest - earliest)) * span)
}

// A pattern says when each block switches on (and later off): delay(column, row) in milliseconds.
export const WIPE_PATTERNS = Object.freeze(
  Object.fromEntries(Object.entries(RAW_PATTERNS).map(([name, raw]) => [name, scaled(raw)])),
)

// One entry per main tab. `color` is the block colour; `emoji` and `label` fill the pixel panel
// (the emoji is redrawn as chunky pixel art by PixelEmoji.vue).
export const WIPE_SECTIONS = Object.freeze({
  town: {
    kind: 'blocks',
    pattern: 'diagonal',
    color: 'var(--border-strong)',
    emoji: '🗺️',
    label: 'Entering Sharlock Town…',
  },
  profile: {
    kind: 'blocks',
    pattern: 'blinds',
    color: 'var(--text-main)',
    emoji: '🔍',
    label: 'Opening your detective desk…',
  },
  classes: {
    kind: 'blocks',
    pattern: 'checker',
    color: 'var(--town-gold)',
    emoji: '🎒',
    label: 'Finding your classes…',
  },
  leaderboard: {
    kind: 'blocks',
    pattern: 'checker',
    color: 'var(--town-gold)',
    emoji: '🏆',
    label: 'Checking the rankings…',
  },
  // played when a signed-out visitor is sent back to sign in
  login: {
    kind: 'blocks',
    pattern: 'bars',
    color: '#2f5d8a',
    emoji: '🔑',
    label: 'Heading to the sign-in desk…',
  },
  register: {
    kind: 'blocks',
    pattern: 'diagonal',
    color: '#2f5d8a',
    emoji: '📝',
    label: 'Opening the sign-up desk…',
  },
  joinClass: {
    kind: 'blocks',
    pattern: 'iris',
    color: '#2f6b4a',
    emoji: '🔖',
    label: 'Finding your class…',
  },
  instructor: {
    kind: 'blocks',
    pattern: 'blinds',
    color: '#6b4a8a',
    emoji: '📋',
    label: 'Opening the class register…',
  },
  admin: {
    kind: 'blocks',
    pattern: 'bars',
    color: '#5b6670',
    emoji: '🛡️',
    label: 'Entering the control room…',
  },
  // the capybara's fur brown from the town art
  about: {
    kind: 'blocks',
    pattern: 'iris',
    color: '#7b513d',
    emoji: '🐹',
    label: 'Meeting Sharlock…',
  },
})

// Every game gets a pair of doors. Colour and emoji are per game; the label uses the catalog name,
// so a new game needs no entry here (it gets the plain wooden door).
const GAME_DOORS = Object.freeze({
  'cli-cyber-defender': { emoji: '💻', color: '#2f6b4a' },
  'phishing-post-mortem': { emoji: '🎣', color: '#2f5d8a' },
  'sql-injection-arcade': { emoji: '🕹️', color: '#8a3f5a' },
  'social-engineering-simulator': { emoji: '🕵️', color: '#6b4a8a' },
  'clearance-tower': { emoji: '🏢', color: '#5b6670' },
})
const DEFAULT_DOOR = Object.freeze({ emoji: '🚪', color: '#8a5a3b' })
const gameConfigs = new Map()

// The wipe settings for a section name: a main tab, or `game:<id>` for a game's doors.
export function sectionConfig(section) {
  if (WIPE_SECTIONS[section]) return WIPE_SECTIONS[section]
  if (!section.startsWith('game:')) throw new Error(`Unknown wipe section: ${section}`)
  if (!gameConfigs.has(section)) {
    const id = section.slice('game:'.length)
    const door = GAME_DOORS[id] ?? DEFAULT_DOOR
    const name = gameCatalog.find((game) => game.id === id)?.name
    gameConfigs.set(
      section,
      Object.freeze({
        kind: 'doors',
        color: door.color,
        emoji: door.emoji,
        label: name ? `Entering ${name}…` : 'Opening the door…',
        // the card goes up once the doors are almost shut
        labelAt: 0.7,
      }),
    )
  }
  return gameConfigs.get(section)
}

// how long a section's wipe takes to cover (or clear) the screen
export function wipeDuration(section) {
  const config = sectionConfig(section)
  if (config.kind === 'doors') return WIPE_COVER_MS
  const pattern = WIPE_PATTERNS[config.pattern]
  let latest = 0
  for (let row = 0; row < WIPE_ROWS; row += 1) {
    for (let column = 0; column < WIPE_COLUMNS; column += 1) {
      latest = Math.max(latest, pattern(column, row))
    }
  }
  return latest + SETTLE_MS
}

// idle | cover | reveal. `section` says which tab's wipe is (or was last) playing
export const wipe = reactive({ phase: 'idle', section: 'town' })

// the town page and the newspaper dialog that opens on top of it are both "in town"
const TOWN_ROUTES = new Set(['town', 'news'])

export function sectionOf(route) {
  if (TOWN_ROUTES.has(route.name)) return 'town'
  switch (route.path) {
    case '/profile':
      return 'profile'
    case '/classes':
      return 'classes'
    case '/leaderboard':
      return 'leaderboard'
    case '/about':
      return 'about'
    case '/login':
      return 'login'
    case '/register':
      return 'register'
    case '/join-class':
      return 'joinClass'
    case '/instructor':
      return 'instructor'
    case '/admin':
      return 'admin'
    default:
      // any other overlay opens over the town, so it counts as town and plays no wipe on close
      if (route.meta?.overlay) return 'town'
      // any game page (the newspaper dialog is part of town and was matched above)
      return route.path.startsWith('/games/')
        ? `game:${route.path.slice('/games/'.length).split('/')[0]}`
        : null
  }
}

let watchdog = null
let holdMs = WIPE_HOLD_MS

function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// waits `ms`, or less if the person clicks, taps or presses a key to move things along
function waitOrInput(ms) {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => {
    const target = typeof window === 'undefined' ? null : window
    const events = ['pointerdown', 'keydown']
    const finish = () => {
      clearTimeout(timer)
      for (const name of events) target?.removeEventListener(name, finish, true)
      resolve()
    }
    const timer = setTimeout(finish, ms)
    for (const name of events) target?.addEventListener(name, finish, true)
  })
}

// two frames, so the new page has been painted under the blocks before they clear. A background
// tab pauses animation frames, so the wait is capped rather than holding the overlay on screen.
function afterPaint() {
  if (typeof requestAnimationFrame !== 'function') return wait(32)
  const twoFrames = new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  )
  return Promise.race([twoFrames, wait(120)])
}

function toIdle() {
  clearTimeout(watchdog)
  watchdog = null
  wipe.phase = 'idle'
}

// Runs once the navigation has finished (or failed): clear the blocks to show the page.
async function reveal() {
  if (wipe.phase !== 'cover') return
  await afterPaint()
  if (wipe.phase !== 'cover') return
  // the page is now underneath; keep the card up long enough to read before clearing
  await waitOrInput(holdMs)
  if (wipe.phase !== 'cover') return
  wipe.phase = 'reveal'
  await wait(wipeDuration(wipe.section))
  toIdle()
}

// Plays the matching wipe on every arrival at a main tab from a different page. Registered just
// before navigation is confirmed, so account redirects (for example signed-out visitors sent to
// sign-in) have already been decided and the wipe only plays when that tab really is the target.
export function installPageWipes(router, { hold = WIPE_HOLD_MS } = {}) {
  holdMs = hold
  router.beforeResolve(async (to, from) => {
    const target = sectionOf(to)
    const firstLoad = from.matched.length === 0
    // a wipe already playing means another navigation overlapped it: just let that one through
    const playing = wipe.phase !== 'idle'
    if (playing || prefersReducedMotion() || firstLoad || !target || target === sectionOf(from)) {
      return true
    }
    wipe.section = target
    wipe.phase = 'cover'
    watchdog = setTimeout(toIdle, WATCHDOG_MS)
    await wait(wipeDuration(target))
    return true
  })
  // afterEach also runs for cancelled and failed navigations; onError covers a thrown guard
  router.afterEach(reveal)
  router.onError(reveal)
}
