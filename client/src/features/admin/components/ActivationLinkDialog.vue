<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import InlineConfirm from '../../cohorts/components/InlineConfirm.vue'

const props = defineProps({
  link: { type: Object, required: true },
})
const emit = defineEmits(['close'])
const dialog = ref(null)
const copied = ref(false)
const copyError = ref('')
const confirmingClose = ref(false)

function expirationLabel(value) {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return 'This link expires within 24 hours.'
  return `Expires ${new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp)}.`
}

function handleClose() {
  emit('close')
}

function closeDialog() {
  if (dialog.value?.open && typeof dialog.value.close === 'function') {
    dialog.value.close()
  } else {
    handleClose()
  }
}

function requestClose() {
  if (copied.value) closeDialog()
  else confirmingClose.value = true
}

// escape must not lose an uncopied link either
function handleCancel(event) {
  if (copied.value) return
  event.preventDefault()
  confirmingClose.value = true
}

async function copyLink() {
  copied.value = false
  copyError.value = ''
  confirmingClose.value = false
  try {
    await navigator.clipboard.writeText(props.link.activationUrl)
    copied.value = true
  } catch {
    copyError.value = 'Copy is unavailable. Select the link and copy it manually.'
  }
}

onMounted(async () => {
  await nextTick()
  if (typeof dialog.value?.showModal === 'function') dialog.value.showModal()
  else dialog.value?.setAttribute('open', '')
  dialog.value?.querySelector('button')?.focus()
})

onBeforeUnmount(() => {
  copied.value = false
  copyError.value = ''
  if (dialog.value?.open && typeof dialog.value.close === 'function') dialog.value.close()
})
</script>

<template>
  <dialog
    ref="dialog"
    class="admin-workspace__dialog"
    aria-labelledby="activation-link-title"
    @cancel="handleCancel"
    @close="handleClose"
  >
    <div class="admin-workspace__dialog-card">
      <h2 id="activation-link-title">Deliver this link privately</h2>
      <p v-if="link.username">
        Link for <strong>{{ link.username }}</strong
        ><template v-if="link.email"> ({{ link.email }})</template>
      </p>
      <p>Copy this link now. It won't be shown again. It works once and expires in 24 hours.</p>
      <label for="admin-activation-link">Activation link</label>
      <input
        id="admin-activation-link"
        class="admin-workspace__activation-url"
        type="url"
        :value="link.activationUrl"
        readonly
        spellcheck="false"
      />
      <p class="admin-workspace__expiry">{{ expirationLabel(link.expiresAt) }}</p>
      <p v-if="copied" role="status">Link copied. Deliver it through a private channel.</p>
      <p v-if="copyError" class="admin-workspace__alert" role="alert">{{ copyError }}</p>
      <div class="admin-workspace__actions">
        <button class="admin-workspace__button" type="button" @click="copyLink">
          Copy activation link
        </button>
        <button class="admin-workspace__text-button" type="button" @click="requestClose">
          Close
        </button>
      </div>
      <InlineConfirm
        v-if="confirmingClose"
        message="Close without copying? You would have to issue a new link."
        confirm-label="Yes, close"
        cancel-label="Keep open"
        @confirm="closeDialog"
        @cancel="confirmingClose = false"
      />
    </div>
  </dialog>
</template>
