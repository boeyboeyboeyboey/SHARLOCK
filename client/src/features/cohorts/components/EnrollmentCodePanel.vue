<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  code: { type: Object, default: null },
  invitationUrl: { type: String, default: '' },
  expiresAt: { type: String, default: '' },
  revision: { type: Number, default: 0 },
  pending: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
})
const emit = defineEmits(['generate', 'revoke', 'clear'])
const rawCode = ref('')
const copied = ref(false)
const copyError = ref(false)
const formattedCode = computed(() => {
  const normalized = rawCode.value.replace(/[-\s]/g, '')
  return normalized.match(/.{1,4}/g)?.join('-') || ''
})

async function copyCode() {
  copyError.value = false
  try {
    await navigator.clipboard.writeText(formattedCode.value)
    copied.value = true
  } catch {
    copied.value = false
    copyError.value = true
  }
}
async function copyLink() {
  copyError.value = false
  try {
    await navigator.clipboard.writeText(props.invitationUrl)
    copied.value = true
  } catch {
    copied.value = false
    copyError.value = true
  }
}
function receiveCode(value) {
  rawCode.value = value
}
function clearCode() {
  rawCode.value = ''
  copied.value = false
  copyError.value = false
}
function closeCode() {
  clearCode()
  emit('clear')
}
defineExpose({ receiveCode, clearCode })
</script>

<template>
  <section class="cohort-panel" aria-labelledby="enrollment-code-title">
    <h2 id="enrollment-code-title">Class invitation code</h2>
    <template v-if="rawCode">
      <p role="status">Share this code with your class. It will only be shown once.</p>
      <p class="cohort-code" aria-label="New class invitation code">{{ formattedCode }}</p>
      <label class="cohort-field">
        Invitation link
        <input :value="invitationUrl" readonly aria-label="Invitation link" />
      </label>
      <p v-if="expiresAt">Expires {{ new Date(expiresAt).toLocaleString() }}</p>
      <p v-if="copyError" class="cohort-alert" role="alert">
        Clipboard access was unavailable. You can select and copy the code.
      </p>
      <button class="btn btn-primary" type="button" :disabled="pending" @click="copyCode">
        {{ copied ? 'Copied' : 'Copy code' }}
      </button>
      <button class="btn btn-secondary" type="button" :disabled="pending" @click="copyLink">
        Copy invitation link
      </button>
      <button class="btn btn-secondary" type="button" :disabled="pending" @click="closeCode">
        Close and clear code
      </button>
    </template>
    <template v-else-if="code && !code.revokedAt">
      <p>
        Code active until {{ new Date(code.expiresAt).toLocaleString() }}. The code itself cannot be
        viewed again.
      </p>
      <button
        class="btn btn-secondary"
        type="button"
        :disabled="pending || loading"
        @click="$emit('revoke', { id: code.id, revision })"
      >
        Revoke code
      </button>
      <button
        class="btn btn-primary"
        type="button"
        :disabled="pending || loading"
        @click="$emit('generate', revision)"
      >
        Replace code
      </button>
    </template>
    <template v-else>
      <p>No active class code. Generate a seven-day invitation.</p>
      <button
        class="btn btn-primary"
        type="button"
        :disabled="pending || loading"
        @click="$emit('generate', revision)"
      >
        {{ pending ? 'Generating…' : 'Generate code' }}
      </button>
    </template>
  </section>
</template>
