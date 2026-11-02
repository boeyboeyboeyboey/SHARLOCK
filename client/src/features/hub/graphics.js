export const GRAPHICS_KEY = 'sharlock.graphics'
export const GRAPHICS_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]
const VALUES = GRAPHICS_OPTIONS.map((option) => option.value)

export function readGraphics() {
  try {
    const stored = localStorage.getItem(GRAPHICS_KEY)
    return VALUES.includes(stored) ? stored : 'auto'
  } catch {
    return 'auto'
  }
}

export function writeGraphics(value) {
  if (!VALUES.includes(value)) return
  try {
    localStorage.setItem(GRAPHICS_KEY, value)
  } catch {
    // storage can be blocked; the choice then lasts for this visit only
  }
}
