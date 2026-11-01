<script setup>
import { nextTick, ref, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  id: { type: String, required: true },
  title: { type: String, required: true },
  confirmLabel: { type: String, default: 'Confirm' },
  cancelLabel: { type: String, default: 'Cancel' },
  focus: { type: String, default: 'confirm' },
})
const emit = defineEmits(['confirm', 'cancel', 'closed'])

const dialog = ref(null)
const confirmButton = ref(null)
const cancelButton = ref(null)

// the native modal dialog traps focus and turns escape into a cancel event
watch(
  () => props.open,
  async (isOpen) => {
    await nextTick()
    const element = dialog.value
    if (!element) return
    if (isOpen && !element.open) {
      if (element.showModal) element.showModal()
      else element.setAttribute('open', '')
      const first = props.focus === 'cancel' ? cancelButton : confirmButton
      first.value?.focus()
    } else if (!isOpen && element.open) {
      if (element.close) element.close()
      else element.removeAttribute('open')
      emit('closed')
    }
  },
  { immediate: true },
)

function onCancel(event) {
  event.preventDefault()
  emit('cancel')
}
</script>

<template>
  <dialog
    ref="dialog"
    class="cli-dialog"
    :aria-labelledby="`${id}-title`"
    @cancel="onCancel"
    @click.self="emit('cancel')"
  >
    <div class="cli-dialog-body">
      <h2 :id="`${id}-title`" class="cli-heading">{{ title }}</h2>
      <slot />
      <div class="cli-dialog-actions">
        <button ref="cancelButton" type="button" class="btn" @click="emit('cancel')">
          {{ cancelLabel }}
        </button>
        <button
          ref="confirmButton"
          type="button"
          class="btn cli-btn-primary"
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </dialog>
</template>
