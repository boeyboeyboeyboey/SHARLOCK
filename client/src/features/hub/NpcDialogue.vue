<script setup>
import { nextTick, ref, watch } from 'vue'

const props = defineProps({
  name: { type: String, required: true },
  line: { type: String, required: true },
  last: { type: Boolean, default: false },
  // game keepers can send the player in; wanderers only say goodbye
  canEnter: { type: Boolean, default: false },
  closeLabel: { type: String, default: 'Bye' },
})
defineEmits(['next', 'enter', 'close'])
const panel = ref(null)
const actions = ref(null)
const lineEl = ref(null)
// a new line starts at its top, even if the last one was scrolled
watch(
  () => props.line,
  () => {
    if (lineEl.value) lineEl.value.scrollTop = 0
  },
)
// the last line swaps the next button for others, and focus must not fall to the page when it goes
watch(
  () => props.last,
  async (last) => {
    if (!last || !panel.value?.contains(document.activeElement)) return
    await nextTick()
    actions.value?.querySelector('button')?.focus()
  },
)
defineExpose({ focus: () => panel.value?.focus() })
</script>

<template>
  <div
    ref="panel"
    class="npc-dialogue hub-glass"
    role="dialog"
    aria-labelledby="npc-dialogue-name"
    data-testid="npc-dialogue"
    tabindex="-1"
  >
    <h2 id="npc-dialogue-name" class="npc-name">{{ name }}</h2>
    <p ref="lineEl" class="npc-line" data-testid="npc-line" aria-live="polite">{{ line }}</p>
    <div ref="actions" class="npc-actions">
      <button
        v-if="!last"
        type="button"
        class="btn btn-primary btn-sm hub-glass-btn hub-glass-btn-primary"
        data-testid="npc-next"
        @click="$emit('next')"
      >
        Next
      </button>
      <template v-else-if="canEnter">
        <button
          type="button"
          class="btn btn-primary btn-sm hub-glass-btn hub-glass-btn-primary"
          data-testid="npc-enter"
          @click="$emit('enter')"
        >
          Go in
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-sm hub-glass-btn"
          data-testid="npc-close"
          @click="$emit('close')"
        >
          Close
        </button>
      </template>
      <button
        v-else
        type="button"
        class="btn btn-primary btn-sm hub-glass-btn hub-glass-btn-primary"
        data-testid="npc-close"
        @click="$emit('close')"
      >
        {{ closeLabel }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.npc-dialogue {
  display: flex;
  flex-direction: column;
  width: min(420px, calc(100% - 16px));
  padding: 12px 14px;
  pointer-events: auto;
}
.npc-dialogue:focus-visible {
  outline: 3px solid var(--hub-glass-focus);
  outline-offset: 2px;
}
.npc-name {
  margin: 0 0 4px;
  color: inherit;
  font-size: 16px;
}
.npc-line {
  /* a short panel scrolls the line, so the buttons below it stay on screen */
  min-height: 0;
  overflow-y: auto;
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.4;
}
.npc-actions {
  flex: none;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
@media (max-width: 575.98px) {
  .npc-dialogue {
    width: 100%;
  }
}
</style>
