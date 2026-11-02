// runtime watch: samples real frame rates and lowers the graphics when the device struggles
export const PERF_KEY = 'sharlock.hubPerf'
// median fps below this counts as struggling; the low tier is capped at 30 fps so it gets a lower bar
export const FPS_THRESHOLD = { desktop: 40, compact: 40, low: 20 }
export const WARMUP_MS = 1000
export const SAMPLE_MS = 4000
// a frame gap this long is a stall or a hidden tab, not a measurement
export const MAX_GAP_MS = 500
const NEXT_TIER = { desktop: 'compact', compact: 'low' }
const TIER_RANK = { low: 0, compact: 1, desktop: 2 }

// dev and test builds only: headless software rendering is always slow, so tests feed fps by hand instead
export function realSamplingOff() {
  if (!import.meta.env.DEV) return false
  try {
    return localStorage.getItem('sharlock.hubWatchManual') === '1'
  } catch {
    return false
  }
}

export function median(values) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function lowerTier(a, b) {
  return TIER_RANK[a] <= TIER_RANK[b] ? a : b
}

// ok, lower (rebuild one tier down), switch-2d, or stay (low struggles but the user explicitly chose 3d)
export function decidePerf({ tier, fps, explicit3d = false }) {
  if (fps >= (FPS_THRESHOLD[tier] ?? FPS_THRESHOLD.compact)) return { action: 'ok', tier }
  const next = NEXT_TIER[tier]
  if (next) return { action: 'lower', tier: next }
  return { action: explicit3d ? 'stay' : 'switch-2d', tier: 'low' }
}

export function perfRecord(decision, now = new Date()) {
  if (decision.action === 'ok') return null
  const record = { tier: decision.tier, struggled: true, at: now.toISOString() }
  if (decision.action === 'switch-2d') record.twoD = true
  return record
}

export function readPerf() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PERF_KEY))
    if (!parsed?.struggled || !(parsed.tier in NEXT_TIER || parsed.tier === 'low')) return null
    return { tier: parsed.tier, twoD: Boolean(parsed.twoD) }
  } catch {
    return null
  }
}

export function writePerf(record) {
  try {
    if (record) localStorage.setItem(PERF_KEY, JSON.stringify(record))
    else localStorage.removeItem(PERF_KEY)
  } catch {
    // storage can be blocked; the outcome then lasts for this visit only
  }
}

// frame(dtMs, active) is called per rendered frame; inactive frames are skipped, so hidden or paused time never counts
export function createSampler({ onResult, warmupMs = WARMUP_MS, sampleMs = SAMPLE_MS }) {
  let warm = 0
  let sampled = 0
  let done = false
  const times = []
  const finish = (fps) => {
    if (done) return
    done = true
    onResult(fps)
  }
  return {
    frame(dt, active) {
      if (done || !active || dt <= 0 || dt > MAX_GAP_MS) return
      if (warm < warmupMs) {
        warm += dt
        return
      }
      times.push(dt)
      sampled += dt
      if (sampled >= sampleMs) finish(1000 / median(times))
    },
    // test hook: skips the timing and reports a frame rate directly
    feed: finish,
  }
}
