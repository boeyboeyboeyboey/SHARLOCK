<script setup>
import { nextTick, onMounted, ref, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  message: { type: String, default: '' },
  confirmLabel: { type: String, default: 'Confirm' },
  cancelLabel: { type: String, default: 'Cancel' },
})
const emit = defineEmits(['confirm', 'cancel'])

const dialog = ref(null)
const cancelButton = ref(null)
const uid = Math.random().toString(36).slice(2, 8)
const titleId = `confirm-${uid}-title`
const messageId = `confirm-${uid}-message`
let opener = null
let settled = false

function sync(isOpen) {
  const element = dialog.value
  if (!element) return
  if (isOpen && !element.open) {
    opener = document.activeElement
    settled = false
    element.showModal()
    // the safe choice takes focus first
    nextTick(() => cancelButton.value?.focus())
  } else if (!isOpen && element.open) {
    element.close()
  }
}

// every close path ends here, so focus always returns to the opener
function onClose() {
  if (!settled && props.open) {
    settled = true
    emit('cancel')
  }
  if (opener && typeof opener.focus === 'function' && opener.isConnected) opener.focus()
  opener = null
}

function confirm() {
  settled = true
  emit('confirm')
}
function cancel() {
  settled = true
  emit('cancel')
}
// a click on the backdrop lands on the dialog element itself
function onBackdrop(event) {
  if (event.target === dialog.value) cancel()
}

watch(() => props.open, sync, { flush: 'post' })
onMounted(() => sync(props.open))
</script>

<template>
  <dialog
    ref="dialog"
    class="confirm-dialog"
    :aria-labelledby="titleId"
    :aria-describedby="message ? messageId : undefined"
    data-testid="confirm-dialog"
    @cancel.prevent="cancel"
    @close="onClose"
    @click="onBackdrop"
  >
    <div class="confirm-body">
      <h2 :id="titleId" class="confirm-title">{{ title }}</h2>
      <p v-if="message" :id="messageId" class="confirm-message">{{ message }}</p>
      <div class="confirm-actions">
        <button
          ref="cancelButton"
          type="button"
          class="confirm-button"
          data-testid="confirm-cancel"
          @click="cancel"
        >
          {{ cancelLabel }}
        </button>
        <button
          type="button"
          class="confirm-button confirm-danger"
          data-testid="confirm-accept"
          @click="confirm"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.confirm-dialog {
  width: min(24rem, calc(100% - 1.5rem));
  padding: 0;
  color: var(--text-main, #334155);
  background: var(--surface, #fff8df);
  border: 3px solid var(--border-strong, #50634d);
  border-radius: 0;
  box-shadow: 4px 4px 0 var(--border-strong, #50634d);
  font-family: var(--font-body, sans-serif);
}

.confirm-dialog::backdrop {
  background: rgb(27 36 48 / 55%);
}

.confirm-body {
  display: grid;
  gap: 0.75rem;
  padding: 1.1rem;
}

.confirm-title {
  margin: 0;
  font-size: 1.3rem;
  line-height: 1.2;
}

.confirm-message {
  margin: 0;
}

.confirm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  justify-content: flex-end;
}

.confirm-button {
  min-width: 44px;
  min-height: 44px;
  padding: 0.35rem 1rem;
  font: inherit;
  font-weight: 700;
  color: inherit;
  background: var(--bg-primary, #dfead6);
  border: 2px solid var(--border-strong, #50634d);
  cursor: pointer;
}

.confirm-danger {
  color: #fff;
  background: #8c2f2f;
}

.confirm-button:focus-visible {
  outline: 3px solid var(--border-strong, #50634d);
  outline-offset: 2px;
}
</style>
