<script setup>
import { nextTick, onMounted, ref } from 'vue'

const emit = defineEmits(['cancel', 'confirm'])
const dialog = ref(null)
const cancelButton = ref(null)
let opener = null

onMounted(async () => {
  opener = document.activeElement
  await nextTick()
  cancelButton.value?.focus()
})

function close(event) {
  emit(event)
  // focus goes back to the toggle that opened the dialog
  nextTick(() => opener?.isConnected && opener.focus?.())
}

// keeps Tab inside the dialog while it is open
function trap(event) {
  if (event.key !== 'Tab') return
  const items = [...dialog.value.querySelectorAll('button')]
  const first = items[0]
  const last = items[items.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
</script>

<template>
  <div class="modal-backdrop fade show warning-backdrop" @click="close('cancel')"></div>
  <div
    ref="dialog"
    class="modal fade show d-block"
    tabindex="-1"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="hub-3d-warning-title"
    aria-describedby="hub-3d-warning-text"
    data-testid="hub-3d-warning"
    @click.self="close('cancel')"
    @keydown.esc.stop="close('cancel')"
    @keydown="trap"
  >
    <div class="modal-dialog modal-dialog-centered">
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
    </div>
  </div>
</template>

<style scoped>
.warning-backdrop {
  z-index: 1054;
}
.modal {
  z-index: 1055;
}
</style>
