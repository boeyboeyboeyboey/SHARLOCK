<script setup>
import { computed } from 'vue'
import { avatarFor } from '../auth/avatars.js'
import { formatDate, gameName } from './format.js'

const props = defineProps({
  students: { type: Array, default: () => [] },
  games: { type: Array, default: () => [] },
  page: { type: Number, default: 1 },
  pageSize: { type: Number, default: 50 },
  total: { type: Number, default: 0 },
  loading: { type: Boolean, default: false },
})
const emit = defineEmits(['select', 'change-page'])

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))

function bestPercent(student, gameId) {
  const entry = student.games?.find((item) => item.gameId === gameId)
  return Number.isFinite(entry?.bestPercent) ? Math.round(entry.bestPercent) : null
}
</script>

<template>
  <section class="class-results__section" aria-labelledby="class-results-students-heading">
    <h2 id="class-results-students-heading">Students</h2>
    <p v-if="total === 0">No students in this class yet</p>
    <template v-else>
      <div class="class-results__scroll">
        <table>
          <caption class="visually-hidden">
            Best score per activity for each student
          </caption>
          <thead>
            <tr>
              <th scope="col">Student</th>
              <th v-for="game in games" :key="game.gameId" scope="col">
                {{ gameName(game.gameId) }}
              </th>
              <th scope="col">Attempts</th>
              <th scope="col">Last activity</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="student in students" :key="student.id">
              <th scope="row">
                <span class="class-results__student">
                  <img
                    :src="avatarFor(student.avatarId).path"
                    width="32"
                    height="32"
                    alt=""
                    class="class-results__avatar"
                  />
                  <button
                    class="class-results__student-button"
                    type="button"
                    :data-student-id="student.id"
                    @click="emit('select', student)"
                  >
                    {{ student.username }}
                  </button>
                </span>
              </th>
              <td v-for="game in games" :key="game.gameId">
                <template v-if="bestPercent(student, game.gameId) !== null">
                  {{ bestPercent(student, game.gameId) }}%
                </template>
                <template v-else>
                  <span aria-hidden="true">—</span>
                  <span class="visually-hidden">Not attempted</span>
                </template>
              </td>
              <td>{{ student.completedAttempts }}</td>
              <td>{{ formatDate(student.lastCompletedAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <nav v-if="total > pageSize" class="class-results__pager" aria-label="Student pages">
        <button
          class="btn btn-secondary"
          type="button"
          :disabled="loading || page <= 1"
          @click="emit('change-page', page - 1)"
        >
          Previous
        </button>
        <span>Page {{ page }} of {{ pageCount }}</span>
        <button
          class="btn btn-secondary"
          type="button"
          :disabled="loading || page >= pageCount"
          @click="emit('change-page', page + 1)"
        >
          Next
        </button>
      </nav>
    </template>
  </section>
</template>
