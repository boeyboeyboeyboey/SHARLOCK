<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'

const HOLD_MS = 2500

const props = defineProps({
  selfInfected: { type: Boolean, default: false },
  watching: { type: Boolean, default: false },
})

const kind = ref('')
let timer = 0

function show(next) {
  clearTimeout(timer)
  kind.value = next
  timer = setTimeout(() => {
    kind.value = ''
  }, HOLD_MS)
}

// the hud mounts when the round starts playing, so this is the round-start banner
if (!props.watching) show(props.selfInfected ? 'infected' : 'clean')

watch(
  () => props.selfInfected,
  (now, before) => {
    if (now && !before && !props.watching) show('infected')
  },
)

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <Transition name="tag-banner">
    <div
      v-if="kind"
      :key="kind"
      class="tag-banner"
      :class="`is-${kind}`"
      role="status"
      aria-live="polite"
      data-testid="tag-banner"
    >
      <template v-if="kind === 'infected'">
        <b>INFECTED</b>
        <span>Tag everyone!</span>
      </template>
      <template v-else>
        <b>CLEAN</b>
        <span>Survive 2:00 · patch stations for immunity</span>
      </template>
    </div>
  </Transition>
</template>
