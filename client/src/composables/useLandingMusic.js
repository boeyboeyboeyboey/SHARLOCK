import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

export const MUSIC_MUTED_KEY = 'sharlock.musicMuted'
const GESTURES = ['pointerdown', 'keydown', 'touchstart']

function readMuted() {
  try {
    return sessionStorage.getItem(MUSIC_MUTED_KEY) === '1'
  } catch {
    return false
  }
}
function writeMuted(muted) {
  try {
    if (muted) sessionStorage.setItem(MUSIC_MUTED_KEY, '1')
    else sessionStorage.removeItem(MUSIC_MUTED_KEY)
  } catch {
    // storage can be blocked; the choice then lasts only for this visit
  }
}

// landing music: tries to start on mount, falls back to the first gesture, and remembers a mute for the session only
export function useLandingMusic(audio, suspended = () => false) {
  const isMuted = ref(true)
  const starting = ref(false)
  const errorMessage = ref('')
  let disposed = false
  let armed = false
  let generation = 0

  function disarm() {
    if (!armed) return
    armed = false
    for (const type of GESTURES) document.removeEventListener(type, onGesture, true)
  }
  function arm() {
    if (armed || disposed) return
    armed = true
    for (const type of GESTURES) document.addEventListener(type, onGesture, true)
  }
  function silence() {
    if (!audio.value) return
    audio.value.muted = true
    audio.value.pause()
  }
  function failPlayback() {
    if (disposed) return
    silence()
    isMuted.value = true
    starting.value = false
    errorMessage.value = 'Sound could not start. Tap to try again.'
  }
  // automatic starts fail quietly and wait for the next gesture; a click on the button reports failure
  async function start(automatic) {
    if (!audio.value || disposed) return
    disarm()
    errorMessage.value = ''
    starting.value = true
    const request = ++generation
    audio.value.muted = false
    try {
      // play is called synchronously inside the gesture; state follows only once it resolves
      await audio.value.play()
      if (!disposed && request === generation) isMuted.value = false
    } catch {
      if (disposed || request !== generation) return
      if (automatic) {
        audio.value.muted = true
        isMuted.value = true
        arm()
      } else failPlayback()
    } finally {
      if (!disposed && request === generation) starting.value = false
    }
  }
  function onGesture(event) {
    // the sound button handles its own click, so a first press on it is not also an auto-start
    if (event?.target?.closest?.('.sound-button')) return
    if (suspended() || readMuted()) return disarm()
    start(true)
  }
  async function toggle() {
    if (!audio.value || starting.value || suspended()) return
    disarm()
    errorMessage.value = ''
    if (!isMuted.value) {
      generation++
      silence()
      isMuted.value = true
      writeMuted(true)
      return
    }
    writeMuted(false)
    await start(false)
  }

  onMounted(() => {
    if (!readMuted() && !suspended()) start(true)
  })
  watch(suspended, (hold) => {
    if (hold) {
      generation++
      disarm()
      starting.value = false
      silence()
    } else if (!readMuted()) {
      isMuted.value = true
      start(true)
    }
  })
  onBeforeUnmount(() => {
    disposed = true
    disarm()
    silence()
  })

  return { isMuted, starting, errorMessage, toggle, failPlayback }
}
