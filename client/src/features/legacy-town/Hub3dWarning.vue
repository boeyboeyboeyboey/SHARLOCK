<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const emit = defineEmits(['cancel', 'confirm'])
const dialog = ref(null)
const cancelButton = ref(null)
let opener = null

onMounted(async () => {
  opener = document.activeElement
  // a native modal lives in the top layer, so it also shows over the settings dialog that may have opened it
  const el = dialog.value
  if (typeof el.showModal === 'function') el.showModal()
  else el.setAttribute('open', '')
  await nextTick()
  cancelButton.value?.focus()
})
onBeforeUnmount(() => dialog.value?.close?.())

function close(event) {
  emit(event)
  // focus goes back to the toggle that opened the dialog
  nextTick(() => opener?.isConnected && opener.focus?.())
}
</script>

<template>
  <dialog
    ref="dialog"
    class="hub-3d-warning"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="hub-3d-warning-title"
    aria-describedby="hub-3d-warning-text"
    data-testid="hub-3d-warning"
    @click.self="close('cancel')"
    @cancel.prevent="close('cancel')"
    @keydown.esc.stop
  >
    <div class="modal-content">
      <div class="modal-header">
        <h2 id="hub-3d-warning-title" class="modal-title fs-5">Try the 3D town?</h2>
      </div>
      <div class="modal-body">
        <p id="hub-3d-warning-text" class="mb-0">
          This device may struggle to run the 3D town. It could be slow or drain the battery.
        </p>
      </div>
      <div class="modal-footer">
        <button
          ref="cancelButton"
          type="button"
          class="btn btn-secondary"
          data-testid="hub-3d-cancel"
          @click="close('cancel')"
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn btn-primary"
          data-testid="hub-3d-confirm"
          @click="close('confirm')"
        >
          Try 3D
        </button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.hub-3d-warning {
  /* bootstrap sets these on .modal, which a native dialog does not use */
  --bs-modal-bg: var(--surface);
  --bs-modal-color: var(--text-main);
  --bs-modal-border-width: 3px;
  --bs-modal-border-color: var(--border-strong);
  --bs-modal-header-padding: 1rem 1rem 0;
  --bs-modal-padding: 1rem;
  --bs-modal-footer-gap: 0.5rem;

  width: calc(100% - 1rem);
  max-width: 500px;
  margin: auto;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: var(--shadow-pixel);
}
.hub-3d-warning::backdrop {
  background: rgb(0 0 0 / 50%);
}
</style>
