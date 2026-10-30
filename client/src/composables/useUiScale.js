import { computed, ref, watch } from 'vue'

export const UI_SCALE_KEY = 'sharlock.uiScale'
export const UI_SIZES = [
  { value: 'small', label: 'Small', scale: 0.75 },
  { value: 'medium', label: 'Medium', scale: 0.85 },
  { value: 'large', label: 'Large', scale: 1 },
]
export const DEFAULT_UI_SIZE = 'medium'

export function readUiSize() {
  try {
    const stored = localStorage.getItem(UI_SCALE_KEY)
    return UI_SIZES.some((size) => size.value === stored) ? stored : DEFAULT_UI_SIZE
  } catch {
    return DEFAULT_UI_SIZE
  }
}

function writeUiSize(value) {
  try {
    localStorage.setItem(UI_SCALE_KEY, value)
  } catch {
    // storage can be blocked; the choice then lasts for this visit only
  }
}

export function scaleFor(value) {
  return (UI_SIZES.find((size) => size.value === value) ?? UI_SIZES[1]).scale
}

// shared by the settings overlay and the landing page, so one choice reaches every scaled layer
const size = ref(readUiSize())
const scale = computed(() => scaleFor(size.value))

export function applyUiScale(value = scale.value) {
  document.documentElement.style.setProperty('--ui-scale', String(value))
}

export function setUiSize(value) {
  if (!UI_SIZES.some((option) => option.value === value)) return
  size.value = value
  writeUiSize(value)
}

watch(scale, (value) => applyUiScale(value), { flush: 'sync' })

export function useUiScale() {
  size.value = readUiSize()
  applyUiScale()
  return { size, scale, options: UI_SIZES, setSize: setUiSize }
}
