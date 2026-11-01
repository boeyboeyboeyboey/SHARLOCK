import { randomBytes } from 'node:crypto'
import { test, expect } from './fixtures/auth.js'
import { seedClass, signedInPage } from './fixtures/class.js'
import { formatCommand } from '../../server/src/modules/games/cli-cyber-defender/parser.js'
import { SCENARIOS } from '../../server/src/modules/games/cli-cyber-defender/scenarios.js'
import { DEMO_SCENES } from '../../client/src/games/cli-cyber-defender/cliDefender.js'
import { jumpToBuilding } from './fixtures/town.js'

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
const outcomes = (page, outcome) =>
  page.locator(`[data-testid="cli-debrief-outcome"][data-outcome="${outcome}"]`)
const testInfoOf = () => test.info()

// on a touch screen the prompt stays unfocused, so no keyboard rises over the alert
async function expectPromptFocus(page, testInfo) {
  if (testInfo.project.name === 'mobile-chromium')
    await expect(commandInput(page)).not.toBeFocused()
  else await expect(commandInput(page)).toBeFocused()
}

async function scenarioOnScreen(page) {
  const title = (await banner(page).getByRole('heading').textContent()).trim()
  const scenario = SCENARIOS.find((item) => item.alert.title === title)
  expect(scenario, `unknown alert ${title}`).toBeTruthy()
  return scenario
}

// the ordered commands that resolve the open incident, or dismiss for a false alarm
async function stepsFor(page) {
  const scenario = await scenarioOnScreen(page)
  return scenario.steps.length
    ? scenario.steps.map(({ verb, target }) => formatCommand(verb, target))
    : ['dismiss']
}

async function expectedCommand(page) {
  return (await stepsFor(page))[0]
}

async function solve(page) {
  for (const command of await stepsFor(page)) await run(page, command)
}

// solves incidents until the open one matches, leaving it untouched
async function advanceTo(page, predicate) {
  for (let guard = 0; guard < 8; guard += 1) {
    if (predicate(await scenarioOnScreen(page))) return
    await solve(page)
  }
  throw new Error('no matching incident in this shift')
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
  await page.getByRole('button', { name: 'Options', exact: true }).click()
  await page
    .getByRole('menu', { name: 'Game options' })
    .getByRole(/^Sound/.test(item) ? 'menuitemcheckbox' : 'menuitem', { name: item })
    .click()
}

// the context chooser comes first; these students have no class, so personal practice is selected
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
  await expect(commandInput(page)).toBeVisible()
  await expectPromptFocus(page, testInfoOf())
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
  const menuButton = page.getByRole('button', { name: 'Options', exact: true })
  const menu = page.getByRole('menu', { name: 'Game options' })
  const leave = page.getByRole('dialog', { name: 'Leave this game?' })
  await menuButton.click()
  await expect(menuButton).toHaveAttribute('aria-expanded', 'true')
  await expect(menu.getByRole('menuitem', { name: 'Pause' })).toHaveCount(0)
  await menu.getByRole('menuitem', { name: 'Quit to briefing' }).click()
  await expect(leave).toContainText("won't be saved")
  // enter on the opening focus must not throw the run away
  await expect(leave.getByRole('button', { name: 'Keep playing' })).toBeFocused()
  await leave.getByRole('button', { name: 'Keep playing' }).click()
  await expect(leave).toBeHidden()
  await expect(commandInput(page)).toBeVisible()
  await expectPromptFocus(page, testInfoOf())
  await menuButton.click()
  await menu.getByRole('menuitem', { name: 'Quit to briefing' }).click()
  await leave.getByRole('button', { name: 'Leave game' }).click()
  await expect(page.getByRole('heading', { name: 'Shift briefing' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to town' })).toBeVisible()
})

test('pauses and resumes a timed game from the menu with the keyboard', async ({ page }) => {
  await startShift(page, 'timed')
  const menuButton = page.getByRole('button', { name: 'Options', exact: true })
  const menu = page.getByRole('menu', { name: 'Game options' })
  await menuButton.click()
  await expect(menu.getByRole('menuitemcheckbox', { name: 'Sound off' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitem', { name: 'Pause' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitem', { name: 'Quit to briefing' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitemcheckbox', { name: 'Sound off' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(menuButton).toBeFocused()
  await menuButton.click()
  await menu.getByRole('menuitem', { name: 'Pause' }).click()
  await expect(page.getByRole('heading', { name: 'Game paused' })).toBeVisible()
  await expect(banner(page)).toHaveCount(0)
  await expect(page.getByTestId('cli-pause-left')).toContainText('Pauses left in this game: 1')
  await menuButton.click()
  await menu.getByRole('menuitem', { name: 'Resume' }).click()
  await expectPromptFocus(page, testInfoOf())
  await expect(page.getByRole('log', { name: 'Terminal output' })).toContainText('Game resumed.')
})

test('pauses a timed game while deciding to leave and resumes on stay', async ({ page }) => {
  await startShift(page, 'timed')
  await page.getByRole('button', { name: 'Options', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Quit to briefing' }).click()
  const leave = page.getByRole('dialog', { name: 'Leave this game?' })
  await expect(leave).toBeVisible()
  await expect(page.getByTestId('cli-pause-left')).toHaveCount(1)
  await leave.getByRole('button', { name: 'Keep playing' }).click()
  await expect(page.getByTestId('cli-pause-left')).toHaveCount(0)
  await expectPromptFocus(page, testInfoOf())
  await expect(page.getByRole('log', { name: 'Terminal output' })).toContainText('Game resumed.')
})

test('animates a briefing demo that never spoils a real shift', async ({ page }) => {
  const answers = new Set(
    SCENARIOS.flatMap((item) => item.steps.map(({ verb, target }) => formatCommand(verb, target))),
  )
  const lookupKeys = new Set(SCENARIOS.flatMap((item) => Object.keys(item.lookups)))
  for (const scene of DEMO_SCENES) {
    expect(answers.has(scene.command)).toBe(false)
    expect(lookupKeys.has(scene.lookup)).toBe(false)
  }
  await page.goto('/games/cli-cyber-defender')
  await chooseContext(page)
  const demo = page.getByTestId('cli-demo-window')
  // the loop pauses off-screen, and on a phone the start controls now sit above it
  await demo.scrollIntoViewIfNeeded()
  await expect(demo).toContainText(DEMO_SCENES[0].alert)
  await expect(demo.getByTestId('cli-demo-found')).toContainText(DEMO_SCENES[0].found, {
    timeout: 8000,
  })
  await expect(demo.getByTestId('cli-demo-ok')).toContainText(DEMO_SCENES[0].result, {
    timeout: 10_000,
  })
  await expect(demo).toContainText(DEMO_SCENES[1].alert, { timeout: 10_000 })
})

test('plays a perfect practice shift to 2,700 and replays', async ({ page }) => {
  await startShift(page, 'practice')
  await expect(hud(page)).toContainText('untimed')
  for (let handled = 1; handled <= 8; handled += 1) {
    await solve(page)
    if (handled < 8) await expect(hud(page)).toContainText(`${handled + 1} / 8`)
  }
  const debrief = page.getByRole('heading', { name: 'Shift debrief' })
  await expect(debrief).toBeFocused()
  await expect(page.getByText('2,700 / 2,700 points')).toBeVisible()
  await expect(outcomes(page, 'correct')).toHaveCount(8)
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
  await expectPromptFocus(page, testInfoOf())
  await expect(hud(page)).not.toContainText('untimed')
  await expect(hud(page).getByText(/^\d+\.\ds$/)).toBeVisible()
  await expect(hud(page)).toContainText('1 / 8')
  await expect(hud(page)).toContainText('0')
  await expect(page.getByTestId('cli-flash')).toHaveCount(0)
})

test('keeps the incident open on a typo, closes it on a wrong target', async ({ page }) => {
  await startShift(page, 'practice')
  const terminal = page.getByRole('log', { name: 'Terminal output' })
  await run(page, 'blok ip 192.0.2.1')
  await expect(terminal).toContainText('Command not recognised')
  await expect(hud(page)).toContainText('1 / 8')
  await solve(page)
  await expect(hud(page)).toContainText('2 / 8')
  await run(page, 'isolate host not-the-right-host')
  await expect(terminal).toContainText('[FAIL] isolate host not-the-right-host')
  await expect(hud(page)).toContainText('3 / 8')
  await expect(hud(page)).toContainText('next ×1')
  await run(page, 'help')
  await expect(terminal).toContainText('local, never sent')
  await useMenu(page, 'End practice')
  await expect(page.getByText('100 / 2,700 points')).toBeVisible()
  await expect(outcomes(page, 'wrong')).toHaveCount(1)
  // only the reached incidents are reviewed: two settled and the one on screen, unanswered
  await expect(page.getByText('Practice ended after challenge 3 of 8.')).toBeVisible()
  await expect(page.getByTestId('cli-debrief-item')).toHaveCount(3)
  await expect(page.getByText('NOT ANSWERED')).toHaveCount(1)
  // an early end is still saved
  await expect(page.getByText('Result saved to your account.')).toBeVisible()
})

test('scores a timed incident against the server window', async ({ page }) => {
  await startShift(page, 'timed')
  await expect(banner(page).getByText(/You have \d+ seconds for this incident/)).toBeAttached()
  await expect(hud(page).getByText(/^\d+\.\ds$/)).toBeVisible()
  await run(page, await expectedCommand(page))
  await expect(page.getByRole('log', { name: 'Terminal output' })).toContainText('+100 (streak 1)')
  await expect(hud(page)).toContainText('100')
})

test('investigates with lookups before acting, limited to six per incident', async ({ page }) => {
  await startShift(page, 'practice')
  const scenario = await scenarioOnScreen(page)
  const log = page.getByRole('log', { name: 'Terminal output' })
  const [key, lines] = Object.entries(scenario.lookups)[0]
  await run(page, key)
  await expect(log).toContainText(`[${key}] (1/6)`)
  await expect(log).toContainText(lines[0])
  await expect(banner(page)).toContainText('Lookups used: 1 of 6')
  await expect(hud(page)).toContainText('0')
  for (let index = 2; index <= 6; index += 1) await run(page, `logs lab-${index}`)
  await expect(banner(page)).toContainText('Lookups used: 6 of 6')
  await run(page, 'logs lab-9')
  await expect(log).toContainText('No lookups left for this incident')
  await solve(page)
  await expect(hud(page)).toContainText('2 / 8')
  await expect(banner(page)).toContainText('Lookups used: 0 of 6')
})

test('dismisses a false alarm and counts containing it as a mistake', async ({ page }) => {
  await startShift(page, 'practice')
  await advanceTo(page, (scenario) => scenario.decoy)
  const log = page.getByRole('log', { name: 'Terminal output' })
  await run(page, 'block ip 192.0.2.250')
  await expect(log).toContainText('[FAIL] block ip 192.0.2.250')
  await expect(log).toContainText('false alarm')
  await expect(
    page.getByRole('button', { name: 'Insert dismiss: Close a false alarm' }),
  ).toBeVisible()
})

test('dismissing a real incident is a mistake and a false alarm scores', async ({ page }) => {
  await startShift(page, 'practice')
  await advanceTo(page, (scenario) => !scenario.decoy)
  await run(page, 'dismiss')
  await expect(page.getByRole('log', { name: 'Terminal output' })).toContainText('[FAIL] dismiss')
  await advanceTo(page, (scenario) => scenario.decoy)
  await run(page, 'dismiss')
  await expect(page.getByRole('log', { name: 'Terminal output' })).toContainText('Alert dismissed')
})

test('keeps a two-step incident open after the first action', async ({ page }) => {
  await startShift(page, 'practice')
  await advanceTo(page, (scenario) => scenario.steps.length === 2)
  const [first, second] = await stepsFor(page)
  const log = page.getByRole('log', { name: 'Terminal output' })
  await run(page, second)
  await expect(log).toContainText('still open')
  await run(page, first)
  await expect(log).toContainText('[STEP]')
  await expect(banner(page)).toContainText('Step 1 done, the incident is still open')
  await run(page, second)
  // the last incident of a shift goes straight to the debrief
  await expect(
    log
      .getByText('[ OK ]')
      .last()
      .or(page.getByRole('heading', { name: 'Shift debrief' })),
  ).toBeVisible()
})

test('cuts five seconds and cues it in a timed game only', async ({ page }) => {
  await startShift(page, 'timed')
  await run(page, 'isolate host not-the-right-host')
  await expect(hud(page).getByTestId('cli-penalty-cue')).toContainText('-5 s')
  await expect(page.getByRole('log', { name: 'Terminal output' })).toContainText(
    '[-5 s] 5 seconds were cut from the clock.',
  )
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
  await expectPromptFocus(page, testInfoOf())
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
  await advanceTo(page, (scenario) => !scenario.decoy)
  const command = await expectedCommand(page)
  const [verb, noun, target] = command.split(' ')
  const template = page.getByRole('button', { name: new RegExp(`^Insert ${verb} ${noun}`) })
  if (testInfo.project.name === 'mobile-chromium') await template.tap()
  else await template.click()
  await expect(commandInput(page)).toHaveValue(`${verb} ${noun} `)
  await expectPromptFocus(page, testInfo)
  const challenge = Number(/(\d) \/ 8/.exec(await hud(page).textContent())[1])
  // a player taps the input to type; the caret goes after the template
  await commandInput(page).evaluate((input) => {
    input.focus()
    input.setSelectionRange(input.value.length, input.value.length)
  })
  await commandInput(page).pressSequentially(target)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(hud(page)).toContainText(`${challenge + 1} / 8`)
  await commandInput(page).press('ArrowUp')
  await expect(commandInput(page)).toHaveValue(command)
})

test('taps an alert name to complete a command and explains the outcome', async ({
  page,
}, testInfo) => {
  await startShift(page, 'practice')
  await advanceTo(page, (scenario) => !scenario.decoy)
  const command = await expectedCommand(page)
  const [verb, noun, target] = command.split(' ')
  await page.getByRole('button', { name: new RegExp(`^Insert ${verb} ${noun}`) }).click()
  await banner(page)
    .getByRole('button', { name: `Use ${target} as the target` })
    .first()
    .click()
  await expect(commandInput(page)).toHaveValue(command)
  await expectPromptFocus(page, testInfo)
  await commandInput(page).press('Enter')
  // a two-step incident would need its second action before the review shows
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

test('gives two practice hint tiers per incident and marks it in the debrief', async ({ page }) => {
  await startShift(page, 'practice')
  await page.getByRole('button', { name: 'Hint', exact: true }).click()
  await expect(banner(page).getByTestId('cli-hint-line')).toHaveCount(1)
  await expect(banner(page).getByTestId('cli-hint-line')).toContainText('hint')
  await page.getByRole('button', { name: 'Hint 2', exact: true }).click()
  await expect(banner(page).getByTestId('cli-hint-concept')).toBeVisible()
  await expect(page.getByRole('button', { name: 'No more hints for this incident' })).toBeDisabled()
  await useMenu(page, 'End practice')
  await expect(page.getByText('hint used')).toHaveCount(1)
})

test('offers no hint in a timed game and keeps sound off until asked', async ({ page }) => {
  await startShift(page, 'timed')
  await expect(page.getByRole('button', { name: 'Hint', exact: true })).toHaveCount(0)
  await expect(page.getByText('Practice', { exact: true })).toHaveCount(0)
  const menuButton = page.getByRole('button', { name: 'Options', exact: true })
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
  await expect(page.getByTestId('cli-flash')).toBeHidden()
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

test('keeps the alert, prompt and command buttons on screen after several incidents', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'a phone scrolls as one page instead')
  await startShift(page, 'practice')
  for (let incident = 0; incident < 3; incident += 1) await solve(page)
  for (let attempt = 1; attempt < 10; attempt += 1) await run(page, `blok ip 192.0.2.${attempt}`)
  await expect(page.getByRole('log', { name: 'Terminal output' })).toContainText('not recognised')

  // the project's own size, plus a stacked laptop width and a short laptop window on desktop
  const sizes =
    testInfo.project.name === 'desktop-chromium'
      ? [
          null,
          { width: 1200, height: 800 },
          { width: 1024, height: 768 },
          { width: 1366, height: 650 },
        ]
      : [null]
  for (const size of sizes) {
    if (size) await page.setViewportSize(size)
    const label = size ? `${size.width}x${size.height}` : testInfo.project.name
    await expect(banner(page).getByRole('heading'), `alert at ${label}`).toBeInViewport()
    await expect(commandInput(page), `prompt at ${label}`).toBeInViewport()
    await expect(
      page.getByRole('button', { name: 'Run', exact: true }),
      `run at ${label}`,
    ).toBeInViewport()
    await expect(page.getByRole('button', { name: 'Hint' }), `hint at ${label}`).toBeInViewport()
    const templates = page.getByRole('button', { name: /^Insert / })
    await expect(templates).toHaveCount(6)
    for (const template of await templates.all())
      await expect(template, `command button at ${label}`).toBeInViewport()
  }
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
  const stage = page.getByTestId('cli-stage')
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
  await jumpToBuilding(page, 'cli-cyber-defender')
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
    'DotGothic16',
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

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('the briefing shows Start game and Practice without scrolling', async ({ page }) => {
    await page.goto('/games/cli-cyber-defender')
    await chooseContext(page)
    await expect(page.getByRole('button', { name: 'Start game' })).toBeInViewport()
    await expect(page.getByRole('button', { name: 'Practice (no timer)' })).toBeInViewport()
  })

  test('the alert is read whole by scrolling the page, with every name tappable', async ({
    page,
  }, testInfo) => {
    await startShift(page, 'practice')
    await page.screenshot({
      path: testInfo.outputPath('cli-phone-375x667.png'),
      animations: 'disabled',
    })
    for (let incident = 0; incident < 8; incident += 1) {
      const names = banner(page).getByRole('button', { name: /^Use .* as the target$/ })
      for (const name of await names.all()) {
        await name.scrollIntoViewIfNeeded()
        await expect(name, 'each name can be seen').toBeInViewport()
        // the top element at its centre is the name itself, not something drawn over it
        const hit = await name.evaluate((element) => {
          const box = element.getBoundingClientRect()
          const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
          return element.contains(top)
        })
        expect(hit, 'each name can be tapped').toBe(true)
      }
      const logHeight = await page
        .getByRole('log', { name: 'Terminal output' })
        .evaluate((element) => element.clientHeight)
      expect(logHeight, 'the log shows more than two lines').toBeGreaterThan(140)
      // the alert box no longer scrolls inside itself
      const inner = await banner(page).evaluate((element) => {
        const column = element.closest('[class*="alert-col"]')
        return column.scrollHeight - column.clientHeight
      })
      expect(inner).toBeLessThanOrEqual(1)
      if (incident < 7) {
        await solve(page)
        await expect(banner(page).getByRole('heading')).toBeInViewport()
        await expect(hud(page).getByText(`${incident + 2} / 8`)).toBeInViewport()
      }
    }
  })

  test('the timed clock stays on screen while the page scrolls', async ({ page }) => {
    await startShift(page, 'timed')
    await page.getByRole('button', { name: 'Run', exact: true }).scrollIntoViewIfNeeded()
    await expect(hud(page).getByText(/^\d+\.\ds$/)).toBeInViewport()
  })
})

test('the debrief prints each command of a multi-step incident on its own line', async ({
  page,
}) => {
  await startShift(page, 'practice')
  await advanceTo(page, (scenario) => scenario.steps.length === 2)
  const [first, second] = await stepsFor(page)
  await run(page, first)
  await run(page, second)
  await useMenu(page, 'End practice')
  const item = page.getByTestId('cli-debrief-item').filter({ hasText: second }).first()
  if (!(await item.locator('details').getAttribute('open'))) await item.locator('summary').click()
  const correct = item.getByRole('definition').filter({ hasText: second }).last()
  const lines = correct.getByRole('listitem')
  await expect(lines).toHaveCount(2)
  const [top, bottom] = await lines.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().top),
  )
  expect(bottom).toBeGreaterThan(top)
})

test('browser back from a running game asks before leaving', async ({ page }) => {
  await page.goto('/about')
  // an in-app move, so back stays inside the router instead of reloading the page
  await page.evaluate(async () => {
    const router = document.querySelector('#app').__vue_app__.config.globalProperties.$router
    await router.isReady()
    await router.push('/games/cli-cyber-defender')
  })
  await chooseContext(page)
  await page.getByRole('button', { name: 'Practice (no timer)' }).click()
  await expect(commandInput(page)).toBeVisible()
  await page.goBack()
  const leave = page.getByRole('dialog', { name: 'Leave this game?' })
  await expect(leave).toBeVisible()
  await leave.getByRole('button', { name: 'Keep playing' }).click()
  await expect(leave).toBeHidden()
  await expect(page).toHaveURL('/games/cli-cyber-defender')
  await expect(commandInput(page)).toBeVisible()
  await page.goBack()
  await page
    .getByRole('dialog', { name: 'Leave this game?' })
    .getByRole('button', { name: 'Leave game' })
    .click()
  await expect(page).toHaveURL('/about')
})

test('a reload during a game warns first', async ({ page }) => {
  await startShift(page, 'practice')
  // a gesture is what lets the browser raise the warning
  await commandInput(page).fill('help')
  await commandInput(page).press('Enter')
  const warned = new Promise((resolve) => {
    page.once('dialog', async (dialog) => {
      resolve(dialog.type())
      await dialog.accept()
    })
  })
  await page.reload()
  expect(await warned).toBe('beforeunload')
})

test('the top bar exit asks once, not twice', async ({ page }) => {
  await startShift(page, 'practice')
  await page.getByTestId('exit-game').click()
  await page
    .getByRole('dialog', { name: 'Leave the game?' })
    .getByRole('button', { name: 'Leave game' })
    .click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('dialog', { name: 'Leave this game?' })).toHaveCount(0)
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
    for (let handled = 1; handled <= 8; handled += 1) await solve(page)
    await expect(page.getByRole('heading', { name: 'Shift debrief' })).toBeFocused()
    await expect(page.getByText('2,700 / 2,700 points')).toBeVisible()
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
