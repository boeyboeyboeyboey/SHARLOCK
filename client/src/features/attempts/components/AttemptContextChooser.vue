<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { listAttemptContexts, safeAttemptError } from '../api.js'
defineProps({
  disabled: Boolean,
  label: { type: String, default: 'Save this case to' },
  submitLabel: { type: String, default: 'Open the case' },
})
const emit = defineEmits(['start'])
const selected = ref('personal')
const contexts = ref([])
const loading = ref(true)
const error = ref('')
const controller = new AbortController()
async function load() {
  loading.value = true
  error.value = ''
  try {
    const rows = []
    let page = 1
    let result
    do {
      result = await listAttemptContexts(page, controller.signal)
      rows.push(...result.cohorts)
      page += 1
    } while (rows.length < result.total && result.cohorts.length && page <= 200)
    contexts.value = rows
  } catch (failure) {
    if (!controller.signal.aborted) error.value = safeAttemptError(failure).message
  } finally {
    loading.value = false
  }
}
function start() {
  emit(
    'start',
    selected.value === 'personal'
      ? { kind: 'personal' }
      : { kind: 'cohort', cohortId: selected.value },
  )
}
onMounted(load)
onBeforeUnmount(() => controller.abort())
</script>
<template>
  <form @submit.prevent="start">
    <label for="attempt-context">{{ label }}</label>
    <select
      id="attempt-context"
      v-model="selected"
      class="form-select"
      :disabled="disabled || loading"
    >
      <option value="personal">Personal practice</option>
      <option v-for="context in contexts" :key="context.cohortId" :value="context.cohortId">
        {{ context.institutionName }} · {{ context.cohortName }}
      </option>
    </select>
    <p v-if="loading" role="status">Checking available classes…</p>
    <p v-if="error" role="alert">
      {{ error }} <button type="button" class="text-link" @click="load">Retry class list</button>
    </p>
    <button class="btn btn-primary mt-2" :disabled="disabled || loading">{{ submitLabel }}</button>
  </form>
</template>
