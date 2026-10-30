import { onBeforeUnmount, onMounted } from 'vue'
import { MUSIC_MUTED_KEY } from '../../../composables/useLandingMusic.js'
import { CUE_NAMES } from './soundCues.js'

const GESTURES = ['pointerdown', 'keydown', 'touchstart']
const VOLUME = 0.07

// notes are [start hz, offset s, duration s, wave, end hz]
const note = (hz, at, dur, wave = 'square', to = hz) => [hz, at, dur, wave, to]
const CUES = {
  horn: [note(196, 0, 0.55, 'sawtooth'), note(294, 0, 0.55, 'sawtooth')],
  tick: [note(880, 0, 0.04)],
  tickFast: [note(1320, 0, 0.05)],
  tagHit: [note(320, 0, 0.14, 'square', 140)],
  infected: [note(420, 0, 0.45, 'sawtooth', 80), note(70, 0.2, 0.3, 'square')],
  patchOk: [
    note(523, 0, 0.08, 'sine'),
    note(659, 0.08, 0.08, 'sine'),
    note(784, 0.16, 0.18, 'sine'),
  ],
  patchFail: [note(120, 0, 0.35, 'sawtooth')],
  immuneWarn: [note(700, 0, 0.08, 'triangle'), note(700, 0.14, 0.08, 'triangle')],
  sprint: [note(180, 0, 0.24, 'triangle', 720)],
  win: [
    note(523, 0, 0.12, 'triangle'),
    note(659, 0.12, 0.12, 'triangle'),
    note(784, 0.24, 0.12, 'triangle'),
    note(1047, 0.36, 0.4, 'triangle'),
  ],
  lose: [
    note(392, 0, 0.16, 'sawtooth'),
    note(330, 0.18, 0.16, 'sawtooth'),
    note(262, 0.36, 0.16, 'sawtooth'),
    note(196, 0.54, 0.4, 'sawtooth'),
  ],
}

function soundMuted() {
  try {
    return sessionStorage.getItem(MUSIC_MUTED_KEY) === '1'
  } catch {
    return false
  }
}

const defaultContext = () => {
  const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext
  return Context ? new Context() : null
}

// generated effects for a round: no files, the context is made on the first gesture and effects follow the shared sound mute
export function useTagSound({ createContext = defaultContext } = {}) {
  let context = null
  let armed = false

  function disarm() {
    if (!armed) return
    armed = false
    for (const type of GESTURES) document.removeEventListener(type, unlock, true)
  }

  function unlock() {
    disarm()
    try {
      context ??= createContext()
      context?.resume?.()?.catch?.(() => {})
    } catch {
      context = null
    }
  }

  function play(name) {
    const cue = CUES[name]
    if (!cue || !context || soundMuted()) return
    try {
      const start = context.currentTime
      for (const [hz, offset, duration, wave, to] of cue) {
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        oscillator.type = wave
        oscillator.frequency.setValueAtTime(hz, start + offset)
        if (to !== hz) oscillator.frequency.linearRampToValueAtTime(to, start + offset + duration)
        gain.gain.setValueAtTime(VOLUME, start + offset)
        gain.gain.exponentialRampToValueAtTime(0.001, start + offset + duration)
        oscillator.connect(gain).connect(context.destination)
        oscillator.start(start + offset)
        oscillator.stop(start + offset + duration)
      }
    } catch {
      // effects are optional; nothing here may break a round
    }
  }

  onMounted(() => {
    armed = true
    for (const type of GESTURES) document.addEventListener(type, unlock, true)
  })
  onBeforeUnmount(() => {
    disarm()
    context?.close?.()?.catch?.(() => {})
    context = null
  })

  return { play, unlock, cues: CUE_NAMES }
}
