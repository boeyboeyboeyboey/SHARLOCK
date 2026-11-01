<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

defineProps({
  message: { type: String, required: true },
  confirmLabel: { type: String, required: true },
  cancelLabel: { type: String, default: 'Cancel' },
})
const emit = defineEmits(['confirm', 'cancel'])

const cancelButton = ref(null)
const opener = document.activeElement
let backedOut = false

function cancel() {
  backedOut = true
  emit('cancel')
}

// the safe choice takes focus first, and backing out returns it to the control that opened this
onMounted(() => cancelButton.value?.focus())
onBeforeUnmount(() => {
  if (backedOut && opener?.isConnected) opener.focus()
})
</script>

<template>
  <div class="inline-confirm" role="group" :aria-label="message" @keydown.esc.prevent.stop="cancel">
    <p class="inline-confirm__message">{{ message }}</p>
    <div class="inline-confirm__actions">
      <button ref="cancelButton" class="inline-confirm__button" type="button" @click="cancel">
        {{ cancelLabel }}
      </button>
      <button
        class="inline-confirm__button inline-confirm__button--danger"
        type="button"
        @click="emit('confirm')"
      >
        {{ confirmLabel }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.inline-confirm {
  display: grid;
  gap: 0.6rem;
  padding: 0.75rem;
  border: 2px solid var(--border-strong);
  background: var(--alert-warning);
}

.inline-confirm__message {
  margin: 0;
  font-weight: 700;
}

.inline-confirm__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.inline-confirm__button {
  min-height: 44px;
  padding: 0.45rem 0.8rem;
  border: 2px solid var(--border-strong);
  border-radius: 0;
  background: var(--surface);
  color: var(--text-main);
  font: inherit;
  font-weight: 700;
}

.inline-confirm__button--danger {
  background: var(--alert-danger);
  color: #fff;
}

.inline-confirm__button:focus-visible {
  outline: 3px solid var(--text-main);
  outline-offset: 3px;
}
</style>
