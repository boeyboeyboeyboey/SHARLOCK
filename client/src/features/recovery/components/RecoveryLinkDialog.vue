<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  link: { type: Object, required: true },
})
const emit = defineEmits(['close'])
const dialog = ref(null)
const copied = ref(false)
const copyError = ref('')
let returnFocus = null
let closed = false

function expirationLabel(value) {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return 'This link expires soon.'
  return `Expires ${new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp)}.`
}

function emitClose() {
  if (closed) return
  closed = true
  emit('close')
}

function closeDialog() {
  emitClose()
}

async function copyLink() {
  copied.value = false
  copyError.value = ''
  try {
    await navigator.clipboard.writeText(props.link.resetUrl)
    copied.value = true
  } catch {
    copyError.value = 'Copy is unavailable. Select the link and copy it manually.'
  }
}

onMounted(async () => {
  returnFocus = document.activeElement
  await nextTick()
  if (typeof dialog.value?.showModal === 'function') dialog.value.showModal()
  else dialog.value?.setAttribute('open', '')
  dialog.value?.querySelector('button')?.focus()
})

onBeforeUnmount(() => {
  copied.value = false
  copyError.value = ''
  closed = true
  if (dialog.value?.open && typeof dialog.value.close === 'function') dialog.value.close()
  void nextTick(() => {
    if (returnFocus?.isConnected) returnFocus.focus()
  })
})
</script>

<template>
  <dialog
    ref="dialog"
    class="recovery-dialog"
    aria-labelledby="recovery-link-title"
    @close="emitClose"
    @cancel.prevent="closeDialog"
    @keydown.esc.prevent.stop="emitClose"
  >
    <div class="recovery-dialog__card">
      <p class="recovery-eyebrow">PRIVATE STUDENT LINK</p>
      <h2 id="recovery-link-title">Deliver this reset link privately</h2>
      <p>
        Copy this link now. It won't be shown again; it still works once and expires in 30 minutes.
      </p>
      <label class="recovery-label" for="recovery-link-value">Reset link</label>
      <input
        id="recovery-link-value"
        class="recovery-input recovery-link-value"
        type="url"
        :value="link.resetUrl"
        readonly
        spellcheck="false"
      />
      <p class="recovery-muted">{{ expirationLabel(link.expiresAt) }}</p>
      <p v-if="copied" class="recovery-notice" role="status">
        Link copied. Deliver it through a private channel.
      </p>
      <p v-if="copyError" class="recovery-alert" role="alert">{{ copyError }}</p>
      <div class="recovery-dialog__actions">
        <button class="btn btn-primary recovery-button" type="button" @click="copyLink">
          Copy reset link
        </button>
        <button class="btn btn-secondary recovery-button" type="button" @click="closeDialog">
          Close
        </button>
      </div>
    </div>
  </dialog>
</template>
