<script setup>
import { ref } from 'vue'

defineProps({
  name: { type: String, required: true },
  line: { type: String, required: true },
  last: { type: Boolean, default: false },
  // game keepers can send the player in; wanderers only say goodbye
  canEnter: { type: Boolean, default: false },
})
defineEmits(['next', 'enter', 'close'])
const panel = ref(null)
defineExpose({ focus: () => panel.value?.focus() })
</script>

<template>
  <div
    ref="panel"
    class="npc-dialogue"
    role="dialog"
    aria-labelledby="npc-dialogue-name"
    data-testid="npc-dialogue"
    tabindex="-1"
  >
    <h2 id="npc-dialogue-name" class="npc-name">{{ name }}</h2>
    <p class="npc-line" data-testid="npc-line">{{ line }}</p>
    <div class="npc-actions">
      <button
        v-if="!last"
        type="button"
        class="btn btn-primary btn-sm"
        data-testid="npc-next"
        @click="$emit('next')"
      >
        Next
      </button>
      <template v-else-if="canEnter">
        <button
          type="button"
          class="btn btn-primary btn-sm"
          data-testid="npc-enter"
          @click="$emit('enter')"
        >
          Go in
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          data-testid="npc-close"
          @click="$emit('close')"
        >
          Close
        </button>
      </template>
      <button
        v-else
        type="button"
        class="btn btn-primary btn-sm"
        data-testid="npc-close"
        @click="$emit('close')"
      >
        Bye
      </button>
    </div>
  </div>
</template>

<style scoped>
.npc-dialogue {
  width: min(420px, calc(100% - 16px));
  padding: 8px 12px 10px;
  border: 2px solid var(--town-edge);
  background: var(--town-paper);
  pointer-events: auto;
}
.npc-dialogue:focus-visible {
  outline: 3px solid var(--accent-primary);
  outline-offset: 2px;
}
.npc-name {
  margin: 0 0 4px;
  font-size: 16px;
}
.npc-line {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.4;
}
.npc-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.npc-actions .btn {
  min-height: 36px;
}
@media (max-width: 575.98px) {
  .npc-dialogue {
    width: 100%;
  }
  .npc-actions .btn {
    min-height: 44px;
  }
}
</style>
