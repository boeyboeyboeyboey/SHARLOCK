import { readonly, ref } from 'vue'

export const LORE_SEEN_KEY = 'sharlock.loreIntroSeen'

// module-level so the scene, the ambience and the replay button share one state
const playing = ref(false)
// used when storage is blocked, so the intro does not replay on every mount
let seenInMemory = false

function hasSeen() {
  if (seenInMemory) return true
  try {
    return localStorage.getItem(LORE_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

function markSeen() {
  seenInMemory = true
  try {
    localStorage.setItem(LORE_SEEN_KEY, '1')
  } catch {
    // storage can be blocked
  }
}

function start() {
  playing.value = true
}

function finish() {
  markSeen()
  playing.value = false
}

export function _resetLoreIntroForTests() {
  seenInMemory = false
  playing.value = false
  try {
    localStorage.removeItem(LORE_SEEN_KEY)
  } catch {
    // storage can be blocked
  }
}

export function useLoreIntro() {
  return { playing: readonly(playing), hasSeen, start, replay: start, finish }
}
