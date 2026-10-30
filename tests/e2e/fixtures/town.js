import { expect } from '@playwright/test'
import { gameCatalog } from '../../../client/src/data/gameCatalog.js'

// the 2d town lists its buildings under Places in the Menu; choosing one centres it and opens its card
export async function jumpToBuilding(page, id) {
  const game = gameCatalog.find((item) => item.id === id)
  await page.getByTestId('menu-button').click()
  await page
    .getByRole('navigation', { name: 'Places' })
    .getByRole('button', { name: game.needs3d ? `${game.name}, needs 3D` : game.name, exact: true })
    .click()
  await expect(page.getByTestId('site-menu')).toBeHidden()
}
