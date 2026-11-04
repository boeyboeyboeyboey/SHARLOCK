import { randomBytes } from 'node:crypto'
import { test, expect as baseExpect } from '@playwright/test'
import { seedClass, signedInPage } from './fixtures/class.js'
import { answerPuzzle, tagControl } from './fixtures/tag.js'

// software webgl builds the yard slowly and can starve the page, and the countdown is 10s
test.setTimeout(240000)
const expect = baseExpect.configure({ timeout: 20000 })

const STATIONS = [
  [-18, -12],
  [0, -12],
  [18, -12],
  [-18, 12],
  [0, 12],
  [18, 12],
]

// through the lobby and countdown to a running round; the e2e server keeps its bots still
async function enterRound(browser, baseURL) {
  const suffix = `tg${randomBytes(4).toString('hex')}`
  const { studentA, classId } = await seedClass(suffix)
  const { context, page } = await signedInPage(browser, baseURL, studentA)
  const control = (action, extra) =>
    tagControl(page, baseURL, classId, action, { username: studentA.username, ...extra })

  // on auto a starved page lowers its tier, which rebuilds the arena and forgets the walk below
  await page.addInitScript(() => localStorage.setItem('sharlock.graphics', 'low'))
  await page.goto('/games/botnet-tag')
  const lobby = page.getByTestId('tag-lobby')
  await expect(lobby).toBeVisible()
  await expect(lobby.getByTestId('tag-class')).toHaveText(`Tower Class ${suffix}`)
  await expect(lobby.getByTestId('tag-player')).toHaveCount(1)
  await expect(lobby.getByTestId('tag-player').first()).toContainText(studentA.username)
  await expect(lobby.getByTestId('tag-ready-by')).toContainText('Press Ready within')
  await expect(page.getByTestId('tag-arena')).toBeAttached()

  await lobby.getByRole('button', { name: 'Ready', exact: true }).click()
  await expect(lobby.getByRole('button', { name: '✓ Ready' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(lobby.getByTestId('tag-player')).toHaveCount(3)
  await expect(lobby.getByText('Bot', { exact: true })).toHaveCount(2)
  await expect(page.getByTestId('tag-countdown')).toContainText(/\d/)

  await expect(page.getByTestId('tag-timer')).toBeVisible({ timeout: 40000 })
  await expect
    .poll(() => page.evaluate(() => window.__tag?.debug.players().length ?? 0))
    .toBeGreaterThanOrEqual(3)
  await expect.poll(() => page.evaluate(() => Boolean(window.__tag.debug.you()))).toBe(true)
  return { context, page, student: studentA, control }
}

async function expectResultsFit(page) {
  const fits = await page
    .getByTestId('tag-results')
    .evaluate((panel) => panel.scrollWidth <= panel.clientWidth)
  expect(fits).toBe(true)
}

test('a survivor patches a station, wins the round, saves it and plays again', async ({
  browser,
  baseURL,
  isMobile,
}) => {
  const { context, page, student, control } = await enterRound(browser, baseURL)
  try {
    await control('clean')
    await expect(page.getByTestId('tag-status')).toHaveText('Clean')
    await expect(page.getByTestId('tag-botnet-count')).toContainText('1/3')

    // the controls stay on screen during a round, and leaving asks first
    await expect(page.getByTestId('tag-sound')).toBeVisible()
    await page.getByTestId('tag-leave-game').click()
    await page.getByRole('button', { name: 'Keep playing' }).click()
    await expect(page.getByTestId('tag-timer')).toBeVisible()
    await page.getByTestId('tag-howto-open').click()
    const guide = page.getByRole('dialog', { name: 'Botnet Tag' })
    await expect(guide).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(guide).toBeHidden()

    if (isMobile) await expect(page.getByTestId('tag-jump')).toBeVisible()
    else await expect(page.getByTestId('tag-jump')).toBeHidden()

    // walk to the nearest station with the normal movement rules, then use it; each frame's step
    // is capped, so a starved page walks slowly
    await page.evaluate((spots) => {
      const you = window.__tag.debug.you()
      const [x, z] = spots.sort(
        (a, b) => Math.hypot(a[0] - you.x, a[1] - you.z) - Math.hypot(b[0] - you.x, b[1] - you.z),
      )[0]
      window.__tag.debug.walkTo(x, z)
    }, STATIONS)
    const use = page.getByTestId('tag-use')
    await expect(use).toBeVisible({ timeout: 120000 })
    await use.click()
    const panel = page.getByTestId('puzzle-panel')
    await expect(panel).toBeVisible()

    const { submission } = await control('answer')
    await answerPuzzle(panel, submission)
    await page.getByTestId('puzzle-submit').click()
    await expect(panel).toBeHidden()
    await expect(page.getByTestId('tag-status')).toHaveText('Immune')
    await expect(page.getByTestId('tag-immunity')).toBeVisible()

    await control('finish')
    const results = page.getByTestId('tag-results')
    await expect(results).toBeVisible()
    await expect(results.getByRole('heading')).toContainText('Survivors win')
    await expect(results.getByRole('row', { name: student.username })).toContainText('✓ Survived')
    // 180 s clean, one patch and the winning side
    await expect(page.getByTestId('tag-saved')).toHaveText('✓ Saved 270/670')
    await expectResultsFit(page)

    await page.getByTestId('tag-again').click()
    const lobby = page.getByTestId('tag-lobby')
    await expect(lobby).toBeVisible()
    await expect(lobby.getByTestId('tag-ready')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('tag-round-lost')).toHaveCount(0)
    await expect(page.getByTestId('tag-results')).toHaveCount(0)

    // no round is on, so leaving does not ask
    await page.getByTestId('tag-leave-game').click()
    await expect(page).toHaveURL(new URL('/', baseURL).href)
  } finally {
    await context.close()
  }
})

test('two classmates share a lobby and the countdown waits for both', async ({
  browser,
  baseURL,
}) => {
  const suffix = `tg${randomBytes(4).toString('hex')}`
  const { studentA, studentB } = await seedClass(suffix)
  const first = await signedInPage(browser, baseURL, studentA)
  const second = await signedInPage(browser, baseURL, studentB)
  try {
    await first.page.goto('/games/botnet-tag')
    await expect(first.page.getByTestId('tag-lobby')).toBeVisible()
    await second.page.goto('/games/botnet-tag')
    const lobby = first.page.getByTestId('tag-lobby')
    await expect(lobby.getByText(studentB.username)).toBeVisible()
    await expect(second.page.getByTestId('tag-lobby').getByText(studentA.username)).toBeVisible()

    await lobby.getByTestId('tag-ready').click()
    await expect(lobby.getByTestId('tag-ready')).toHaveAttribute('aria-pressed', 'true')
    await expect(
      second.page.getByTestId('tag-player').filter({ hasText: studentA.username }),
    ).toContainText('✓ Ready')
    await expect(lobby.getByTestId('tag-countdown')).toHaveText('')

    await second.page.getByTestId('tag-ready').click()
    await expect(lobby.getByTestId('tag-countdown')).toContainText(/\d/)
    await expect(second.page.getByTestId('tag-countdown')).toContainText(/\d/)
  } finally {
    await first.context.close()
    await second.context.close()
  }
})

test('patient zero cannot use stations, infects everyone, saves the win and leaves', async ({
  browser,
  baseURL,
}) => {
  const { context, page, student, control } = await enterRound(browser, baseURL)
  try {
    await control('zero')
    await expect(page.getByTestId('tag-status')).toHaveText('Infected')
    // the round-start CLEAN banner may still be leaving, so match the infected one
    const banner = page.getByTestId('tag-banner').filter({ hasText: 'INFECTED' })
    await expect(banner).toContainText('Tag everyone!')
    await expect(page.getByTestId('tag-use')).toHaveCount(0)

    // past the grace period and the shortest round that saves; the page tags what it touches
    await control('elapse', { ms: 21000 })
    // tags land one at a time with a 2 s cooldown on the server clock, which elapse has pushed
    // ahead of real time, so step it past each cooldown and pull the survivors back into reach
    const results = page.getByTestId('tag-results')
    let elapsed = 21000
    await expect(async () => {
      // the round may already be over, and elapse is refused once it is
      if (!(await results.isVisible())) {
        elapsed += 2500
        await control('elapse', { ms: elapsed })
        await control('gather')
      }
      await expect(results).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 30_000 })
    await expect(results.getByRole('heading')).toContainText('Botnet wins')
    await expect(results.getByRole('row', { name: student.username })).toContainText('✕ Infected')
    // two tags and the winning side
    await expect(page.getByTestId('tag-saved')).toHaveText('✓ Saved 160/670')
    await expectResultsFit(page)

    await page.getByTestId('tag-leave').click()
    await expect(page).toHaveURL(new URL('/', baseURL).href)
  } finally {
    await context.close()
  }
})
