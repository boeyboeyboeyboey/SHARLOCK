<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { listAttemptContexts, safeAttemptError } from '../api.js'
defineProps({ disabled: Boolean })
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
    <label for="attempt-context">Save this case to</label>
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
    <p class="small">
      Class attempts appear on that class's leaderboard. Personal practice does not.
    </p>
    <button class="btn btn-primary" :disabled="disabled || loading">Open the case</button>
  </form>
</template>
