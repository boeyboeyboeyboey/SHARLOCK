// one source for the hub key list, used by the controls hint and the Settings overlay
export const HUB_KEYS = [
  ['WASD / arrows', 'move'],
  ['Space', 'jump'],
  ['Shift', 'sprint'],
  ['E', 'talk or look'],
  ['Enter', 'go in'],
  ['Z / C', 'rotate'],
  ['R', 'reset camera'],
  ['Esc', 'menu'],
]

export const TOUCH_HINT = 'Drag to move · tap a place to walk · Jump and Sprint buttons'

// the toast lists the keys that matter on arrival, without Esc
export function keyboardHint() {
  return 'WASD / arrow keys move · Space jump · Shift sprint · E talk or look · Enter go in · Z/C rotate · R reset camera'
}

export const HINT_SEEN_KEY = 'sharlock.controlsHintSeen'
export const HINT_MAX_VISITS = 3
export const HINT_MS = 6000

export function readHintCount(storage = globalThis.localStorage) {
  try {
    const count = Number.parseInt(storage.getItem(HINT_SEEN_KEY), 10)
    return Number.isFinite(count) && count > 0 ? count : 0
  } catch {
    return 0
  }
}

export function writeHintCount(count, storage = globalThis.localStorage) {
  try {
    storage.setItem(HINT_SEEN_KEY, String(count))
  } catch {
    // storage can be blocked; the hint then shows on every visit
  }
}

// a plain E press outside a text field
export function isInteractKey(event) {
  if (event.code !== 'KeyE' || event.repeat || event.defaultPrevented) return false
  if (event.ctrlKey || event.metaKey || event.altKey) return false
  return !event.target?.closest?.(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
  )
}

// a plain Enter press that is free to go in: not in a field, a control that activates itself or a dialog
export function isEnterKey(event) {
  if (event.code !== 'Enter' && event.code !== 'NumpadEnter') return false
  if (event.repeat || event.defaultPrevented) return false
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false
  return !event.target?.closest?.(
    'input, textarea, select, button, summary, a[href], [role="button"], [role="dialog"], [aria-modal="true"], dialog, [contenteditable]:not([contenteditable="false"])',
  )
}

// a Shift press outside a text field or dialog; holding it does not repeat a burst
export function isSprintKey(event) {
  if (event.code !== 'ShiftLeft' && event.code !== 'ShiftRight') return false
  if (event.repeat || event.defaultPrevented) return false
  if (event.ctrlKey || event.metaKey || event.altKey) return false
  return !event.target?.closest?.(
    'input, textarea, select, [role="dialog"], [aria-modal="true"], dialog, [contenteditable]:not([contenteditable="false"])',
  )
}
