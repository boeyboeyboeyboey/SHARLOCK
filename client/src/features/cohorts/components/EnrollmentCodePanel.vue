<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import InlineConfirm from './InlineConfirm.vue'

const props = defineProps({
  code: { type: Object, default: null },
  invitationUrl: { type: String, default: '' },
  expiresAt: { type: String, default: '' },
  revision: { type: Number, default: 0 },
  pending: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  unavailable: { type: Boolean, default: false },
})
const emit = defineEmits(['generate', 'revoke', 'clear'])
const rawCode = ref('')
const copied = ref(false)
const copyError = ref(false)
const confirming = ref('')
const heading = ref(null)
const formattedCode = computed(() => {
  const normalized = rawCode.value.replace(/[-\s]/g, '')
  return normalized.match(/.{1,4}/g)?.join('-') || ''
})
const codeIsLive = computed(
  () =>
    Boolean(props.code) &&
    !props.code.revokedAt &&
    new Date(props.code.expiresAt).getTime() > Date.now(),
)

watch(
  () => props.code,
  () => {
    confirming.value = ''
  },
)

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
// the confirm unmounts on answering, so focus moves to the heading rather than dropping to the page
async function focusHeading() {
  await nextTick()
  heading.value?.focus()
}
function confirmReplace() {
  confirming.value = ''
  void focusHeading()
  emit('generate', props.revision)
}
function confirmRevoke() {
  confirming.value = ''
  void focusHeading()
  emit('revoke', { id: props.code.id, revision: props.revision })
}
defineExpose({ receiveCode, clearCode })
</script>

<template>
  <section class="cohort-panel" aria-labelledby="enrollment-code-title">
    <h2 id="enrollment-code-title" ref="heading" tabindex="-1">Class invitation code</h2>
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
      <div class="cohort-actions">
        <button class="btn btn-primary" type="button" :disabled="pending" @click="copyCode">
          {{ copied ? 'Copied' : 'Copy code' }}
        </button>
        <button class="btn btn-secondary" type="button" :disabled="pending" @click="copyLink">
          Copy invitation link
        </button>
        <button class="btn btn-secondary" type="button" :disabled="pending" @click="closeCode">
          Close and clear code
        </button>
      </div>
    </template>
    <p v-else-if="unavailable">This class's code could not be checked.</p>
    <template v-else-if="codeIsLive">
      <p>
        Code active until {{ new Date(code.expiresAt).toLocaleString() }}. The code itself cannot be
        viewed again.
      </p>
      <div class="cohort-actions">
        <button
          class="btn btn-secondary"
          type="button"
          :disabled="pending || loading"
          @click="confirming = 'revoke'"
        >
          Revoke code
        </button>
        <button
          class="btn btn-secondary"
          type="button"
          :disabled="pending || loading"
          @click="confirming = 'replace'"
        >
          Replace code
        </button>
      </div>
      <InlineConfirm
        v-if="confirming === 'revoke'"
        message="Revoke this code? Students using it will be refused."
        confirm-label="Yes, revoke it"
        cancel-label="Keep this code"
        @confirm="confirmRevoke"
        @cancel="confirming = ''"
      />
      <InlineConfirm
        v-else-if="confirming === 'replace'"
        message="Replace this code? Students using the old code will be refused."
        confirm-label="Yes, replace it"
        cancel-label="Keep this code"
        @confirm="confirmReplace"
        @cancel="confirming = ''"
      />
    </template>
    <template v-else>
      <p>No active class code. Generate a seven-day invitation.</p>
      <button
        class="btn btn-primary cohort-action"
        type="button"
        :disabled="pending || loading"
        @click="$emit('generate', revision)"
      >
        {{ pending ? 'Generating…' : 'Generate code' }}
      </button>
    </template>
  </section>
</template>
