import { MUSIC_MUTED_KEY } from './useLandingMusic.js'

export const SFX_NAMES = ['correct', 'wrong', 'win', 'lose', 'click']
const SFX_VOLUME = 0.6
const POOL_SIZE = 2
const pools = new Map()

function soundMuted() {
  try {
    return sessionStorage.getItem(MUSIC_MUTED_KEY) === '1'
  } catch {
    return false
  }
}

// jsdom does not implement media playback and reports it on the console
function underJsdom() {
  return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)
}

function poolFor(name) {
  let pool = pools.get(name)
  if (!pool) {
    pool = { items: [], next: 0, dead: false }
    pools.set(name, pool)
  }
  return pool
}

function makeItem(name, pool) {
  const item = new Audio(`/audio/games/sfx-${name}.mp3`)
  item.preload = 'auto'
  item.volume = SFX_VOLUME
  // a missing or undecodable file is dropped for the rest of the visit, quietly
  item.addEventListener('error', () => {
    pool.dead = true
  })
  return item
}

// short effect for a game moment; follows the shared sound mute and never throws or logs
export function playSfx(name) {
  try {
    if (!SFX_NAMES.includes(name) || soundMuted() || underJsdom()) return
    if (typeof Audio === 'undefined') return
    const pool = poolFor(name)
    if (pool.dead) return
    if (pool.items.length < POOL_SIZE) pool.items.push(makeItem(name, pool))
    const item = pool.items[pool.next++ % pool.items.length]
    item.currentTime = 0
    const started = item.play()
    started?.catch?.((error) => {
      if (error?.name === 'NotSupportedError') pool.dead = true
    })
  } catch {
    // effects are optional; nothing here may break a game
  }
}

export function resetSfxPools() {
  pools.clear()
}
