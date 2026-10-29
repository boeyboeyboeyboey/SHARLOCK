import { expect } from '@playwright/test'
import { connectDatabase } from '../../../server/src/config/database.js'
import { assertSafeTestDatabaseUri } from '../../../server/src/config/database-uri.js'
import { generateCase } from '../../../server/src/modules/games/sql-injection-arcade/generator/index.js'
import { isRepairSlot } from '../../../server/src/modules/games/sql-injection-arcade/policy.js'
import { junkAction, solutionFor } from '../../../server/tests/unit/sql-injection-arcade/helpers.js'

export { generateCase, junkAction, solutionFor }

// the stored seed is the determinism seam, read from the disposable test database
export async function readSeed(attemptId) {
  const testUri = process.env.TEST_MONGODB_URI
  if (process.env.NODE_ENV !== 'test' || !testUri)
    throw new Error('SQL E2E requires the guarded test database.')
  assertSafeTestDatabaseUri(testUri)
  const database = await connectDatabase(testUri)
  try {
    const document = await database.db
      .collection('game_attempts')
      .findOne({ _id: new database.base.Types.ObjectId(attemptId) })
    return document.state.seed
  } finally {
    await database.close()
  }
}

export const attemptIdOf = (page) => new URL(page.url()).searchParams.get('attempt')

export async function openRun(page, contextOption = 'personal') {
  await page.goto('/games/sql-injection-arcade')
  if (contextOption !== 'personal')
    await page.getByLabel('Save this case to').selectOption(contextOption)
  await page.getByRole('button', { name: 'Open the case' }).click()
  await expect(page).toHaveURL(/attempt=/)
  return readSeed(attemptIdOf(page))
}

// three taken-name registrations spend a second-order case's tries without solving it
export function failSteps(c) {
  const { caseId } = c.public
  const { kind, model } = c.private
  if (kind === 'second-order')
    return Array.from({ length: 3 }, () => ({
      type: 'register',
      payload: { caseId, inputs: [model.rows[0].user] },
    }))
  const junk = junkAction(c)
  const count = kind === 'blind' ? 6 : 3
  return Array.from({ length: count }, () => junk)
}

const isAction = (response) =>
  response.request().method() === 'POST' && /\/actions$/.test(response.url())

async function press(page, name) {
  await Promise.all([
    page.waitForResponse(isAction),
    page.getByRole('button', { name, exact: true }).click(),
  ])
}

export async function waitForCase(page, c) {
  await expect(page.getByTestId('sql-case')).toHaveAttribute('data-case-id', c.public.caseId)
}

// plays one server action through the real controls
export async function playStep(page, c, step) {
  const inputs = page.locator('.sql-case-form input[type="text"], .sql-case-form input:not([type])')
  const { type, payload } = step
  if (type === 'attempt') {
    for (const [position, value] of payload.inputs.entries()) await inputs.nth(position).fill(value)
    await press(page, c.public.kind === 'blind' ? 'Send probe' : 'Run the query')
  } else if (type === 'register') {
    await inputs.first().fill(payload.inputs[0])
    await press(page, 'Register')
  } else if (type === 'change-password') await press(page, 'Change password')
  else if (type === 'answer') await press(page, payload.value === 'yes' ? 'Yes' : 'No')
  else if (type === 'hint') await press(page, 'Show a hint')
  else if (type === 'choose-fix') {
    const option = c.public.options.find((item) => item.id === payload.optionId)
    await page.getByRole('radio', { name: option.text }).check()
    await press(page, 'Confirm repair')
  }
}

export async function playCase(page, c, steps) {
  await waitForCase(page, c)
  for (const step of steps) await playStep(page, c, step)
}

export async function finishRun(page) {
  await page.getByRole('button', { name: 'Finish and save result' }).click()
  await expect(page.getByText('Result saved to your account.', { exact: true })).toBeVisible()
}

// plays one full run and saves it. class runs solve the first case then fail until the lives
// run out; personal practice solves every slot
export async function playSqlRun(page, contextOption) {
  const seed = await openRun(page, contextOption)
  const timed = contextOption !== 'personal'
  for (let index = 0; ; index += 1) {
    const c = generateCase({ seed, index })
    const solve = !timed || index === 0 || isRepairSlot(index)
    await playCase(page, c, solve ? solutionFor(c) : failSteps(c))
    if (timed ? index === 3 : index === 14) break
    await page.getByRole('button', { name: 'Next case' }).click()
  }
  await finishRun(page)
}
