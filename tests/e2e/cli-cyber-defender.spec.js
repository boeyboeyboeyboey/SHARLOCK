import { randomBytes } from 'node:crypto'
import { test, expect } from './fixtures/auth.js'
import { seedClass, signedInPage } from './fixtures/class.js'
import { formatCommand } from '../../server/src/modules/games/cli-cyber-defender/parser.js'
import { SCENARIOS } from '../../server/src/modules/games/cli-cyber-defender/scenarios.js'
import { DEMO_SCENES } from '../../client/src/games/cli-cyber-defender/cliDefender.js'

test.beforeEach(async ({ page }) => {
  // these specs exercise the 2D pixel town
  await page.addInitScript(() => localStorage.setItem('sharlock.townMode', '2d'))
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  )
})

const commandInput = (page) => page.getByRole('textbox', { name: 'Command', exact: true })
const banner = (page) => page.getByRole('region', { name: 'Current incident' })
const hud = (page) => page.getByLabel('Game status')

async function expectedCommand(page) {
  const title = (await banner(page).getByRole('heading').textContent()).trim()
  const scenario = SCENARIOS.find((item) => item.alert.title === title)
  expect(scenario, `unknown alert ${title}`).toBeTruthy()
  return formatCommand(scenario.expected.verb, scenario.expected.target)
}

async function run(page, command) {
  await commandInput(page).fill(command)
  await commandInput(page).press('Enter')
  // run stays disabled while a command is in flight, and enter is ignored until it answers;
  // the terminal disappears entirely once the last incident opens the debrief
  await expect
    .poll(() =>
      page.evaluate(() => {
        const runButton = document.querySelector('.cli-prompt button[type="submit"]')
        return !runButton || !runButton.disabled
      }),
    )
    .toBe(true)
}

async function useMenu(page, item) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page
    .getByRole('menu', { name: 'Game menu' })
    .getByRole(/^Sound/.test(item) ? 'menuitemcheckbox' : 'menuitem', { name: item })
    .click()
}

// the context chooser comes first; personal practice is its default
async function chooseContext(page, classId) {
  const chooser = page.getByLabel('Save this run to')
  await expect(chooser).toBeEnabled()
  if (classId) await chooser.selectOption(classId)
  await page.getByRole('button', { name: 'Start the run' }).click()
}

async function startShift(page, mode, classId) {
  await page.goto('/games/cli-cyber-defender')
  await chooseContext(page, classId)
  if (mode === 'practice') await page.getByRole('button', { name: 'Practice (no timer)' }).click()
  else {
    await page.getByRole('button', { name: 'Start game' }).click()
    await page
      .getByRole('dialog', { name: 'Ready to play?' })
      .getByRole('button', { name: 'Start', exact: true })
      .click()
  }
  await expect(commandInput(page)).toBeFocused()
}

test('asks before a timed shift and starts nothing on cancel', async ({ page }) => {
  let started = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/games/cli-cyber-defender/runs'))
      started += 1
  })
  await page.goto('/games/cli-cyber-defender')
  await chooseContext(page)
  await page.getByRole('button', { name: 'Start game' }).click()
  const dialog = page.getByRole('dialog', { name: 'Ready to play?' })
  await expect(dialog).toContainText('saved to your account')
  await expect(dialog.getByRole('button', { name: 'Start', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: 'Start game' }).click()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Shift briefing' })).toBeVisible()
  expect(started).toBe(0)
})

test('swaps back to town for a game menu that confirms before leaving', async ({ page }) => {
  await startShift(page, 'practice')
  await expect(page.getByRole('link', { name: 'Back to town' })).toHaveCount(0)
  const menuButton = page.getByRole('button', { name: 'Menu', exact: true })
  const menu = page.getByRole('menu', { name: 'Game menu' })
  const leave = page.getByRole('dialog', { name: 'Leave this game?' })
  await menuButton.click()
  await expect(menuButton).toHaveAttribute('aria-expanded', 'true')
  await expect(menu.getByRole('menuitem', { name: 'Pause' })).toHaveCount(0)
  await menu.getByRole('menuitem', { name: 'Leave game' }).click()
  await expect(leave).toContainText("won't be saved")
  await leave.getByRole('button', { name: 'Keep playing' }).click()
  await expect(leave).toBeHidden()
  await expect(commandInput(page)).toBeVisible()
  await menuButton.click()
  await menu.getByRole('menuitem', { name: 'Leave game' }).click()
  await leave.getByRole('button', { name: 'Leave game' }).click()
  await expect(page.getByRole('heading', { name: 'Shift briefing' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to town' })).toBeVisible()
})

test('pauses and resumes a timed game from the menu with the keyboard', async ({ page }) => {
  await startShift(page, 'timed')
  const menuButton = page.getByRole('button', { name: 'Menu', exact: true })
  const menu = page.getByRole('menu', { name: 'Game menu' })
  await menuButton.click()
  await expect(menu.getByRole('menuitemcheckbox', { name: 'Sound off' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitem', { name: 'Pause' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitem', { name: 'Leave game' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitemcheckbox', { name: 'Sound off' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(menuButton).toBeFocused()
  await menuButton.click()
  await menu.getByRole('menuitem', { name: 'Pause' }).click()
  await expect(page.getByRole('heading', { name: 'Game paused' })).toBeVisible()
  await expect(banner(page)).toHaveCount(0)
  await menuButton.click()
  await menu.getByRole('menuitem', { name: 'Resume' }).click()
  await expect(commandInput(page)).toBeFocused()
  await expect(page.getByRole('log', { name: 'Terminal output' })).toContainText('Game resumed.')
})

test('pauses a timed game while deciding to leave and resumes on stay', async ({ page }) => {
  await startShift(page, 'timed')
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Leave game' }).click()
  const leave = page.getByRole('dialog', { name: 'Leave this game?' })
  await expect(leave).toBeVisible()
  await expect(page.locator('.cli-paused')).toHaveCount(1)
  await leave.getByRole('button', { name: 'Keep playing' }).click()
  await expect(page.locator('.cli-paused')).toHaveCount(0)
  await expect(commandInput(page)).toBeFocused()
  await expect(page.getByRole('log', { name: 'Terminal output' })).toContainText('Game resumed.')
})

test('animates a briefing demo that never spoils a real shift', async ({ page }) => {
  const answers = new Set(
    SCENARIOS.map((item) => formatCommand(item.expected.verb, item.expected.target)),
  )
  for (const scene of DEMO_SCENES) expect(answers.has(scene.command)).toBe(false)
  await page.goto('/games/cli-cyber-defender')
  await chooseContext(page)
  const demo = page.locator('.cli-demo-window')
  await expect(demo).toContainText(DEMO_SCENES[0].alert)
  await expect(demo.locator('.cli-demo-ok')).toContainText(DEMO_SCENES[0].result)
  await expect(demo).toContainText(DEMO_SCENES[1].alert, { timeout: 8000 })
})

test('plays a perfect practice shift to 2,100 and replays', async ({ page }) => {
  await startShift(page, 'practice')
  await expect(hud(page)).toContainText('untimed')
  for (let handled = 1; handled <= 8; handled += 1) {
    await run(page, await expectedCommand(page))
    if (handled < 8) await expect(hud(page)).toContainText(`${handled + 1} / 8`)
  }
  const debrief = page.getByRole('heading', { name: 'Shift debrief' })
  await expect(debrief).toBeFocused()
  await expect(page.getByText('2,100 / 2,100 points')).toBeVisible()
  await expect(page.locator('.cli-outcome-correct')).toHaveCount(8)
  await expect(page.getByText('Result saved to your account.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to town' })).toHaveCount(1)
  await expect(page.getByTestId('cli-next-run')).toHaveText(
    'Next run: Personal practice · Practice',
  )
  await page.getByRole('button', { name: 'Change' }).click()
  await page.getByRole('group', { name: 'Mode' }).getByLabel('Timed').check()
  await expect(page.getByTestId('cli-next-run')).toHaveText('Next run: Personal practice · Timed')
  await page.getByRole('button', { name: 'Play again' }).click()
  await expect(page.getByRole('dialog', { name: 'Ready to play?' })).toHaveCount(0)
  await expect(commandInput(page)).toBeFocused()
  await expect(hud(page)).not.toContainText('untimed')
  await expect(hud(page).getByText(/^\d+\.\ds$/)).toBeVisible()
  await expect(hud(page)).toContainText('1 / 8')
  await expect(hud(page)).toContainText('0')
  await expect(page.locator('.cli-flash')).toHaveCount(0)
})

test('keeps the incident open on a typo, closes it on a wrong target', async ({ page }) => {
  await startShift(page, 'practice')
  const terminal = page.getByRole('log', { name: 'Terminal output' })
  await run(page, 'blok ip 192.0.2.1')
  await expect(terminal).toContainText('Command not recognised')
  await expect(hud(page)).toContainText('1 / 8')
  await run(page, await expectedCommand(page))
  await expect(hud(page)).toContainText('2 / 8')
  await run(page, 'isolate host not-the-right-host')
  await expect(terminal).toContainText('[FAIL] isolate host not-the-right-host')
  await expect(hud(page)).toContainText('3 / 8')
  await expect(hud(page)).toContainText('next ×1')
  await run(page, 'help')
  await expect(terminal).toContainText('local, never sent')
  await useMenu(page, 'End practice')
  await expect(page.getByText('100 / 2,100 points')).toBeVisible()
  await expect(page.locator('.cli-outcome-wrong')).toHaveCount(1)
  await expect(page.locator('.cli-outcome-skipped')).toHaveCount(6)
})

test('scores a timed incident against the server window', async ({ page }) => {
  await startShift(page, 'timed')
  await expect(banner(page).getByText(/You have \d+ seconds for this incident/)).toBeAttached()
  await expect(hud(page).getByText(/^\d+\.\ds$/)).toBeVisible()
  await run(page, await expectedCommand(page))
  await expect(page.getByRole('log', { name: 'Terminal output' })).toContainText('+100 (streak 1)')
  await expect(hud(page)).toContainText('100')
})

async function setHidden(page, hidden) {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'hidden', { value, configurable: true })
    Object.defineProperty(document, 'visibilityState', {
      value: value ? 'hidden' : 'visible',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))
  }, hidden)
}

test('auto-pauses a timed shift when the tab is hidden', async ({ page }) => {
  await startShift(page, 'timed')
  const command = await expectedCommand(page)
  await setHidden(page, true)
  await setHidden(page, false)
  const resume = page.getByRole('button', { name: 'Resume game' })
  await expect(page.getByRole('heading', { name: 'Game paused' })).toBeVisible()
  await expect(resume).toBeFocused()
  await expect(banner(page)).toHaveCount(0)
  await expect(commandInput(page)).toHaveCount(0)
  await expect(hud(page)).toContainText('1 / 8')
  await resume.click()
  await expect(commandInput(page)).toBeFocused()
  await expect(page.getByRole('log', { name: 'Terminal output' })).toContainText('Challenge 1 of 8')
  await expect(page.getByRole('log', { name: 'Terminal output' })).toContainText('Game resumed.')
  await run(page, command)
  await expect(page.getByRole('log', { name: 'Terminal output' })).toContainText('+100 (streak 1)')
})

test('never pauses untimed practice', async ({ page }) => {
  await startShift(page, 'practice')
  await setHidden(page, true)
  await setHidden(page, false)
  await expect(page.getByRole('heading', { name: 'Game paused' })).toHaveCount(0)
  await expect(commandInput(page)).toBeVisible()
})

test('lets touch users insert command templates and recall history', async ({ page }, testInfo) => {
  await startShift(page, 'practice')
  const command = await expectedCommand(page)
  const [verb, noun, target] = command.split(' ')
  const template = page.getByRole('button', { name: new RegExp(`^Insert ${verb} ${noun}`) })
  if (testInfo.project.name === 'mobile-chromium') await template.tap()
  else await template.click()
  await expect(commandInput(page)).toHaveValue(`${verb} ${noun} `)
  await expect(commandInput(page)).toBeFocused()
  await commandInput(page).pressSequentially(target)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(hud(page)).toContainText('2 / 8')
  await commandInput(page).press('ArrowUp')
  await expect(commandInput(page)).toHaveValue(command)
})

test('taps an alert name to complete a command and explains the outcome', async ({
  page,
}, testInfo) => {
  await startShift(page, 'practice')
  const command = await expectedCommand(page)
  const [verb, noun, target] = command.split(' ')
  await page.getByRole('button', { name: new RegExp(`^Insert ${verb} ${noun}`) }).click()
  await banner(page)
    .getByRole('button', { name: `Use ${target} as the target` })
    .first()
    .click()
  await expect(commandInput(page)).toHaveValue(command)
  await expect(commandInput(page)).toBeFocused()
  await commandInput(page).press('Enter')
  const log = page.getByRole('log', { name: 'Terminal output' })
  await expect(log).toContainText('why:')
  await expect(log).toContainText('Containment')
  // the side note repeats the terminal explanation, so it only shows on wide screens
  const review = page.getByRole('region', { name: 'Last incident' })
  if (testInfo.project.name === 'desktop-chromium') {
    await expect(review).toContainText('OK')
    await expect(review).toContainText('Containment')
  } else await expect(review).toBeHidden()
})

test('gives one practice hint per incident and marks it in the debrief', async ({ page }) => {
  await startShift(page, 'practice')
  const hint = page.getByRole('button', { name: 'Hint', exact: true })
  await hint.click()
  await expect(banner(page).locator('.cli-hint-line')).toHaveCount(1)
  await expect(banner(page).locator('.cli-hint-line')).toContainText('hint')
  await expect(hint).toBeDisabled()
  await useMenu(page, 'End practice')
  await expect(page.getByText('hint used')).toHaveCount(1)
})

test('offers no hint in a timed game and keeps sound off until asked', async ({ page }) => {
  await startShift(page, 'timed')
  await expect(page.getByRole('button', { name: 'Hint', exact: true })).toHaveCount(0)
  await expect(page.getByText('Practice', { exact: true })).toHaveCount(0)
  const menuButton = page.getByRole('button', { name: 'Menu', exact: true })
  const sound = page.getByRole('menuitemcheckbox', { name: /^Sound (on|off)$/ })
  await menuButton.click()
  await expect(sound).toHaveText('Sound off')
  await expect(sound).toHaveAttribute('aria-checked', 'false')
  await sound.click()
  await menuButton.click()
  await expect(sound).toHaveText('Sound on')
  await expect(sound).toHaveAttribute('aria-checked', 'true')
  await sound.click()
  await menuButton.click()
  await expect(sound).toHaveText('Sound off')
})

test('plays real web audio beeps once sound is switched on', async ({ page }) => {
  // record what the real audio context does without replacing it
  await page.addInitScript(() => {
    const Native = window.AudioContext
    window.__cliAudio = { contexts: [], started: 0 }
    window.AudioContext = class extends Native {
      constructor(...args) {
        super(...args)
        window.__cliAudio.contexts.push(this)
      }
      createOscillator() {
        const oscillator = super.createOscillator()
        const start = oscillator.start.bind(oscillator)
        oscillator.start = (...times) => {
          window.__cliAudio.started += 1
          return start(...times)
        }
        return oscillator
      }
    }
  })
  await startShift(page, 'practice')
  const audio = () =>
    page.evaluate(() => ({
      count: window.__cliAudio.contexts.length,
      state: window.__cliAudio.contexts[0]?.state ?? null,
      started: window.__cliAudio.started,
    }))
  expect((await audio()).count).toBe(0)
  await useMenu(page, 'Sound off')
  await expect.poll(async () => (await audio()).state).toBe('running')
  await expect.poll(async () => (await audio()).started).toBeGreaterThanOrEqual(2)
  const before = (await audio()).started
  await run(page, await expectedCommand(page))
  await expect.poll(async () => (await audio()).started).toBeGreaterThan(before)
  await useMenu(page, 'Sound on')
  await expect.poll(async () => (await audio()).state).toBe('suspended')
})

test('drops the flash and shake effects for reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await startShift(page, 'practice')
  await run(page, 'isolate host not-the-right-host')
  await expect(page.getByRole('log', { name: 'Terminal output' })).toContainText('[FAIL]')
  await expect(page.locator('.cli-flash')).toBeHidden()
  const animation = await page
    .locator('.cli-line')
    .first()
    .evaluate((element) => getComputedStyle(element).animationName)
  expect(animation).toBe('none')
})

test('keeps the command prompt in place as the log fills up', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'wide two-column layout only')
  await startShift(page, 'practice')
  // position on the page, so scrolling the window cannot hide a layout shift
  const pageY = () =>
    commandInput(page).evaluate((input) => input.getBoundingClientRect().top + window.scrollY)
  await run(page, 'blok ip 192.0.2.1')
  await expect(page.getByRole('log', { name: 'Terminal output' })).toContainText('not recognised')
  const before = await pageY()
  for (let attempt = 2; attempt < 14; attempt += 1) await run(page, `blok ip 192.0.2.${attempt}`)
  await run(page, 'help')
  await expect(page.getByRole('log', { name: 'Terminal output' })).toContainText(
    'local, never sent',
  )
  expect(Math.abs((await pageY()) - before)).toBeLessThanOrEqual(1)
  await expect(commandInput(page)).toBeInViewport()
})

test('fits the command template buttons at every width', async ({ page }) => {
  await startShift(page, 'practice')
  for (const width of [375, 576, 768, 992, 1200, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    const overflowing = await page
      .locator('.cli-template')
      .evaluateAll((buttons) =>
        buttons
          .filter((button) => button.scrollWidth > button.clientWidth + 1)
          .map((button) => button.textContent.trim()),
      )
    expect(overflowing, `template overflow at ${width}px`).toEqual([])
  }
})

test('keeps the console size while a timed game is paused', async ({ page }) => {
  await startShift(page, 'timed')
  const stage = page.locator('.cli-stage')
  const before = await stage.boundingBox()
  await useMenu(page, 'Pause')
  await expect(page.getByRole('heading', { name: 'Game paused' })).toBeVisible()
  const during = await stage.boundingBox()
  expect(Math.abs(during.height - before.height)).toBeLessThanOrEqual(2)
  await expect(banner(page)).toHaveCount(0)
})

test('enters from the town card and leaves no styles behind', async ({ page }) => {
  await page.goto('/')
  const before = await page.evaluate(() => {
    const style = getComputedStyle(document.body)
    return { font: style.fontFamily, background: style.backgroundColor }
  })
  await page.getByLabel('Jump to').selectOption('cli-cyber-defender')
  const card = page.getByRole('region', { name: 'CLI Cyber Defender', exact: true })
  await card.getByRole('link', { name: 'Enter activity' }).click()
  await expect(page).toHaveURL('/games/cli-cyber-defender')
  await expect(page.getByRole('heading', { name: 'CLI Cyber Defender', level: 1 })).toBeVisible()
  await page.getByRole('link', { name: 'Back to town' }).click()
  await expect(page).toHaveURL('/')
  const after = await page.evaluate(() => {
    const style = getComputedStyle(document.body)
    return { font: style.fontFamily, background: style.backgroundColor }
  })
  expect(after).toEqual(before)
  await page.goto('/about')
  await expect(page.locator('.cli-game')).toHaveCount(0)
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain(
    'Pixelify',
  )
})

test('fits every supported width without page overflow', async ({ page }) => {
  await startShift(page, 'practice')
  for (const width of [375, 576, 768, 992, 1200, 1440]) {
    await page.setViewportSize({ width, height: 800 })
    await expect(commandInput(page)).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, `overflow at ${width}px`).toBeLessThanOrEqual(0)
  }
  await page.setViewportSize({ width: 667, height: 375 })
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeVisible()
})

test('a class student saves a timed shift and appears on the timed leaderboard', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000)
  const seeded = await seedClass(randomBytes(4).toString('hex'))
  const { context, page } = await signedInPage(browser, baseURL, seeded.studentA)
  try {
    await startShift(page, 'timed', seeded.classId)
    for (let handled = 1; handled <= 8; handled += 1) await run(page, await expectedCommand(page))
    await expect(page.getByRole('heading', { name: 'Shift debrief' })).toBeFocused()
    await expect(page.getByText('2,100 / 2,100 points')).toBeVisible()
    await expect(page.getByText('Result saved to your account.')).toBeVisible()

    await page.goto(`/leaderboard?game=cli-cyber-defender&class=${seeded.classId}`)
    await expect(page.getByRole('heading', { level: 2, name: /CLI Cyber Defender/ })).toBeVisible()
    await expect(page.getByText('Timed runs')).toBeVisible()
    const own = page.getByRole('row', { name: new RegExp(seeded.studentA.username) })
    await expect(own).toHaveCount(1)
    await expect(own).toContainText('(you)')
  } finally {
    await context.close()
  }
})
