import { api } from '../../services/api.js'

export function fetchEdition(section, range, signal) {
  return api
    .get('/news', { params: { section, range }, signal, timeout: 15000 })
    .then(({ data }) => data)
}

export function safeNewsLink(value) {
  if (
    typeof value !== 'string' ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    return null
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null
  } catch {
    return null
  }
}

// time only when it falls on today in singapore, otherwise day and time
export function newsStamp(value, now = Date.now()) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const day = (time) =>
    new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', dateStyle: 'short' }).format(
      time,
    )
  return new Intl.DateTimeFormat('en-SG', {
    timeZone: 'Asia/Singapore',
    ...(day(date) !== day(new Date(now)) && { day: 'numeric', month: 'short' }),
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function newsDate(value, includeTime = false) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-SG', {
    timeZone: 'Asia/Singapore',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(includeTime && { hour: '2-digit', minute: '2-digit' }),
  }).format(date)
}
