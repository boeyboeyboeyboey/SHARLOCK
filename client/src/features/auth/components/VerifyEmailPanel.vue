<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const CODE_LENGTH = 6

const props = defineProps({
  verification: { type: Object, required: true },
  pending: { type: Boolean, default: false },
  error: { type: String, default: '' },
})
const emit = defineEmits(['submit', 'resend', 'cancel'])

const digits = ref(Array.from({ length: CODE_LENGTH }, () => ''))
const inputs = ref([])
const shaking = ref(false)
const resent = ref(false)
const now = ref(Date.now())
let timer = null

const code = computed(() => digits.value.join(''))
const complete = computed(() => code.value.length === CODE_LENGTH)
const secondsLeft = computed(() =>
  Math.max(
    0,
    Math.ceil((new Date(props.verification.resendAvailableAt).getTime() - now.value) / 1000),
  ),
)
const resendLabel = computed(() =>
  secondsLeft.value > 0 ? `Resend in ${secondsLeft.value}s` : 'Resend code',
)
const deliveryNote = computed(() => {
  if (props.verification.delivery === 'failed') {
    return 'We could not send the code. Use Resend code to try again.'
  }
  if (props.verification.delivery === 'recent') {
    return 'A code was already sent. Use that one, or resend once the timer ends.'
  }
  return resent.value ? 'A new code was sent. The old one no longer works.' : ''
})
// this project does not send real email: the server prints the code to its own terminal
const showDevHint = import.meta.env.DEV

function focusBox(index) {
  nextTick(() => inputs.value[index]?.focus())
}

function clearCode() {
  digits.value = Array.from({ length: CODE_LENGTH }, () => '')
}

function onInput(index, event) {
  const typed = event.target.value.replace(/\D/g, '')
  if (!typed) {
    digits.value[index] = ''
    event.target.value = ''
    return
  }
  // typing or autofill of several digits at once spreads across the following boxes
  const spread = typed.slice(0, CODE_LENGTH - index).split('')
  spread.forEach((digit, offset) => {
    digits.value[index + offset] = digit
  })
  event.target.value = digits.value[index]
  focusBox(Math.min(index + spread.length, CODE_LENGTH - 1))
}

function onKeydown(index, event) {
  if (event.key === 'Backspace' && !digits.value[index] && index > 0) {
    event.preventDefault()
    digits.value[index - 1] = ''
    focusBox(index - 1)
  } else if (event.key === 'ArrowLeft' && index > 0) {
    event.preventDefault()
    focusBox(index - 1)
  } else if (event.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
    event.preventDefault()
    focusBox(index + 1)
  }
}

function onPaste(event) {
  const pasted = (event.clipboardData?.getData('text') || '').replace(/\D/g, '')
  if (!pasted) return
  event.preventDefault()
  clearCode()
  pasted
    .slice(0, CODE_LENGTH)
    .split('')
    .forEach((digit, index) => {
      digits.value[index] = digit
    })
  focusBox(Math.min(pasted.length, CODE_LENGTH - 1))
}

function submit() {
  if (!complete.value || props.pending) return
  emit('submit', code.value)
}

function resend() {
  if (secondsLeft.value > 0 || props.pending) return
  clearCode()
  resent.value = false
  emit('resend')
  focusBox(0)
}

// a rejected code clears the boxes, steps the shake once and returns focus to the first box
watch(
  () => props.error,
  (message) => {
    if (!message) return
    clearCode()
    shaking.value = false
    nextTick(() => {
      shaking.value = true
    })
    focusBox(0)
  },
)
watch(
  () => props.verification.resendAvailableAt,
  () => {
    now.value = Date.now()
    resent.value = props.verification.delivery === 'sent'
  },
)

onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
  focusBox(0)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  clearCode()
})
</script>

<template>
  <form class="auth-form auth-verify" novalidate @submit.prevent="submit">
    <p id="verify-intro" class="auth-verify__intro">
      Enter the 6-digit code for <strong>{{ verification.email }}</strong
      >. Codes expire after 10 minutes.
    </p>
    <p v-if="showDevHint" class="auth-field-hint">
      Project demo: no email is sent. Find the code in the server terminal.
    </p>
    <p v-if="deliveryNote" class="auth-field-hint" role="status">{{ deliveryNote }}</p>

    <div v-if="error" class="auth-error-summary" role="alert" aria-labelledby="verify-error-title">
      <strong id="verify-error-title">That didn't work.</strong>
      <p>{{ error }}</p>
    </div>

    <div
      class="auth-code"
      :class="{ 'auth-code--shake': shaking }"
      role="group"
      aria-labelledby="verify-intro"
      @animationend="shaking = false"
    >
      <input
        v-for="(_, index) in digits"
        :key="index"
        :ref="(element) => (inputs[index] = element)"
        class="auth-code__box"
        :class="{ 'auth-code__box--filled': digits[index] }"
        type="text"
        inputmode="numeric"
        pattern="[0-9]*"
        maxlength="6"
        :autocomplete="index === 0 ? 'one-time-code' : 'off'"
        :aria-label="`Digit ${index + 1} of ${CODE_LENGTH}`"
        :aria-invalid="Boolean(error)"
        :value="digits[index]"
        :disabled="pending"
        @input="onInput(index, $event)"
        @keydown="onKeydown(index, $event)"
        @paste="onPaste"
        @focus="$event.target.select()"
      />
    </div>

    <button class="btn btn-primary auth-submit" type="submit" :disabled="!complete || pending">
      {{ pending ? 'Checking…' : 'Confirm code' }}
    </button>

    <div class="auth-verify__actions">
      <button
        class="auth-verify__link"
        type="button"
        :disabled="secondsLeft > 0 || pending"
        @click="resend"
      >
        {{ resendLabel }}
      </button>
      <button class="auth-verify__link" type="button" :disabled="pending" @click="emit('cancel')">
        Use a different email
      </button>
    </div>
  </form>
</template>
