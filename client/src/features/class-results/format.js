import { gameCatalog } from '../../data/gameCatalog.js'

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function gameName(id) {
  return gameCatalog.find((game) => game.id === id)?.name || id
}

export function formatDate(value) {
  const time = Date.parse(value)
  return Number.isFinite(time) ? dateFormat.format(time) : 'No activity yet'
}

export function formatDateTime(value) {
  const time = Date.parse(value)
  return Number.isFinite(time) ? dateTimeFormat.format(time) : ''
}
