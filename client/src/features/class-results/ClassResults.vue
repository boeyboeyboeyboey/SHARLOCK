<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { getClassResults, getStudentAttempts, isNotAvailable, resultsErrorMessage } from './api.js'
import ResultsSummary from './ResultsSummary.vue'
import StudentAttempts from './StudentAttempts.vue'
import StudentResultsTable from './StudentResultsTable.vue'
import './class-results.css'

const props = defineProps({
  cohortId: { type: String, default: '' },
})

const root = ref(null)
const results = ref(null)
const loading = ref(false)
const loadError = ref('')
const unavailable = ref(false)
const selected = ref(null)
const attempts = ref([])
const attemptPage = ref(1)
const attemptTotal = ref(0)
const attemptPageSize = ref(10)
const attemptsLoading = ref(false)
const attemptsError = ref('')
const gameFilter = ref('')
let resultsRequest = null
let attemptsRequest = null
let generation = 0

const gameOptions = computed(() => (results.value?.games || []).map((game) => game.gameId))

watch(
  () => props.cohortId,
  () => {
    results.value = null
    loadResults(1)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  generation += 1
  resultsRequest?.abort()
  attemptsRequest?.abort()
})

function resetStudent() {
  attemptsRequest?.abort()
  selected.value = null
  attempts.value = []
  attemptsError.value = ''
  attemptsLoading.value = false
  gameFilter.value = ''
}

async function loadResults(page) {
  const current = ++generation
  resultsRequest?.abort()
  resetStudent()
  loadError.value = ''
  unavailable.value = false
  if (!props.cohortId) {
    results.value = null
    loading.value = false
    return
  }
  const controller = new AbortController()
  resultsRequest = controller
  loading.value = true
  try {
    const loaded = await getClassResults(props.cohortId, { page, signal: controller.signal })
    if (current !== generation) return
    results.value = loaded
  } catch (error) {
    if (current !== generation || controller.signal.aborted) return
    results.value = null
    unavailable.value = isNotAvailable(error)
    loadError.value = resultsErrorMessage(error)
  } finally {
    if (current === generation) loading.value = false
  }
}

async function loadAttempts(page) {
  if (!selected.value) return
  const current = generation
  attemptsRequest?.abort()
  const controller = new AbortController()
  attemptsRequest = controller
  attemptsLoading.value = true
  attemptsError.value = ''
  try {
    const result = await getStudentAttempts(props.cohortId, selected.value.id, {
      gameId: gameFilter.value,
      page,
      signal: controller.signal,
    })
    if (current !== generation || controller.signal.aborted) return
    attempts.value = result.attempts || []
    attemptPage.value = result.page
    attemptTotal.value = result.total
    attemptPageSize.value = result.pageSize || 10
  } catch (error) {
    if (current !== generation || controller.signal.aborted) return
    attempts.value = []
    attemptsError.value = resultsErrorMessage(error)
  } finally {
    if (attemptsRequest === controller) attemptsLoading.value = false
  }
}

function selectStudent(student) {
  selected.value = student
  attempts.value = []
  attemptTotal.value = 0
  gameFilter.value = ''
  loadAttempts(1)
}

function changeGame(gameId) {
  gameFilter.value = gameId
  loadAttempts(1)
}

async function closeStudent() {
  const studentId = selected.value?.id
  resetStudent()
  await nextTick()
  const buttons = root.value?.querySelectorAll('[data-student-id]') || []
  Array.from(buttons)
    .find((button) => button.dataset.studentId === studentId)
    ?.focus()
}
</script>

<template>
  <div ref="root" class="class-results">
    <p v-if="loading && !results" role="status">Loading class results…</p>
    <div v-else-if="loadError" class="preview-notice" role="alert">
      <p>{{ loadError }}</p>
      <button v-if="!unavailable" class="btn btn-secondary" type="button" @click="loadResults(1)">
        Try again
      </button>
    </div>
    <template v-else-if="results">
      <ResultsSummary :games="results.games" :active-students="results.activeStudents" />
      <StudentAttempts
        v-if="selected"
        :student="selected"
        :attempts="attempts"
        :page="attemptPage"
        :page-size="attemptPageSize"
        :total="attemptTotal"
        :loading="attemptsLoading"
        :error="attemptsError"
        :game-id="gameFilter"
        :game-options="gameOptions"
        @close="closeStudent"
        @change-page="loadAttempts"
        @change-game="changeGame"
        @retry="loadAttempts(attemptPage)"
      />
      <StudentResultsTable
        v-else
        :students="results.students"
        :games="results.games"
        :page="results.page"
        :page-size="results.pageSize"
        :total="results.total"
        :loading="loading"
        @select="selectStudent"
        @change-page="loadResults"
      />
    </template>
  </div>
</template>
