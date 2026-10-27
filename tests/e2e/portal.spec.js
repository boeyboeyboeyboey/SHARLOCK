import { test, expect } from './fixtures/auth.js'
import { gameCatalog } from '../../client/src/data/gameCatalog.js'

test.beforeEach(async ({ page }) => {
  // these specs exercise the 2D pixel town
  await page.addInitScript(() => localStorage.setItem('sharlock.townMode', '2d'))
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  )
})

test('explores every building without prerequisites while showing account state', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('button', { name: /^Explore / })).toHaveCount(6)
  for (const game of gameCatalog) {
    const building = page.getByRole('button', { name: `Explore ${game.name}`, exact: true })
    await expect(building).toBeEnabled()
    await page.getByLabel('Jump to').selectOption(game.id)
    const card = page.getByRole('region', { name: game.name, exact: true })
    await expect(card).toBeVisible()
    await expect(card.getByRole('heading', { name: game.name, exact: true })).toBeFocused()
    await expect(card.getByText(game.description)).toBeVisible()
    await expect(
      card.getByRole('img', { name: `Difficulty: ${game.difficulty} out of 3 stars` }),
    ).toBeVisible()
    for (const topic of game.backgroundKnowledge)
      await expect(card.getByText(topic, { exact: true })).toBeVisible()
    if (game.id === 'threat-briefing') {
      await card.getByRole('link', { name: 'Read the Times' }).click()
      await expect(page.getByRole('dialog', { name: 'The Sharlock Times' })).toBeVisible()
      await page.getByRole('button', { name: 'Close newspaper' }).click()
      await expect(page).toHaveURL('/')
      // wait for the newsstand focus restore so it cannot race the next card
      await expect(building).toBeFocused()
      continue
    }
    if (game.id === 'cli-cyber-defender') {
      await card.getByRole('link', { name: 'Enter activity' }).click()
      await expect(page).toHaveURL(new RegExp(`${game.route}$`))
      await expect(
        page.getByRole('heading', { name: 'CLI Cyber Defender', level: 1 }),
      ).toBeVisible()
      await page.getByRole('link', { name: 'Back to town' }).click()
      await expect(page).toHaveURL('/')
      continue
    }
    if (game.id === 'phishing-post-mortem') {
      await card.getByRole('link', { name: 'Enter activity' }).click()
      await expect(page).toHaveURL(new RegExp(`${game.route}$`))
      await expect(page.getByRole('heading', { name: game.name, exact: true })).toBeVisible()
      await page.getByRole('link', { name: 'Back to town' }).click()
      await expect(page).toHaveURL('/')
      continue
    }
    if (game.id === 'social-engineering-simulator') {
      await card.getByRole('link', { name: 'Enter activity' }).click()
      await expect(page).toHaveURL(new RegExp(`${game.route}$`))
      await expect(
        page.getByRole('heading', { name: 'LLM Social Engineering Simulator' }),
      ).toBeVisible()
      await page.getByRole('link', { name: 'Back to town' }).click()
      await expect(page).toHaveURL('/')
      continue
    }
    if (game.id === 'clearance-tower') {
      await card.getByRole('link', { name: 'Enter activity' }).click()
      await expect(page).toHaveURL(new RegExp(`${game.route}$`))
      await expect(page.getByRole('heading', { name: 'Clearance Tower', level: 1 })).toBeVisible()
      await page.getByRole('link', { name: 'Back to town' }).click()
      await expect(page).toHaveURL('/')
      continue
    }
    if (game.id === 'sql-injection-arcade') {
      await card.getByRole('link', { name: 'Enter activity' }).click()
      await expect(page).toHaveURL(new RegExp(`${game.route}$`))
      await expect(
        page.getByRole('heading', { name: 'SQL Injection Arcade', level: 1 }),
      ).toBeVisible()
      await page.getByRole('link', { name: 'Back to town' }).click()
      await expect(page).toHaveURL('/')
      continue
    }
    await card.getByRole('link', { name: 'View activity preview' }).click()
    await expect(page).toHaveURL(new RegExp(`${game.route}$`))
    await expect(page.getByRole('heading', { name: 'A new case is taking shape.' })).toBeVisible()
    await page.getByRole('link', { name: 'Keep exploring', exact: true }).click()
    await expect(page.locator('.town-player')).toContainText('Results are not saved')
  }
  await page.goto('/games/mini-ctf')
  await expect(page).toHaveURL('/games/sql-injection-arcade')
  await expect(page.getByRole('heading', { name: 'SQL Injection Arcade', level: 1 })).toBeVisible()
  // the regex legacy urls now redirect to the playable clearance tower that replaced it
  for (const previous of ['red-blue', 'regex-defender']) {
    await page.goto(`/games/${previous}`)
    await expect(page).toHaveURL('/games/clearance-tower')
    await expect(page.getByRole('heading', { name: 'Clearance Tower', level: 1 })).toBeVisible()
  }
  // the cli legacy url now redirects to the playable game, not a preview
  await page.goto('/games/integrity-detective')
  await expect(page).toHaveURL('/games/cli-cyber-defender')
  await expect(page.getByRole('heading', { name: 'CLI Cyber Defender', level: 1 })).toBeVisible()
  // the social-engineering legacy url now redirects to the playable game, not a preview
  await page.goto('/games/access-control')
  await expect(page).toHaveURL('/games/social-engineering-simulator')
  await expect(
    page.getByRole('heading', { name: 'LLM Social Engineering Simulator' }),
  ).toBeVisible()
})

test('opens details by pointer, touch, and keyboard and restores focus on Escape', async ({
  page,
}, testInfo) => {
  await page.goto('/dashboard')
  const building = page.getByRole('button', { name: 'Explore CLI Cyber Defender', exact: true })
  const card = page.getByRole('region', { name: 'CLI Cyber Defender', exact: true })
  if (testInfo.project.name === 'desktop-chromium') {
    await building.hover()
    await expect(card).toBeVisible()
    await card.hover()
    await expect(card).toBeVisible()
    await page.getByRole('heading', { level: 1 }).hover()
    await expect(card).toBeHidden()
    await building.focus()
    await expect(card).toBeVisible()
    await expect(building).toBeFocused()
    await page.keyboard.press('Enter')
  } else await building.tap()
  await expect(card.getByRole('heading', { name: 'CLI Cyber Defender', exact: true })).toBeFocused()
  const inside = await card.evaluate((el) => {
    const cardBounds = el.getBoundingClientRect()
    const frame = el.parentElement.getBoundingClientRect()
    return (
      cardBounds.left >= frame.left &&
      cardBounds.right <= frame.right &&
      cardBounds.top >= frame.top &&
      cardBounds.bottom <= frame.bottom
    )
  })
  expect(inside).toBe(true)
  await page.keyboard.press('Escape')
  await expect(card).toBeHidden()
  await expect(building).toBeFocused()
  await page.keyboard.press('Enter')
  await card.getByRole('button', { name: 'Close activity details' }).click()
  await expect(card).toBeHidden()
  await expect(building).toBeFocused()
})

test('keeps the camera bounded and supports keyboard panning', async ({ page }) => {
  await page.goto('/dashboard')
  const map = page.getByRole('region', { name: 'Interactive town map' })
  const offset = () =>
    map.evaluate(
      (el) =>
        el.querySelector('.town-world').getBoundingClientRect().top -
        el.getBoundingClientRect().top,
    )
  await map.focus()
  await page.keyboard.press('ArrowDown')
  await expect.poll(offset).toBeLessThan(-50)
  await page.getByLabel('Jump to').selectOption('clearance-tower')
  await expect(page.getByRole('region', { name: 'Clearance Tower', exact: true })).toBeVisible()
  await expect.poll(offset).toBeLessThan(-100)
})

test('plays the repository soundtrack only after a click and stops on departure', async ({
  page,
}) => {
  await page.goto('/dashboard')
  const audio = page.locator('audio')
  expect(
    await audio.evaluate((el) => ({
      muted: el.muted,
      paused: el.paused,
      loop: el.loop,
      autoplay: el.autoplay,
    })),
  ).toEqual({ muted: true, paused: true, loop: true, autoplay: false })
  await page.getByRole('button', { name: 'Turn on town sound' }).click()
  await expect(page.getByRole('button', { name: 'Mute town sound' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect.poll(() => audio.evaluate((el) => el.currentTime)).toBeGreaterThan(0)
  expect(await audio.evaluate((el) => el.muted || el.paused)).toBe(false)
  await page.getByRole('button', { name: 'Mute town sound' }).click()
  expect(await audio.evaluate((el) => el.muted && el.paused)).toBe(true)
  await page.getByRole('button', { name: 'Turn on town sound' }).click()
  await expect(page.getByRole('button', { name: 'Mute town sound' })).toBeVisible()
  const handle = await audio.elementHandle()
  await page.getByRole('link', { name: 'View your detective profile' }).click()
  await expect(page).toHaveURL(/\/profile$/)
  await expect(
    page.getByRole('heading', { name: 'A curious mind looks good on you.' }),
  ).toBeVisible()
  expect(await handle.evaluate((el) => el.paused && el.muted)).toBe(true)
  await page.goto('/dashboard')
  expect(await audio.evaluate((el) => el.muted && el.paused)).toBe(true)
})

test('navigates to the profile and handles mobile focus and dismissal', async ({
  page,
}, testInfo) => {
  await page.goto('/dashboard')
  if (testInfo.project.name === 'mobile-chromium') {
    const opener = page.getByRole('button', { name: 'Open navigation and profile' })
    await opener.click()
    const drawer = page.getByRole('dialog', { name: 'Your detective desk' })
    await expect(drawer).toBeVisible()
    await expect(drawer.getByText('Results are not saved')).toBeVisible()
    await expect.poll(() => drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    await expect(opener).toBeFocused()
    await opener.click()
    await drawer.getByRole('link', { name: 'Detective profile', exact: true }).click()
    await expect(drawer).toBeHidden()
  } else await page.getByRole('link', { name: 'Profile', exact: true }).click()
  await expect(page).toHaveURL(/\/profile$/)
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  await expect(page.getByRole('heading', { name: 'Your trophy case' })).toBeVisible()
  await expect(page.getByText('Your first badge is waiting')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your trophy case' })).toBeVisible()
})

test('uses pixel page artwork, keeps the 3D navbar logo, and recovers from a missing page', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'About Sharlock', exact: true }).click()
  await expect(page).toHaveURL('/about')
  await expect(page.locator('.navbar-mascot')).toHaveAttribute(
    'alt',
    /3D-style capybara mascot wearing a monocle/,
  )
  await expect(page.locator('.navbar-mascot')).toHaveCSS('image-rendering', 'auto')
  await expect(page.locator('.hero-mascot')).toHaveAttribute(
    'alt',
    /pixel-art capybara wearing a mint scarf/,
  )
  await expect(page.locator('.hero-mascot')).toHaveCSS('image-rendering', 'pixelated')
  const trigger = page.getByRole('button', { name: 'Tip from Sharlock' })
  await trigger.click()
  await expect(page.getByRole('tooltip').getByRole('img')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tooltip')).toBeHidden()
  await page.goto('/a-missing-clue')
  await expect(page.getByRole('heading', { name: 'A little off the trail?' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to town' }).click()
  await expect(page).toHaveURL('/')
  await page.getByRole('link', { name: 'Sharlock Hub home' }).click()
  await expect(page).toHaveURL('/')
})

test('fits supported breakpoints with readable pixel buildings and responsive branding', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/dashboard')
  for (const [width, height] of [
    [375, 667],
    [576, 800],
    [767, 900],
    [768, 1024],
    [992, 768],
    [1200, 900],
    [1440, 900],
    [667, 375],
  ]) {
    await page.setViewportSize({ width, height })
    const layout = await page.locator('.town-viewport').evaluate((el) => ({
      fits: document.documentElement.scrollWidth <= innerWidth,
      clipping: getComputedStyle(el).overflow,
      nativeScroll: el.scrollTop + el.scrollLeft,
      worldWidth: el.querySelector('.town-world').getBoundingClientRect().width,
      animation: getComputedStyle(el.querySelector('.building-sprite')).animationName,
    }))
    expect(layout.fits, `overflow at ${width}px`).toBe(true)
    expect(layout.worldWidth).toBe(1120)
    expect(layout.animation).toBe('none')
    expect(layout.clipping).toBe('clip')
    expect(layout.nativeScroll).toBe(0)
    await expect(page.locator('.navbar-mascot')).toBeVisible()
    if (width < 768) await expect(page.locator('.brand-title')).toBeHidden()
    else await expect(page.locator('.brand-title')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Turn on town sound' })).toBeVisible()
  }
})

test('zooms with controls and keyboard, resets the camera, and keeps buildings reachable', async ({
  page,
}) => {
  await page.goto('/dashboard')
  const map = page.getByRole('region', { name: 'Interactive town map' })
  const zoomIn = page.getByRole('button', { name: 'Zoom in', exact: true })
  const zoomOut = page.getByRole('button', { name: 'Zoom out', exact: true })
  const level = page.getByLabel('Map zoom level')
  await expect(level).toHaveText('100%')
  await expect(zoomOut).toBeDisabled()
  for (let i = 0; i < 4; i++) await zoomIn.click()
  await expect(level).toHaveText('200%')
  await expect(zoomIn).toBeDisabled()
  await map.focus()
  const limitTransform = await page.locator('.town-world').getAttribute('style')
  await page.keyboard.press('+')
  await expect(page.locator('.town-world')).toHaveAttribute('style', limitTransform)
  for (const game of gameCatalog) {
    await page.getByLabel('Jump to').selectOption(game.id)
    const heading = page.getByRole('heading', { name: game.name, exact: true })
    await expect(heading).toBeFocused()
    const button = page.getByRole('button', { name: `Explore ${game.name}`, exact: true })
    await expect
      .poll(() =>
        button.evaluate((el) => {
          const b = el.getBoundingClientRect()
          const v = el.closest('.town-viewport').getBoundingClientRect()
          return b.right > v.left && b.left < v.right && b.bottom > v.top && b.top < v.bottom
        }),
      )
      .toBe(true)
    await page.keyboard.press('Escape')
    await expect(button).toBeFocused()
  }
  await zoomOut.click()
  await expect(level).toHaveText('175%')
  await map.focus()
  await page.keyboard.press('-')
  await expect(level).toHaveText('150%')
  await page.keyboard.press('+')
  await expect(level).toHaveText('175%')
  await page.keyboard.press('0')
  await expect(level).toHaveText('100%')
  await page.keyboard.press('ArrowDown')
  await page.getByRole('button', { name: 'Reset view' }).click()
  await expect
    .poll(() =>
      map.evaluate((el) => {
        const world = el.querySelector('.town-world').getBoundingClientRect()
        const bounds = el.getBoundingClientRect()
        return Math.abs(world.top - bounds.top) + Math.abs(world.left - bounds.left)
      }),
    )
    .toBeLessThan(1)
})

test('drags without opening a building and still selects with a fresh tap or click', async ({
  page,
}, testInfo) => {
  await page.goto('/dashboard')
  const map = page.getByRole('region', { name: 'Interactive town map' })
  await map.scrollIntoViewIfNeeded()
  const building = page.getByRole('button', { name: 'Explore CLI Cyber Defender', exact: true })
  const before = await building.boundingBox()
  const start = { x: before.x + before.width / 2, y: before.y + before.height / 2 }
  const mobile = testInfo.project.name === 'mobile-chromium'
  if (mobile) {
    const session = await page.context().newCDPSession(page)
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...start, id: 1 }],
    })
    for (let step = 1; step <= 6; step++) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: start.x - step * 10, y: start.y - step * 10, id: 1 }],
      })
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await session.detach()
  } else {
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x - 60, start.y - 60, { steps: 6 })
    await page.mouse.up()
  }
  await expect.poll(async () => (await building.boundingBox()).y).toBeLessThan(before.y - 40)
  await expect(page.locator('.game-info-card')).toHaveCount(0)
  if (mobile) await building.tap()
  else await building.click()
  await expect(page.getByRole('heading', { name: 'CLI Cyber Defender', exact: true })).toBeFocused()
})

test('supports pinch zoom and wheel panning while retaining camera bounds after resize', async ({
  page,
}) => {
  await page.goto('/dashboard')
  const map = page.getByRole('region', { name: 'Interactive town map' })
  await map.scrollIntoViewIfNeeded()
  const bounds = await map.boundingBox()
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  const session = await page.context().newCDPSession(page)
  const points = (distance) => [
    { x: x - distance, y, id: 1 },
    { x: x + distance, y, id: 2 },
  ]
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(25) })
  for (const distance of [40, 60, 80, 100]) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: points(distance),
    })
    await page.evaluate(() => new Promise(requestAnimationFrame))
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await session.detach()
  await expect.poll(() => page.getByLabel('Map zoom level').textContent()).not.toBe('100%')
  await expect(page.locator('.game-info-card')).toHaveCount(0)
  await page.getByRole('button', { name: 'Reset view' }).click()
  await expect(page.getByLabel('Map zoom level')).toHaveText('100%')
  await map.hover({ position: { x: 20, y: 20 } })
  await page.mouse.wheel(5000, 5000)
  await expect
    .poll(() =>
      map.evaluate(
        (el) =>
          el.querySelector('.town-world').getBoundingClientRect().top -
          el.getBoundingClientRect().top,
      ),
    )
    .toBeLessThan(-100)
  for (const width of [1440, 375, 768]) {
    await page.setViewportSize({ width, height: 900 })
    await expect
      .poll(() =>
        map.evaluate((el) => {
          const world = el.querySelector('.town-world').getBoundingClientRect()
          const view = el.getBoundingClientRect()
          return (
            world.left <= view.left + 1 &&
            world.top <= view.top + 1 &&
            world.right >= view.right - 1 &&
            world.bottom >= view.bottom - 1 &&
            document.documentElement.scrollWidth <= innerWidth
          )
        }),
      )
      .toBe(true)
  }
  await page.goto('/profile')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.goto('/dashboard')
  await expect(page.getByLabel('Map zoom level')).toHaveText('100%')
})
