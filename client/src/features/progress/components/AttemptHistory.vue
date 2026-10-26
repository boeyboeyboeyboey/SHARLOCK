<script setup>
import { computed } from 'vue'
import { gameCatalog } from '../../../data/gameCatalog.js'

const PAGE_SIZE = 10

const props = defineProps({
  attempts: { type: Array, default: () => [] },
  page: { type: Number, default: 1 },
  total: { type: Number, default: 0 },
  loading: { type: Boolean, default: false },
  gameId: { type: String, default: '' },
  gameOptions: { type: Array, default: () => [] },
})
const emit = defineEmits(['change-page', 'change-game'])

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const pageCount = computed(() => Math.max(1, Math.ceil(props.total / PAGE_SIZE)))
const options = computed(() => gameCatalog.filter((game) => props.gameOptions.includes(game.id)))

function gameName(id) {
  return gameCatalog.find((game) => game.id === id)?.name || id
}

function formatDate(value) {
  const time = Date.parse(value)
  return Number.isFinite(time) ? dateTime.format(time) : ''
}
</script>

<template>
  <section class="progress-section attempt-history" aria-labelledby="attempt-history-heading">
    <h2 id="attempt-history-heading">Attempt history</h2>
    <label v-if="options.length" class="attempt-history__filter">
      <span>Activity</span>
      <select :value="gameId" @change="emit('change-game', $event.target.value)">
        <option value="">All activities</option>
        <option v-for="game in options" :key="game.id" :value="game.id">{{ game.name }}</option>
      </select>
    </label>
    <p v-if="loading" role="status">Loading attempts…</p>
    <p v-else-if="!attempts.length">No completed attempts to show yet.</p>
    <template v-else>
      <div class="attempt-history__scroll">
        <table>
          <caption class="visually-hidden">
            Completed attempts, newest first
          </caption>
          <thead>
            <tr>
              <th scope="col">Activity</th>
              <th scope="col">Score</th>
              <th scope="col">Completed</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="attempt in attempts" :key="attempt.attemptId">
              <th scope="row">{{ gameName(attempt.gameId) }}</th>
              <td>{{ attempt.score }} / {{ attempt.maxScore }}</td>
              <td>{{ formatDate(attempt.completedAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <nav class="attempt-history__pager" aria-label="Attempt history pages">
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
