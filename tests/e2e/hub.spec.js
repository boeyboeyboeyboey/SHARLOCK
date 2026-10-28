import { test, expect } from './fixtures/auth.js'
import { gameCatalog } from '../../client/src/data/gameCatalog.js'

const startShot =
  '/private/tmp/claude-501/-Users-boey-Documents-SMU-2-1-wad2-group-proj-IS216-GROUP7-SHARLOCK/096f058d-3b1d-428a-b555-066dffafadfc/scratchpad/hub-a-start.png'

// the software renderer builds the wharf slowly
test.setTimeout(240000)
const slow = { timeout: 120000 }

function newsFixture() {
  const now = Date.now()
  return {
    provider: 'The Guardian',
    section: 'cybersecurity',
    range: 'week',
    dateKey: new Date(now).toISOString().slice(0, 10),
    timezone: 'Asia/Singapore',
    editionLimit: 50,
    window: {
      from: new Date(now - 7 * 86400000).toISOString(),
      to: new Date(now + 86400000).toISOString(),
    },
    articles: Array.from({ length: 3 }, (_, index) => ({
      id: `cybersecurity/${index}`,
      title: `Synthetic headline ${index + 1}`,
      url: `https://www.theguardian.com/test/${index}`,
      publishedAt: new Date(now - index * 60000).toISOString(),
      byline: [{ type: 'text', text: 'Fixture reporter' }],
      excerpt: [{ type: 'text', text: 'This is synthetic test content.' }],
      copyright: '',
    })),
    fetchedAt: new Date(now).toISOString(),
    freshUntil: new Date(now + 1800000).toISOString(),
    expiresAt: new Date(now + 23 * 3600000).toISOString(),
    refreshAvailableAt: new Date(now + 1800000).toISOString(),
    stale: false,
    partial: false,
  }
}

test.beforeEach(async ({ page }) => {
  // headless chromium renders in software, which the device checks send to 2D; dev builds honour this key
  await page.addInitScript(() => {
    localStorage.setItem('sharlock.hubForce3d', '1')
    // software rendering is slow by nature, so the runtime watch only reacts to simulated fps
    localStorage.setItem('sharlock.hubWatchManual', '1')
    localStorage.setItem('sharlock.loreIntroSeen', '1')
  })
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  )
  await page.route('https://static.guim.co.uk/**', (route) => route.abort())
  await page.route('**/api/news**', (route) => route.fulfill({ json: newsFixture() }))
})

// a failed start shows its status text, so a broken hub fails fast instead of timing out
async function hubReady(page) {
  await page.waitForFunction(
    () => window.__hub?.state.ready === true || /unavailable/.test(document.body.innerText),
    null,
    slow,
  )
  expect(await page.evaluate(() => window.__hub?.state.ready)).toBe(true)
}
const position = (page) => page.evaluate(() => window.__hub.debug.position())
const moved = async (page, from) => {
  const at = await position(page)
  return Math.hypot(at.x - from.x, at.z - from.z)
}
// waits for rendered frames, so a "nothing happens" check covers real scene updates and not wall-clock time
const frames = (page, count = 30) =>
  page.evaluate(
    (n) =>
      new Promise((resolve) => {
        let left = n
        const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick))
        requestAnimationFrame(tick)
      }),
    count,
  )

test('lists every game, walks, and enters a game route', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await hubReady(page)

  await expect(page.locator('[data-testid^="dest-"]')).toHaveCount(gameCatalog.length)
  for (const game of gameCatalog) {
    await expect(page.getByTestId(`dest-${game.id}`)).toHaveText(game.name)
  }
  await page.screenshot({ path: startShot })

  // keyboard walking works while nothing is paused
  const before = await position(page)
  await page.keyboard.down('KeyW')
  await expect.poll(() => moved(page, before), slow).toBeGreaterThan(0.2)
  await page.keyboard.up('KeyW')

  await page.getByTestId('dest-cli-cyber-defender').click()
  await expect(page.getByTestId('dest-cli-cyber-defender')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('enter')).toHaveText('Enter CLI Cyber Defender')
  await page.getByTestId('enter').click()
  await expect(page).toHaveURL(/\/games\/cli-cyber-defender$/, slow)
})

test('deselects a destination by clicking it again or pressing Escape', async ({ page }) => {
  await page.goto('/')
  await hubReady(page)
  const dest = page.getByTestId('dest-social-engineering-simulator')
  const enter = page.getByTestId('enter')

  const origin = await position(page)
  await dest.click()
  await expect(dest).toHaveAttribute('aria-pressed', 'true')
  await expect(enter).toBeVisible()
  // let the auto-walk get going, then cancel it
  await expect.poll(() => moved(page, origin), slow).toBeGreaterThan(0.05)
  await dest.click()
  await expect(dest).toHaveAttribute('aria-pressed', 'false')
  await expect(enter).toHaveCount(0)
  expect(await page.evaluate(() => window.__hub.state.selected)).toBeNull()
  const stopped = await position(page)
  await frames(page)
  const later = await position(page)
  expect(Math.hypot(later.x - stopped.x, later.z - stopped.z)).toBeLessThan(0.3)

  await dest.click()
  await expect(dest).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await expect(dest).toHaveAttribute('aria-pressed', 'false')
  await expect(enter).toHaveCount(0)

  // steering by hand before arriving drops the pick
  await dest.click()
  await expect(dest).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.down('KeyS')
  await expect(dest).toHaveAttribute('aria-pressed', 'false', slow)
  await page.keyboard.up('KeyS')
  await expect(enter).toHaveCount(0)
})

test('returns to the door of the building that was entered', async ({ page }) => {
  await page.goto('/')
  await hubReady(page)
  await page.getByTestId('dest-cli-cyber-defender').click()
  await page.getByTestId('enter').click()
  await expect(page).toHaveURL(/\/games\/cli-cyber-defender$/, slow)

  await page.goBack()
  await expect(page).toHaveURL('/')
  await hubReady(page)
  const door = (await page.evaluate(() => window.__hub.debug.doors())).find(
    (d) => d.id === 'cli-cyber-defender',
  )
  const at = await position(page)
  expect(Math.hypot(at.x - door.x, at.z - door.z)).toBeLessThan(3)
  expect(await page.evaluate(() => sessionStorage.getItem('sharlock.hubReturn'))).toBeNull()
  // standing on the ring after coming back does not reselect the building
  await frames(page)
  expect(await page.evaluate(() => window.__hub.state.selected)).toBeNull()
  await expect(page.getByTestId('dest-cli-cyber-defender')).toHaveAttribute('aria-pressed', 'false')

  // walking off the selected building's ring deselects it
  await page.getByTestId('dest-cli-cyber-defender').click()
  await expect(page.getByTestId('dest-cli-cyber-defender')).toHaveAttribute('aria-pressed', 'true')
  await expect
    .poll(() => page.evaluate(() => window.__hub.state.nearDoor), slow)
    .toBe('cli-cyber-defender')
  await page.evaluate(() => window.__hub.debug.walkTo(0, 20))
  await expect.poll(() => page.evaluate(() => window.__hub.state.selected), slow).toBeNull()
  await expect(page.getByTestId('dest-cli-cyber-defender')).toHaveAttribute('aria-pressed', 'false')

  // a fresh visit starts at the usual spot
  await page.reload()
  await hubReady(page)
  const fresh = await position(page)
  expect(Math.hypot(fresh.x - door.x, fresh.z - door.z)).toBeGreaterThan(8)
})

test('fills the window below the navbar without sideways scroll', async ({ page }) => {
  await page.goto('/')
  await hubReady(page)
  const metrics = await page.evaluate(() => ({
    viewport: window.innerHeight,
    navbar: document.querySelector('.portal-header').getBoundingClientRect().bottom,
    hub: document.querySelector('.hub-scene').getBoundingClientRect().height,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(metrics.hub).toBeGreaterThanOrEqual(metrics.viewport - metrics.navbar - 2)
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth)
  await expect(page.getByRole('heading', { level: 1, name: 'Thames Wharf' })).toHaveCount(1)
  await expect(page.getByText('Welcome to Sharlock Town')).toHaveCount(0)
})

test('remounts the hub after leaving it and keeps the news dialog usable', async ({ page }) => {
  await page.goto('/')
  await hubReady(page)
  await page.getByTestId('dest-cli-cyber-defender').click()
  await page.getByTestId('enter').click()
  await expect(page).toHaveURL(/\/games\/cli-cyber-defender$/, slow)
  await expect(page.locator('canvas.hub-canvas')).toHaveCount(0)

  await page.goBack()
  await expect(page).toHaveURL('/')
  await hubReady(page)
  const counts = await page.evaluate(() => ({
    mounts: window.__hub.state.mounts,
    disposals: window.__hub.state.disposals,
  }))
  expect(counts).toEqual({ mounts: 2, disposals: 1 })
  await expect(page.locator('canvas.hub-canvas')).toHaveCount(1)

  await page.getByTestId('dest-threat-briefing').click()
  await page.getByTestId('enter').click()
  await expect(page.getByRole('dialog', { name: 'The Sharlock Times' })).toBeVisible(slow)
  expect(await page.evaluate(() => window.__hub.state.inputPaused)).toBe(true)
  await expect(page.getByTestId('hub-minimap')).toHaveCount(0)
  await page.waitForFunction(() => window.__hub.state.mode === 'explore', null, slow)

  const before = await position(page)
  await page.keyboard.down('KeyW')
  await frames(page)
  await page.keyboard.up('KeyW')
  const after = await position(page)
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(0.05)

  await page.getByRole('button', { name: 'Close newspaper' }).click()
  await expect(page).toHaveURL('/')
  expect(await page.evaluate(() => window.__hub.state.inputPaused)).toBe(false)
})

test('switches between the 3D wharf and the 2D town and remembers the choice', async ({ page }) => {
  const toggle = page.getByTestId('town-mode-toggle')
  const town = page.getByRole('region', { name: 'Interactive town map' })
  await page.goto('/')
  await hubReady(page)
  await expect(toggle).toHaveText('2D map')
  await expect(toggle).toHaveAccessibleName('Switch to 2D map')
  await expect(toggle).not.toHaveAttribute('aria-pressed')
  await expect(town).toHaveCount(0)
  // the 3D hub plays its own ambience loop, never the town music
  await expect(page.locator('audio')).toHaveCount(1)
  await expect(page.locator('audio')).toHaveAttribute('src', '/audio/hub-ambience.mp3')
  await expect(page.getByRole('button', { name: /hub sound$/ })).toBeVisible()

  await toggle.click()
  await expect(town).toBeVisible()
  await expect(page.locator('audio')).toHaveCount(1)
  await expect(page.locator('audio')).toHaveAttribute('src', '/audio/sharlock-bgm.mp3')
  await expect(page.getByRole('button', { name: /hub sound$/ })).toHaveCount(0)
  await expect(page.locator('canvas.hub-canvas')).toHaveCount(0)
  expect(await page.evaluate(() => window.__hub)).toBeUndefined()
  await expect(toggle).toHaveText('3D wharf')
  await expect(toggle).toHaveAccessibleName('Switch to 3D wharf')
  await expect(toggle).not.toHaveAttribute('aria-pressed')

  await page.reload()
  await expect(town).toBeVisible()
  await expect(toggle).toHaveText('3D wharf')
  expect(await page.evaluate(() => localStorage.getItem('sharlock.townMode'))).toBe('2d')

  await toggle.click()
  await hubReady(page)
  await expect(town).toHaveCount(0)
  await expect(page.locator('audio')).toHaveCount(1)
  await expect(page.locator('audio')).toHaveAttribute('src', '/audio/hub-ambience.mp3')
  await page.reload()
  await hubReady(page)
  await expect(toggle).toHaveText('2D map')
})

test('rebuilds the hub at the low tier from the Graphics setting and remembers it', async ({
  page,
}) => {
  await page.goto('/')
  await hubReady(page)
  const graphics = page.getByTestId('hub-graphics')
  await expect(graphics).toHaveAccessibleName(/graphics/i)
  await expect(graphics).toHaveValue('auto')
  expect(await page.evaluate(() => window.__hub.state.tier)).not.toBe('low')

  await graphics.focus()
  await graphics.selectOption('low')
  await page.waitForFunction(
    () => window.__hub?.state.tier === 'low' && window.__hub.state.ready,
    null,
    slow,
  )
  expect(await page.evaluate(() => localStorage.getItem('sharlock.graphics'))).toBe('low')
  expect(await page.evaluate(() => window.__hub.state.look.mirror)).toBe(false)
  await expect(page.locator('canvas.hub-canvas')).toHaveCount(1)
  await expect(graphics).toBeFocused()

  await page.reload()
  await hubReady(page)
  await expect(graphics).toHaveValue('low')
  expect(await page.evaluate(() => window.__hub.state.tier)).toBe('low')
})

const cameraAlpha = (page) => page.evaluate(() => window.__hub.debug.cameraState().alpha)
// shortest arc between the camera and the spot behind sharlock, in radians
const offBehind = (page) =>
  page.evaluate(() => {
    const heading = window.__hub.state.player.heading
    const want = Math.atan2(-Math.cos(heading), -Math.sin(heading))
    const diff = window.__hub.debug.cameraState().alpha - want
    return Math.abs(diff - Math.PI * 2 * Math.round(diff / (Math.PI * 2)))
  })

test('turns the camera with Q and brings it back with the reset button and R', async ({ page }) => {
  await page.goto('/')
  await hubReady(page)
  const start = await cameraAlpha(page)

  // the software renderer is slow, so keep the key down until the camera has visibly turned
  await page.keyboard.down('KeyQ')
  await expect
    .poll(async () => Math.abs((await cameraAlpha(page)) - start), slow)
    .toBeGreaterThan(0.15)
  await page.keyboard.up('KeyQ')
  await expect.poll(() => offBehind(page), slow).toBeGreaterThan(0.1)

  await page.getByTestId('hub-reset-camera').click()
  await expect.poll(() => offBehind(page), slow).toBeLessThan(0.15)

  await page.keyboard.down('KeyE')
  await expect.poll(() => offBehind(page), slow).toBeGreaterThan(0.15)
  await page.keyboard.up('KeyE')
  await page.keyboard.press('KeyR')
  await expect.poll(() => offBehind(page), slow).toBeLessThan(0.15)
})

test('minimap selects a destination and follows the player', async ({ page }, testInfo) => {
  await page.goto('/')
  await hubReady(page)
  const compact = testInfo.project.name.endsWith('mobile-chromium')
  const map = page.getByTestId('hub-minimap')
  const toggle = page.getByTestId('hub-map-toggle')
  const id = 'social-engineering-simulator'
  const pin = page.getByTestId(`hub-map-${id}`)
  await expect(pin).toHaveCount(1, slow)

  // the dot sits where the player stands: x east, z north, with the map's west and north edges at x -34 and z 80
  await page.evaluate(() => window.__hub.debug.teleport(4, 10))
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const dot = document.querySelector('[data-testid="hub-minimap"] .m-dot')
          return dot
            ? [Math.round(dot.getAttribute('cx')), Math.round(dot.getAttribute('cy'))]
            : null
        }),
      slow,
    )
    .toEqual([38, 70])

  if (compact) {
    await expect(map).toBeHidden()
    await toggle.click()
  } else {
    await expect(toggle).toBeHidden()
    await expect(map).toBeVisible()
  }
  await expect(map).toHaveAccessibleName('Map')
  await expect(pin).toHaveAccessibleName('Travel to LLM Social Engineering Simulator')
  await pin.click()
  await expect(page.getByTestId(`dest-${id}`)).toHaveAttribute('aria-pressed', 'true')
  await expect(pin).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => window.__hub.state.selected)).toBe(id)
  await expect(page.getByTestId('enter')).toBeVisible()
  // choosing a building closes the compact overlay
  if (compact) await expect(map).toBeHidden()
})

test('the mobile map opens from the Map button and closes with Escape', async ({
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.endsWith('mobile-chromium'),
    'the compact map only exists on phones',
  )
  await page.goto('/')
  await hubReady(page)
  const map = page.getByTestId('hub-minimap')
  const toggle = page.getByTestId('hub-map-toggle')
  await expect(toggle).toBeVisible(slow)
  await expect(map).toBeHidden()

  await toggle.click()
  await expect(map).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByTestId('hub-map-close')).toBeFocused()
  const box = await map.boundingBox()
  const scene = await page.locator('.hub-scene').boundingBox()
  expect(box.width).toBeGreaterThan(scene.width - 4)
  expect(box.height).toBeGreaterThan(scene.height - 4)

  // escape closes the map without deselecting anything, and focus goes back to the button
  await page.keyboard.press('Escape')
  await expect(map).toBeHidden()
  await expect(toggle).toBeFocused()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')

  await toggle.click()
  await page.getByTestId('hub-map-close').click()
  await expect(map).toBeHidden()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})

test('Space jumps once: leaves the ground, lands again and cannot double jump', async ({
  page,
}) => {
  await page.goto('/')
  await hubReady(page)
  await page.evaluate(() => document.activeElement?.blur())
  // the capsule starts a little above the cobbles, so wait until its height stops changing
  let last = Infinity
  await expect
    .poll(async () => {
      const y = (await position(page)).y
      const still = Math.abs(y - last) < 0.002
      last = y
      return still
    }, slow)
    .toBe(true)
  const base = last
  await page.evaluate(() => {
    window.__maxY = -Infinity
    window.__peakTimer = setInterval(() => {
      window.__maxY = Math.max(window.__maxY, window.__hub.debug.position().y)
    }, 20)
  })

  await page.keyboard.press('Space')
  await expect.poll(async () => (await position(page)).y - base, slow).toBeGreaterThan(0.15)
  // a second press in the air is ignored
  await page.keyboard.press('Space')
  await expect.poll(() => page.evaluate(() => window.__hub.debug.airborne()), slow).toBe(false)
  await expect.poll(async () => Math.abs((await position(page)).y - base), slow).toBeLessThan(0.1)

  const apex = await page.evaluate(() => {
    clearInterval(window.__peakTimer)
    return window.__maxY
  })
  expect(apex - base).toBeGreaterThan(0.15)
  expect(apex - base).toBeLessThan(0.9)
})

test('the jump button shows with the joystick on phones only', async ({ page }, testInfo) => {
  await page.goto('/')
  await hubReady(page)
  const jump = page.getByTestId('hub-jump')
  if (testInfo.project.name.endsWith('mobile-chromium')) {
    await expect(jump).toBeVisible(slow)
    await expect(jump).toHaveAccessibleName('Jump')
    const box = await jump.boundingBox()
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
  } else {
    await expect(jump).toBeHidden()
  }
})
