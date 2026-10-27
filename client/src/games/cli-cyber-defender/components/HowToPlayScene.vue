<script setup>
import DemoTerminal from './DemoTerminal.vue'

const props = defineProps({
  step: { type: Number, default: 0 },
})

const CAPTIONS = [
  'Alert: read who is attacking what',
  'Type the command, then press Enter',
  'Contained: +100, then +200, then +300',
  'Debrief: the command, the reason, the topic',
]
</script>

<template>
  <div class="cli-howto-scene">
    <DemoTerminal />
    <p class="cli-howto-caption">{{ CAPTIONS[props.step] ?? CAPTIONS[0] }}</p>
  </div>
</template>

<style scoped>
.cli-howto-scene {
  display: grid;
  gap: 0.5rem;
}

.cli-howto-caption {
  margin: 0;
  padding: 0.25rem 0.5rem;
  font-size: 0.85rem;
  color: var(--game-amber);
  border-left: 3px solid var(--game-amber);
}
</style>
