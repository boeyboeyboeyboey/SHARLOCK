<script setup>
import { computed } from 'vue'
import {
  WIPE_COLUMNS,
  WIPE_PATTERNS,
  WIPE_ROWS,
  sectionConfig,
  wipe,
  wipeDuration,
} from '../pixel-wipe.js'
import PixelEmoji from './PixelEmoji.vue'
import '../pixel-wipe.css'

const section = computed(() => sectionConfig(wipe.section))

// each block appears (or clears) in one hard step at the moment its section's pattern gives it
const cells = computed(() => {
  if (section.value.kind !== 'blocks') return []
  const pattern = WIPE_PATTERNS[section.value.pattern]
  return Array.from({ length: WIPE_COLUMNS * WIPE_ROWS }, (_, index) => ({
    delay: pattern(index % WIPE_COLUMNS, Math.floor(index / WIPE_COLUMNS)),
  }))
})
const labelDelay = computed(() =>
  Math.round(wipeDuration(wipe.section) * (section.value.labelAt ?? 0.35)),
)
</script>

<template>
  <div
    v-if="wipe.phase !== 'idle'"
    class="pixel-wipe"
    data-testid="pixel-wipe"
    :class="[`pixel-wipe--${wipe.phase}`, `pixel-wipe--${wipe.section}`]"
    :style="{
      '--wipe-columns': WIPE_COLUMNS,
      '--wipe-rows': WIPE_ROWS,
      '--wipe-color': section.color,
      '--label-delay': `${labelDelay}ms`,
      '--door-ms': `${wipeDuration(wipe.section)}ms`,
    }"
  >
    <div v-if="section.kind === 'doors'" class="pixel-doors" aria-hidden="true">
      <div class="pixel-door pixel-door--left"></div>
      <div class="pixel-door pixel-door--right"></div>
    </div>
    <div v-else class="pixel-wipe__grid" aria-hidden="true">
      <span
        v-for="(cell, index) in cells"
        :key="index"
        class="pixel-wipe__cell"
        :style="{ '--delay': `${cell.delay}ms` }"
      ></span>
    </div>
    <div class="pixel-wipe__label">
      <PixelEmoji :emoji="section.emoji" class="pixel-wipe__emoji" />
      <p role="status">{{ section.label }}</p>
    </div>
  </div>
</template>
