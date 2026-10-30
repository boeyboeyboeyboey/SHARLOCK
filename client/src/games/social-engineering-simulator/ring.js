import { MUSIC_MUTED_KEY } from '../../composables/useLandingMusic.js'

let context = null

function soundMuted() {
  try {
    return sessionStorage.getItem(MUSIC_MUTED_KEY) === '1'
  } catch {
    return false
  }
}

// a short synthesised double ring, so no audio file is needed; honours the shared mute key
export function playRing() {
  try {
    if (soundMuted() || typeof AudioContext === 'undefined') return
    if (/jsdom/i.test(navigator.userAgent)) return
    context ??= new AudioContext()
    const start = context.currentTime
    for (const offset of [0, 0.25, 0.6, 0.85]) {
      const tone = context.createOscillator()
      const gain = context.createGain()
      tone.frequency.value = 880
      gain.gain.setValueAtTime(0.08, start + offset)
      gain.gain.setValueAtTime(0, start + offset + 0.18)
      tone.connect(gain).connect(context.destination)
      tone.start(start + offset)
      tone.stop(start + offset + 0.2)
    }
  } catch {
    // autoplay policy or no audio support: stay silent
  }
}
