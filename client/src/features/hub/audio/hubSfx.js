import { MUSIC_MUTED_KEY } from '../../../composables/useLandingMusic.js'

// metres covered per footfall, so the step rate follows walk and sprint speed
export const STRIDE = 2.3
export const MIN_STEP_SPEED = 0.8
// a lamp hiss can sound within this range, with a pause of HISS_GAP seconds between hisses
export const HISS_RANGE = 7
export const HISS_GAP = [7, 15]
const GESTURES = ['pointerdown', 'keydown', 'touchstart']
const FOOT_GAIN = 0.07
const HISS_GAIN = 0.03

export function stepInterval(speed) {
  return speed < MIN_STEP_SPEED ? Infinity : STRIDE / speed
}

export function nearestLamp(spots, x, z) {
  let best = Infinity
  for (const [lx, lz] of spots) best = Math.min(best, Math.hypot(lx - x, lz - z))
  return best
}

// louder close to a lamp, nothing beyond the range
export function hissLevel(distance) {
  if (!(distance < HISS_RANGE)) return 0
  const k = 1 - distance / HISS_RANGE
  return k * k
}

export function isSfxMuted() {
  try {
    return sessionStorage.getItem(MUSIC_MUTED_KEY) === '1'
  } catch {
    return false
  }
}

// pure timing: decides when a footfall or a hiss is due, the audio itself is played by the caller
export function createSfxClock({ random = Math.random } = {}) {
  let sinceStep = 0
  let nextHiss = HISS_GAP[0] + random() * (HISS_GAP[1] - HISS_GAP[0])
  return {
    // returns how many footfalls are due, none while idle, airborne, paused or muted
    step(dt, { speed, grounded, silent }) {
      if (silent || !grounded || speed < MIN_STEP_SPEED) {
        sinceStep = 0
        return 0
      }
      sinceStep += dt
      const gap = stepInterval(speed)
      if (sinceStep < gap) return 0
      sinceStep -= gap
      if (sinceStep > gap) sinceStep = 0
      return 1
    },
    // returns the hiss level (0 when none is due)
    hiss(dt, { distance, silent }) {
      if (silent) return 0
      nextHiss -= dt
      if (nextHiss > 0) return 0
      const level = hissLevel(distance)
      if (level === 0) {
        // too far from a lamp, ask again soon
        nextHiss = 1
        return 0
      }
      nextHiss = HISS_GAP[0] + random() * (HISS_GAP[1] - HISS_GAP[0])
      return level
    },
  }
}

function noiseBuffer(ctx, seconds) {
  const buffer = ctx.createBuffer(
    1,
    Math.max(1, Math.floor(ctx.sampleRate * seconds)),
    ctx.sampleRate,
  )
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
  return buffer
}

// footsteps and the faint gas lamp hiss, generated with webaudio (no files). one context, created on the first gesture
export function createHubSfx({
  spots = [],
  isMuted = isSfxMuted,
  createContext = () => new (window.AudioContext || window.webkitAudioContext)(),
  target = document,
  random = Math.random,
} = {}) {
  const clock = createSfxClock({ random })
  let ctx = null
  let master = null
  let steps = null
  let hissBuf = null
  let alt = 1
  let disposed = false

  function ensure() {
    if (ctx || disposed) return
    try {
      ctx = createContext()
      master = ctx.createGain()
      master.gain.value = 1
      master.connect(ctx.destination)
      steps = noiseBuffer(ctx, 0.12)
      hissBuf = noiseBuffer(ctx, 2)
    } catch {
      ctx = null
    }
  }
  function onGesture() {
    ensure()
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
  }
  for (const type of GESTURES) target.addEventListener(type, onGesture, true)

  function playStep(speed) {
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = steps
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    alt = -alt
    // a soft thud, a little different each foot, brighter when running
    filter.frequency.value = 420 + speed * 18 + alt * 60 + random() * 80
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(FOOT_GAIN * (0.8 + random() * 0.3), t + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1)
    src.connect(filter).connect(gain).connect(master)
    src.start(t)
    src.stop(t + 0.12)
  }
  function playHiss(level) {
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = hissBuf
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 5200
    filter.Q.value = 0.6
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(HISS_GAIN * level, t + 0.5)
    gain.gain.linearRampToValueAtTime(0, t + 1.9)
    src.connect(filter).connect(gain).connect(master)
    src.start(t)
    src.stop(t + 2)
  }

  return {
    // speed in m/s, called once a frame
    update(dt, { x, z, speed, grounded, paused }) {
      if (disposed) return
      const silent = paused || isMuted() || !ctx || ctx.state !== 'running'
      if (clock.step(dt, { speed, grounded, silent })) playStep(speed)
      const level = clock.hiss(dt, {
        distance: silent ? Infinity : nearestLamp(spots, x, z),
        silent,
      })
      if (level > 0) playHiss(level)
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const type of GESTURES) target.removeEventListener(type, onGesture, true)
      if (ctx) ctx.close().catch(() => {})
      ctx = null
      master = null
    },
  }
}
