import { computed, ref } from 'vue'
import { finds } from './scenes/wharf/finds.js'

export const DISCOVERY_KEY = 'sharlock.discoveries'
export const DISCOVERY_RANGE = 2.4
export const DISCOVERY_TOTAL = finds.length

const known = new Set(finds.map((find) => find.id))

// found ids are not sensitive, so plain local storage is fine; unknown or repeated ids are dropped
export function readFound(storage = globalThis.localStorage) {
  try {
    const list = JSON.parse(storage.getItem(DISCOVERY_KEY))
    if (!Array.isArray(list)) return []
    return [...new Set(list.filter((id) => known.has(id)))]
  } catch {
    return []
  }
}

export function writeFound(ids, storage = globalThis.localStorage) {
  try {
    storage.setItem(DISCOVERY_KEY, JSON.stringify(ids))
  } catch {
    // storage can be blocked; the count then lasts for this page only
  }
}

// the closest find within range of the player, or null
export function nearestFind(player, list = finds, range = DISCOVERY_RANGE) {
  if (!player) return null
  let best = null
  let bestDist = range
  for (const find of list) {
    const dist = Math.hypot(player.x - find.x, player.z - find.z)
    if (dist < bestDist) {
      best = find
      bestDist = dist
    }
  }
  return best
}

const found = ref(readFound())

export function useDiscoveries() {
  return {
    found,
    count: computed(() => found.value.length),
    total: DISCOVERY_TOTAL,
    has: (id) => found.value.includes(id),
    // returns true the first time an id is found
    mark(id) {
      if (!known.has(id) || found.value.includes(id)) return false
      found.value = [...found.value, id]
      writeFound(found.value)
      return true
    },
  }
}
