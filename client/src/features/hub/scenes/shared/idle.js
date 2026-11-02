// pure idle state machine for sharlock: no babylon, driven only by dt and a seeded rng so it is repeatable
const PI = Math.PI
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const smooth = (t) => t * t * (3 - 2 * t)

export const SIT_AFTER = 8
export const SIT_DOWN = 0.6
export const SIT_UP = 0.2
export const LOOK_RANGE = 6
export const LOOK_MAX = 0.6
export const LOOK_ROLL = 0.18
export const YAWN_LENGTH = 1.6
export const WIGGLE_LENGTH = 0.55
export const SNIFF_LENGTH = 0.7
// the clock never advances more than this per call, so a slow frame cannot skip a whole state
export const MAX_STEP = 0.25

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 0 to 1 yawn amount: opens fast, holds, closes slower
export function yawnEnv(age) {
  if (age < 0 || age >= YAWN_LENGTH) return 0
  if (age < 0.4) return smooth(age / 0.4)
  if (age < 1.05) return 1
  return smooth(1 - (age - 1.05) / (YAWN_LENGTH - 1.05))
}

// two quick wiggles inside the window, -1 to 1
export function wiggleSignal(age) {
  if (age < 0 || age >= WIGGLE_LENGTH) return 0
  const k = age / WIGGLE_LENGTH
  return Math.sin(k * PI * 4) * Math.sin(k * PI)
}

// fast nose pulses under a slow envelope, 0 to 1
export function sniffSignal(age) {
  if (age < 0 || age >= SNIFF_LENGTH) return 0
  const k = age / SNIFF_LENGTH
  return (0.5 + 0.5 * Math.sin(age * PI * 2 * 9 - PI / 2)) * Math.sin(k * PI)
}

// relative yaw to a point from a position and heading, wrapped to [-pi, pi]
export function lookYawTo(px, pz, heading, tx, tz) {
  const d = Math.atan2(tx - px, tz - pz) - heading
  return d - PI * 2 * Math.round(d / (PI * 2))
}

export function createIdle({ seed = 1 } = {}) {
  const rand = mulberry32(seed)
  const between = (a, b) => a + rand() * (b - a)
  let idleTime = 0
  let sitProgress = 0
  let nextYawn = 0
  let yawnAge = 99
  let nextWiggle = between(4, 9)
  let wiggleAge = 99
  let wiggleSide = 0
  let nextSniff = between(3, 7)
  let sniffAge = 99
  let nextTurn = between(3, 6)
  let turnHold = 0
  let turnTarget = 0
  const pose = {
    idleTime: 0,
    sit: 0,
    yawn: 0,
    wiggle: 0,
    wiggleSide: 0,
    sniff: 0,
    turn: 0,
    look: null,
    tilt: 0,
  }

  // input: { active, calm, look } where look is the relative yaw to a nearby door or null
  function step(dt, { active = false, calm = false, look = null } = {}) {
    const s = clamp(dt, 0, MAX_STEP)
    if (active) {
      idleTime = 0
    } else idleTime += s
    const wantSit = !active && idleTime >= SIT_AFTER
    const before = sitProgress
    sitProgress = clamp(sitProgress + (wantSit ? s / SIT_DOWN : -s / SIT_UP))
    if (sitProgress >= 1) {
      if (before < 1) nextYawn = between(1.5, 3)
      nextYawn -= s
      if (nextYawn <= 0) {
        yawnAge = 0
        nextYawn = between(6, 10)
      }
    } else if (sitProgress < 0.5) yawnAge = 99
    yawnAge += s

    const settled = idleTime > 0.5
    if (settled) {
      nextWiggle -= s
      if (nextWiggle <= 0) {
        wiggleAge = 0
        wiggleSide = Math.floor(rand() * 3)
        nextWiggle = between(4, 9)
      }
      if (idleTime > 1) {
        nextSniff -= s
        if (nextSniff <= 0) {
          sniffAge = 0
          nextSniff = between(5, 10)
        }
      }
      nextTurn -= s
      if (nextTurn <= 0 && turnHold <= 0) {
        turnTarget = (rand() < 0.5 ? -1 : 1) * between(0.35, 0.6)
        turnHold = between(1.2, 2)
        nextTurn = between(4, 8)
      }
    }
    if (turnHold > 0) {
      turnHold -= s
      if (turnHold <= 0) turnTarget = 0
    }
    wiggleAge += s
    sniffAge += s

    const aim = settled && look != null && Math.abs(look) < 2.4 ? look : null
    const amp = calm ? 0.5 : 1
    pose.idleTime = idleTime
    pose.sit = smooth(sitProgress) * amp
    pose.yawn = yawnEnv(yawnAge)
    pose.wiggle = wiggleSignal(wiggleAge)
    pose.wiggleSide = wiggleSide
    pose.sniff = sniffSignal(sniffAge)
    pose.look = aim == null ? null : clamp(aim, -LOOK_MAX, LOOK_MAX) * amp
    pose.tilt = aim == null ? 0 : -Math.sign(aim) * LOOK_ROLL * amp * clamp(Math.abs(aim) / 0.3)
    pose.turn = calm ? 0 : turnTarget
    return pose
  }

  return { step, pose }
}
