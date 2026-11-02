import { computed, ref } from 'vue'
import { getDeviceCheck } from '../hub/deviceCheck.js'

export const TOWN_MODE_KEY = 'sharlock.townMode'
export const NOTICE_KEY = 'sharlock.autoNoticeDismissed'
const MODES = ['3d', '2d']

export function readStoredMode() {
  try {
    const stored = localStorage.getItem(TOWN_MODE_KEY)
    return MODES.includes(stored) ? stored : null
  } catch {
    return null
  }
}

function writeStoredMode(mode) {
  try {
    localStorage.setItem(TOWN_MODE_KEY, mode)
  } catch {
    // storage can be blocked; the choice then lasts for this visit only
  }
}

export function noticeKey(reasons) {
  return [...reasons].sort().join(',')
}

function readDismissedNotice() {
  try {
    return localStorage.getItem(NOTICE_KEY)
  } catch {
    return null
  }
}

// a forced or automatic 2d never replaces the stored choice, and an explicit choice always wins
// without webgl2 the hub cannot start at all, so that case stays locked
export function resolveMode({ stored, device, failed }) {
  const noWebgl2 = device.reasons.includes('no-webgl2')
  if (noWebgl2 || failed) return { mode: '2d', forced: true, auto: false, locked: true }
  if (stored) return { mode: stored, forced: false, auto: false, locked: false }
  if (device.verdict === '2d') return { mode: '2d', forced: true, auto: true, locked: false }
  return { mode: '3d', forced: false, auto: false, locked: false }
}

const slowDevice = { verdict: '2d', tier: 'low', reasons: ['slow-runtime'] }

export function useTownMode({ device: measured = getDeviceCheck() } = {}) {
  const slow = ref(false)
  // a runtime switch to 2d reads like an automatic 2d verdict
  const device = computed(() => (slow.value ? slowDevice : measured))
  const choice = ref(readStoredMode())
  const failed = ref(false)
  const warning = ref(false)
  const dismissed = ref(readDismissedNotice())
  const resolved = computed(() =>
    resolveMode({ stored: choice.value, device: device.value, failed: failed.value }),
  )
  const mode = computed(() => resolved.value.mode)
  const reasons = computed(() =>
    failed.value
      ? ['failed']
      : device.value.reasons.filter((r) => device.value.verdict === '2d' || r === 'no-webgl2'),
  )
  const key = computed(() => noticeKey(reasons.value))

  function setMode(next) {
    if (!MODES.includes(next)) return
    choice.value = next
    writeStoredMode(next)
  }

  return {
    mode,
    forced: computed(() => resolved.value.forced),
    // the toggle stays available unless the 3d wharf cannot start at all
    locked: computed(() => resolved.value.locked),
    auto: computed(() => resolved.value.auto),
    reasons,
    warning,
    // the automatic notice also covers a locked fallback, which cannot be dismissed
    noticeVisible: computed(
      () => resolved.value.forced && (resolved.value.locked || dismissed.value !== key.value),
    ),
    toggle: () => {
      if (resolved.value.locked) return
      if (mode.value === '3d') setMode('2d')
      // a device the checks gave up on asks before it is sent to 3d
      else if (device.value.verdict === '2d') warning.value = true
      else setMode('3d')
    },
    explicit3d: computed(() => choice.value === '3d'),
    markSlow: () => {
      if (choice.value !== '3d') slow.value = true
    },
    confirm3d: () => {
      warning.value = false
      slow.value = false
      setMode('3d')
    },
    cancel3d: () => {
      warning.value = false
    },
    dismissNotice: () => {
      dismissed.value = key.value
      try {
        localStorage.setItem(NOTICE_KEY, key.value)
      } catch {
        // storage can be blocked; the notice then stays hidden for this visit only
      }
    },
    markFailed: () => {
      failed.value = true
    },
  }
}
