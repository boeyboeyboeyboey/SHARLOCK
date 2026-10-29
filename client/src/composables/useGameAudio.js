import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useLandingMusic } from './useLandingMusic.js'

export const gameThemeUrl = (roomId) => (roomId ? `/audio/games/${roomId}-theme.mp3` : '')

// theme music for one game room: the landing music rules with its own looping element.
// a missing or undecodable file sets `missing`, which holds playback and fails without any message
export function useGameAudio(roomId) {
  const audio = shallowRef(typeof Audio === 'undefined' ? null : new Audio())
  const missing = ref(!roomId())

  function load() {
    if (!audio.value) return
    missing.value = !roomId()
    audio.value.pause()
    if (missing.value) audio.value.removeAttribute('src')
    else audio.value.src = gameThemeUrl(roomId())
    audio.value.load()
  }
  if (audio.value) {
    audio.value.loop = true
    audio.value.preload = 'none'
    audio.value.addEventListener('error', () => {
      if (audio.value?.getAttribute('src')) missing.value = true
    })
    audio.value.src = gameThemeUrl(roomId())
  }

  const music = useLandingMusic(audio, () => missing.value)
  watch(roomId, load)
  onBeforeUnmount(() => {
    // stop any download still running
    audio.value?.removeAttribute('src')
    audio.value?.load()
  })

  return { isMuted: music.isMuted, starting: music.starting, toggle: music.toggle, missing }
}
