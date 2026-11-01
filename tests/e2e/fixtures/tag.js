// scripts a live botnet tag round through the route the server mounts only in a test process
export async function tagControl(page, baseURL, classId, action, extra = {}) {
  const response = await page.request.post(new URL('/api/test/botnet-tag/control', baseURL).href, {
    data: { classId, action, ...extra },
  })
  if (!response.ok()) throw new Error(`Tag control ${action} failed with ${response.status()}.`)
  return response.json()
}

// fills the open puzzle with the given submission, through the same controls a player uses
export async function answerPuzzle(panel, submission) {
  if (Number.isInteger(submission.index)) {
    await panel.locator('label').nth(submission.index).click()
    return
  }
  if ((await panel.getByTestId('puzzle-patch').count()) > 0) {
    for (const [i, id] of submission.choices.entries()) {
      await panel.getByTestId(`patch-service-${i}`).click()
      await panel.getByTestId(`patch-${id}`).click()
    }
    return
  }
  for (const [i, verdict] of submission.choices.entries()) {
    const name = verdict === 'allow' ? 'Allow' : 'Block'
    await panel.getByRole('radiogroup').nth(i).locator('label', { hasText: name }).click()
  }
}
