<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  pending: { type: Boolean, default: false },
  match: { type: Object, default: undefined },
  error: { type: String, default: '' },
})
const emit = defineEmits(['lookup', 'select'])
const email = ref('')
const lastQuery = ref('')
const hasCurrentResult = computed(() =>
  Boolean(lastQuery.value && email.value.trim() === lastQuery.value),
)

// the lookup is an exact email match, so one result needs no second click
watch(
  () => props.match,
  (student) => {
    if (student && hasCurrentResult.value) emit('select', student)
  },
)

function submit() {
  const query = email.value.trim()
  if (props.pending || !query) return
  lastQuery.value = query
  emit('lookup', { email: query })
}
</script>

<template>
  <form class="recovery-lookup" @submit.prevent="submit">
    <label class="recovery-label" for="recovery-student-email">Student email</label>
    <div class="recovery-lookup__row">
      <input
        id="recovery-student-email"
        v-model="email"
        class="recovery-input"
        type="email"
        name="student-email"
        autocomplete="email"
        maxlength="254"
        required
        :disabled="pending"
      />
      <button
        class="btn btn-primary recovery-button admin-workspace__button"
        type="submit"
        :disabled="pending"
      >
        {{ pending ? 'Checking…' : 'Find student' }}
      </button>
    </div>
    <p v-if="error" class="recovery-alert" role="alert">{{ error }}</p>
    <div v-if="hasCurrentResult && match === null" class="recovery-result" role="status">
      No eligible student account matched that email.
    </div>
  </form>
</template>
