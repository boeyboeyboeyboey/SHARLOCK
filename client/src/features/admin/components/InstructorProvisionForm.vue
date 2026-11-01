<script setup>
import { computed, ref } from 'vue'
import AvatarPicker from '../../auth/components/AvatarPicker.vue'

const props = defineProps({
  role: {
    type: String,
    default: 'instructor',
    validator: (value) => ['instructor', 'administrator'].includes(value),
  },
  pending: { type: Boolean, default: false },
  error: { type: String, default: '' },
  fieldErrors: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['provision'])
const noun = computed(() => props.role)
const Noun = computed(() => (props.role === 'administrator' ? 'Administrator' : 'Instructor'))
const email = ref('')
const username = ref('')
const avatarId = ref('mint')

function provision() {
  emit('provision', {
    email: email.value,
    username: username.value,
    avatarId: avatarId.value,
  })
}

function resetForm() {
  email.value = ''
  username.value = ''
  avatarId.value = 'mint'
}

defineExpose({ resetForm })
</script>

<template>
  <section class="admin-workspace__panel" :aria-labelledby="`provision-${noun}-title`">
    <h2 :id="`provision-${noun}-title`">Provision an {{ noun }}</h2>
    <p v-if="error" class="admin-workspace__alert" role="alert">{{ error }}</p>

    <form class="admin-workspace__form" @submit.prevent="provision">
      <label :for="`admin-${noun}-email`">{{ Noun }} email</label>
      <input
        :id="`admin-${noun}-email`"
        v-model="email"
        type="email"
        name="email"
        autocomplete="email"
        maxlength="254"
        required
        :disabled="pending"
        :aria-invalid="Boolean(fieldErrors.email)"
        :aria-describedby="fieldErrors.email ? `admin-${noun}-email-error` : undefined"
      />
      <p
        v-if="fieldErrors.email"
        :id="`admin-${noun}-email-error`"
        class="admin-workspace__field-error"
      >
        {{ fieldErrors.email }}
      </p>
      <label :for="`admin-${noun}-username`">{{ Noun }} username</label>
      <input
        :id="`admin-${noun}-username`"
        v-model="username"
        name="username"
        autocomplete="off"
        minlength="3"
        maxlength="32"
        pattern="[A-Za-z0-9_\-]{3,32}"
        :aria-describedby="
          fieldErrors.username
            ? `admin-${noun}-username-error admin-${noun}-username-hint`
            : `admin-${noun}-username-hint`
        "
        :aria-invalid="Boolean(fieldErrors.username)"
        required
        :disabled="pending"
      />
      <p
        v-if="fieldErrors.username"
        :id="`admin-${noun}-username-error`"
        class="admin-workspace__field-error"
      >
        {{ fieldErrors.username }}
      </p>
      <small :id="`admin-${noun}-username-hint`">
        Use 3–32 letters, numbers, underscores or hyphens.
      </small>
      <AvatarPicker
        v-model:selected="avatarId"
        :disabled="pending"
        :heading="`Avatar for the new ${noun}`"
        :id-prefix="`admin-${noun}-avatar`"
      />
      <button class="admin-workspace__button" type="submit" :disabled="pending">
        {{ pending ? 'Preparing private link…' : `Create ${noun} and activation link` }}
      </button>
    </form>
  </section>
</template>
