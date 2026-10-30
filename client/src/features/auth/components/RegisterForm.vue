<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { parseRegistrationInput } from '../validation.js'
import AvatarPicker from './AvatarPicker.vue'

const props = defineProps({
  pending: { type: Boolean, default: false },
  error: { type: String, default: '' },
  fieldErrors: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['submit'])

const email = ref('')
const username = ref('')
const password = ref('')
const passwordConfirmation = ref('')
const avatarId = ref('mint')
const showPassword = ref(false)
const showConfirmation = ref(false)
const summary = ref(null)

// a field reports a problem once the person has left it (or tried to submit). From then on it
// follows what they type, so the warning disappears the moment the value is fixed.
const touched = reactive({
  email: false,
  username: false,
  password: false,
  passwordConfirmation: false,
})
const submitted = ref(false)
// problems the server reported stay until that field is edited
const edited = reactive({})
const bannerDismissed = ref(false)

// every current problem, from the same shared rules the server enforces
const problems = computed(() => {
  const found = Object.create(null)
  try {
    parseRegistrationInput({
      email: email.value,
      username: username.value,
      password: password.value,
      avatarId: avatarId.value,
    })
  } catch (error) {
    Object.assign(found, error.fieldErrors)
    // the shared rule text is exact but technical; the form words it plainly
    if (found.password) {
      found.password = found.password.replace('well-formed Unicode characters', 'characters')
    }
  }
  if (password.value !== passwordConfirmation.value) {
    found.passwordConfirmation = 'Passwords must match.'
  }
  return found
})

function fieldError(name) {
  if (problems.value[name] && (touched[name] || submitted.value)) return problems.value[name]
  if (edited[name]) return ''
  return props.fieldErrors[name] || ''
}

const emailError = computed(() => fieldError('email'))
const usernameError = computed(() => fieldError('username'))
const passwordError = computed(() => fieldError('password'))
const confirmationError = computed(() => fieldError('passwordConfirmation'))
const avatarError = computed(() => fieldError('avatarId'))
const hasFieldErrors = computed(() =>
  [
    emailError.value,
    usernameError.value,
    passwordError.value,
    confirmationError.value,
    avatarError.value,
  ].some(Boolean),
)

// the banner only appears after a submit attempt and follows the fields from then on; a message
// from the server clears as soon as anything is edited
const showBanner = computed(
  () =>
    (submitted.value && hasFieldErrors.value) || (Boolean(props.error) && !bannerDismissed.value),
)

function focusSummary() {
  nextTick(() => summary.value?.focus())
}

function submit() {
  submitted.value = true
  if (Object.keys(problems.value).length > 0) {
    focusSummary()
    return
  }
  const input = parseRegistrationInput({
    email: email.value,
    username: username.value,
    password: password.value,
    avatarId: avatarId.value,
  })
  emit('submit', {
    email: input.emailNormalized,
    username: input.username.display,
    password: input.password,
    avatarId: input.avatarId,
  })
}

// A warning that appears while the mouse or a finger is still down would push the page and move
// the very control being clicked, so the click would miss. Warnings raised by a press wait until
// it is released (after the click has been delivered); keyboard navigation shows them at once.
let pointerIsDown = false
const waitingForRelease = new Set()

function revealWaiting() {
  for (const name of waitingForRelease) touched[name] = true
  waitingForRelease.clear()
}
function pointerDown() {
  pointerIsDown = true
}
function pointerUp() {
  pointerIsDown = false
  setTimeout(revealWaiting, 0)
}
onMounted(() => {
  document.addEventListener('pointerdown', pointerDown, true)
  document.addEventListener('pointerup', pointerUp, true)
  document.addEventListener('pointercancel', pointerUp, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', pointerDown, true)
  document.removeEventListener('pointerup', pointerUp, true)
  document.removeEventListener('pointercancel', pointerUp, true)
})

// leaving an empty field says nothing (tabbing past it is not a mistake); only submit flags it
function leave(name, value) {
  if (!value) return
  if (pointerIsDown) waitingForRelease.add(name)
  else touched[name] = true
}

function markEdited(name) {
  edited[name] = true
  bannerDismissed.value = true
}
for (const [name, source] of Object.entries({
  email,
  username,
  password,
  passwordConfirmation,
  avatarId,
})) {
  watch(source, () => markEdited(name))
}
watch(
  () => props.fieldErrors,
  () => {
    for (const name of Object.keys(edited)) delete edited[name]
  },
)

function clearSecrets() {
  password.value = ''
  passwordConfirmation.value = ''
  showPassword.value = false
  showConfirmation.value = false
}

watch(
  () => props.error,
  (error) => {
    bannerDismissed.value = false
    if (error) focusSummary()
  },
)
onBeforeUnmount(clearSecrets)
defineExpose({ clearSecrets })
</script>

<template>
  <form class="auth-form auth-form--register" novalidate @submit.prevent="submit">
    <div
      v-if="showBanner"
      ref="summary"
      class="auth-error-summary"
      role="alert"
      tabindex="-1"
      aria-labelledby="register-error-title"
    >
      <strong id="register-error-title">We couldn't create your account yet.</strong>
      <p v-if="error && !bannerDismissed">{{ error }}</p>
      <p v-else>Check the highlighted fields and try again.</p>
    </div>

    <div class="auth-field">
      <label for="register-email">Email address</label>
      <input
        id="register-email"
        v-model="email"
        type="email"
        name="email"
        autocomplete="email"
        inputmode="email"
        required
        :disabled="pending"
        :aria-invalid="Boolean(emailError)"
        :aria-describedby="emailError ? 'register-email-error' : undefined"
        @blur="leave('email', email)"
      />
      <p v-if="emailError" id="register-email-error" class="auth-field-error" role="status">
        {{ emailError }}
      </p>
    </div>

    <div class="auth-field">
      <label for="register-username">Username</label>
      <input
        id="register-username"
        v-model="username"
        type="text"
        name="username"
        autocomplete="username"
        maxlength="32"
        required
        :disabled="pending"
        :aria-invalid="Boolean(usernameError)"
        :aria-describedby="
          usernameError
            ? 'register-username-hint register-username-error'
            : 'register-username-hint'
        "
        @blur="leave('username', username)"
      />
      <small id="register-username-hint">3–32 letters, numbers, underscores or hyphens.</small>
      <p v-if="usernameError" id="register-username-error" class="auth-field-error" role="status">
        {{ usernameError }}
      </p>
    </div>

    <div class="auth-field">
      <label for="register-password">Password</label>
      <div class="auth-password-control">
        <input
          id="register-password"
          v-model="password"
          :type="showPassword ? 'text' : 'password'"
          name="new-password"
          autocomplete="new-password"
          aria-keyshortcuts="Alt+S"
          required
          :disabled="pending"
          :aria-invalid="Boolean(passwordError)"
          :aria-describedby="
            passwordError
              ? 'register-password-hint register-password-error'
              : 'register-password-hint'
          "
          @blur="leave('password', password)"
          @keydown.alt.s.prevent="showPassword = !showPassword"
        />
        <button
          class="auth-password-toggle"
          type="button"
          tabindex="-1"
          :aria-pressed="showPassword"
          :aria-label="showPassword ? 'Hide password' : 'Show password'"
          title="Show or hide (Alt+S in the field)"
          :disabled="pending"
          @click="showPassword = !showPassword"
        >
          {{ showPassword ? 'Hide' : 'Show' }}
        </button>
      </div>
      <small id="register-password-hint">
        Use at least 12 characters, including an uppercase letter and a special character. Spaces
        are allowed.
      </small>
      <p v-if="passwordError" id="register-password-error" class="auth-field-error" role="status">
        {{ passwordError }}
      </p>
    </div>

    <div class="auth-field">
      <label for="register-confirmation">Confirm password</label>
      <div class="auth-password-control">
        <input
          id="register-confirmation"
          v-model="passwordConfirmation"
          :type="showConfirmation ? 'text' : 'password'"
          name="passwordConfirmation"
          autocomplete="new-password"
          aria-keyshortcuts="Alt+S"
          required
          :disabled="pending"
          :aria-invalid="Boolean(confirmationError)"
          :aria-describedby="confirmationError ? 'register-confirmation-error' : undefined"
          @blur="leave('passwordConfirmation', passwordConfirmation)"
          @keydown.alt.s.prevent="showConfirmation = !showConfirmation"
        />
        <button
          class="auth-password-toggle"
          type="button"
          tabindex="-1"
          :aria-pressed="showConfirmation"
          :aria-label="showConfirmation ? 'Hide confirmation' : 'Show confirmation'"
          title="Show or hide (Alt+S in the field)"
          :disabled="pending"
          @click="showConfirmation = !showConfirmation"
        >
          {{ showConfirmation ? 'Hide' : 'Show' }}
        </button>
      </div>
      <p
        v-if="confirmationError"
        id="register-confirmation-error"
        class="auth-field-error"
        role="status"
      >
        {{ confirmationError }}
      </p>
    </div>

    <AvatarPicker
      v-model:selected="avatarId"
      :disabled="pending"
      :aria-invalid="Boolean(avatarError)"
      :aria-describedby="avatarError ? 'register-avatar-error' : undefined"
    />
    <p v-if="avatarError" id="register-avatar-error" class="auth-field-error">
      {{ avatarError }}
    </p>

    <button class="btn btn-primary auth-submit" type="submit" :disabled="pending">
      {{ pending ? 'Creating account…' : 'Create account' }}
    </button>
  </form>
</template>
