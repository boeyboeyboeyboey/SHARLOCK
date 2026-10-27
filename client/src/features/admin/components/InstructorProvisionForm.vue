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
    <p class="admin-workspace__eyebrow">STAFF ACCESS</p>
    <h2 :id="`provision-${noun}-title`">Provision an {{ noun }}</h2>
    <p class="admin-workspace__intro">
      The {{ noun }} will choose a password through a private, single-use activation link.
    </p>
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
      />
      <label :for="`admin-${noun}-username`">{{ Noun }} username</label>
      <input
        :id="`admin-${noun}-username`"
        v-model="username"
        name="username"
        autocomplete="off"
        minlength="3"
        maxlength="32"
        :aria-describedby="`admin-${noun}-username-hint`"
        required
        :disabled="pending"
      />
      <small :id="`admin-${noun}-username-hint`">
        Use 3–32 letters, numbers, underscores or hyphens.
      </small>
      <AvatarPicker v-model:selected="avatarId" :disabled="pending" />
      <button class="admin-workspace__button" type="submit" :disabled="pending">
        {{ pending ? 'Preparing private link…' : `Create ${noun} and activation link` }}
      </button>
    </form>
  </section>
</template>
