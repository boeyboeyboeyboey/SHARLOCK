<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, required: true },
  size: { type: Number, default: 20 },
})

// original line icons drawn on a 24px grid; every shape uses currentColor
const ICONS = {
  score: ['M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z'],
  streak: [
    'M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.3 1.2-3.8 2.4-5 .2 1.7 1 2.8 2.1 3.3C11.3 8.6 11 5.6 12 3z',
  ],
  window: ['M7 3h10M7 21h10', 'M8 3c0 5 8 5 8 9s-8 4-8 9', 'M16 3c0 5-8 5-8 9s8 4 8 9'],
  handled: ['M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z', 'M8.5 12l2.5 2.5 4.5-5'],
  hint: [
    'M9 18h6M10 21h4',
    'M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z',
  ],
  'sound-on': ['M4 9h4l5-4v14l-5-4H4z', 'M16.5 8.5a5 5 0 0 1 0 7', 'M19 6a8.5 8.5 0 0 1 0 12'],
  'sound-off': ['M4 9h4l5-4v14l-5-4H4z', 'M17 9l5 6M22 9l-5 6'],
  stop: ['M6 6h12v12H6z'],
  run: ['M20 5v8a2 2 0 0 1-2 2H6', 'M10 11l-4 4 4 4'],
  'block-ip': ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M5.6 5.6l12.8 12.8'],
  'disable-user': [
    'M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    'M3 21c0-3.9 3.1-7 7-7 1.2 0 2.3.3 3.3.8',
    'M16 16l5 5M21 16l-5 5',
  ],
  'isolate-host': ['M3 4h18v12H3z', 'M8 20h8M12 16v4', 'M9 7l6 6M15 7l-6 6'],
  logs: ['M5 3h10l4 4v14H5z', 'M15 3v4h4', 'M8 12h8M8 16h6'],
  whois: ['M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15z', 'M16 16l5 5'],
  dismiss: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M8 12.5l2.7 2.7L16 9.5'],
  alert: ['M12 3l10 18H2z', 'M12 10v5M12 18v.5'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  cross: ['M6 6l12 12M18 6L6 18'],
  missed: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 3'],
  skipped: ['M5 5l7 7-7 7', 'M13 5l7 7-7 7'],
  replay: ['M4 12a8 8 0 1 0 2.4-5.7', 'M4 4v5h5'],
  pause: ['M8 5v14M16 5v14'],
  menu: ['M4 6h16M4 12h16M4 18h16'],
  play: ['M7 4.5v15l12-7.5z'],
}

const paths = computed(() => ICONS[props.name] ?? [])
</script>

<template>
  <svg
    class="cli-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path v-for="(path, index) in paths" :key="index" :d="path" />
  </svg>
</template>
