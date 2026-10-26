<script setup>
import { computed, onMounted, ref } from 'vue'
import { avatarFor } from '../auth/avatars.js'
import { formatDateTime, gameName } from './format.js'

const props = defineProps({
  student: { type: Object, required: true },
  attempts: { type: Array, default: () => [] },
  page: { type: Number, default: 1 },
  pageSize: { type: Number, default: 10 },
  total: { type: Number, default: 0 },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  gameId: { type: String, default: '' },
  gameOptions: { type: Array, default: () => [] },
})
const emit = defineEmits(['close', 'change-page', 'change-game', 'retry'])

const heading = ref(null)
const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))

function topicsPassed(attempt) {
  const outcomes = attempt.topicOutcomes || []
  const passed = outcomes.filter((outcome) => outcome.achieved).map((outcome) => outcome.topic)
  if (!outcomes.length) return 'None recorded'
  return passed.length ? passed.join(', ') : 'None passed'
}

onMounted(() => heading.value?.focus())
</script>

<template>
  <section
    class="class-results__section class-results__drill"
    aria-labelledby="student-attempts-heading"
  >
    <div class="class-results__drill-head">
      <h2 id="student-attempts-heading" ref="heading" tabindex="-1">
        <img
          :src="avatarFor(student.avatarId).path"
          width="32"
          height="32"
          alt=""
          class="class-results__avatar"
        />
        {{ student.username }}
      </h2>
      <button class="btn btn-secondary" type="button" @click="emit('close')">
        Back to students
      </button>
    </div>
    <label v-if="gameOptions.length" class="class-results__filter">
      <span>Activity</span>
      <select :value="gameId" @change="emit('change-game', $event.target.value)">
        <option value="">All activities</option>
        <option v-for="id in gameOptions" :key="id" :value="id">{{ gameName(id) }}</option>
      </select>
    </label>
    <p v-if="loading" role="status">Loading attempts…</p>
    <div v-else-if="error" class="preview-notice" role="alert">
      <p>{{ error }}</p>
      <button class="btn btn-secondary" type="button" @click="emit('retry')">Try again</button>
    </div>
    <p v-else-if="!attempts.length">No class attempts yet</p>
    <template v-else>
      <div class="class-results__scroll">
        <table>
          <caption class="visually-hidden">
            Completed class attempts for
            {{
              student.username
            }}, newest first
          </caption>
          <thead>
            <tr>
              <th scope="col">Activity</th>
              <th scope="col">Score</th>
              <th scope="col">Topics passed</th>
              <th scope="col">Completed</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="attempt in attempts" :key="attempt.id">
              <th scope="row">{{ gameName(attempt.gameId) }}</th>
              <td>{{ attempt.score }} / {{ attempt.maxScore }}</td>
              <td>{{ topicsPassed(attempt) }}</td>
              <td>{{ formatDateTime(attempt.completedAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <nav v-if="total > pageSize" class="class-results__pager" aria-label="Attempt pages">
        <button
          class="btn btn-secondary"
          type="button"
          :disabled="page <= 1"
          @click="emit('change-page', page - 1)"
        >
          Previous
        </button>
        <span>Page {{ page }} of {{ pageCount }}</span>
        <button
          class="btn btn-secondary"
          type="button"
          :disabled="page >= pageCount"
          @click="emit('change-page', page + 1)"
        >
          Next
        </button>
      </nav>
    </template>
  </section>
</template>
