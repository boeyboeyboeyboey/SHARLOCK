import { expect } from '@playwright/test'
import { gameCatalog } from '../../../client/src/data/gameCatalog.js'

// the 2d town lists its buildings under Places in the Menu; choosing one centres it and opens its card
export async function jumpToBuilding(page, id) {
  const game = gameCatalog.find((item) => item.id === id)
  await page.getByTestId('menu-button').click()
  const places = page.getByRole('navigation', { name: 'Places' })
  await expect(places).toBeVisible()
  await places
    .getByRole('button', { name: game.needs3d ? `${game.name}, needs 3D` : game.name, exact: true })
    .click()
  await expect(page.getByTestId('site-menu')).toBeHidden()
}

// only the hub specs may render 3d; everything else pins the 2d town so a headed run on a
// laptop with a real gpu behaves the same as headless chromium
export function forceTown2d(target) {
  return target.addInitScript(() => localStorage.setItem('sharlock.townMode', '2d'))
}

export async function newTown2dContext(browser, options) {
  const context = await browser.newContext(options)
  await forceTown2d(context)
  return context
}
