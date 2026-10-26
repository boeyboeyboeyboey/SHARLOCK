<script setup>
import { computed } from 'vue'
import GlobalProgressBar from '../../../components/portal/GlobalProgressBar.vue'
import { gameCatalog } from '../../../data/gameCatalog.js'

const props = defineProps({
  games: { type: Array, default: () => [] },
  totalPoints: { type: Number, default: 0 },
  maxPoints: { type: Number, default: 0 },
  topicOutcomes: { type: Array, default: () => [] },
})

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

// every catalog game appears; the api only reports games that save results
const rows = computed(() =>
  gameCatalog.map((game) => {
    const saved = props.games.find((entry) => entry.gameId === game.id)
    return { id: game.id, name: game.name, saved }
  }),
)
const savingCount = computed(() => props.games.length)
const completedCount = computed(
  () => props.games.filter((entry) => entry.completedCount > 0).length,
)

function formatDate(value) {
  const time = Date.parse(value)
  return Number.isFinite(time) ? dateFormat.format(time) : 'Not yet'
}
</script>

<template>
  <section class="progress-section" aria-labelledby="progress-summary-heading">
    <h2 id="progress-summary-heading">Points</h2>
    <p class="progress-total">
      <strong>{{ totalPoints }} / {{ maxPoints }}</strong>
      <span>points</span>
    </p>
    <GlobalProgressBar :completed="completedCount" :total="savingCount" />
    <ul class="progress-games">
      <li v-for="row in rows" :key="row.id" class="progress-game" :data-testid="`game-${row.id}`">
        <h3>{{ row.name }}</h3>
        <dl v-if="row.saved">
          <dt>Completed</dt>
          <dd>{{ row.saved.completedCount }}</dd>
          <dt>Best score</dt>
          <dd>
            <template v-if="row.saved.completedCount > 0">
              {{ row.saved.bestScore }} / {{ row.saved.maxScore }}
            </template>
            <template v-else>None yet</template>
          </dd>
          <dt>Points</dt>
          <dd>{{ row.saved.points }} / 100</dd>
          <dt>Last completed</dt>
          <dd>{{ formatDate(row.saved.lastCompletedAt) }}</dd>
        </dl>
        <p v-else>Results not saved yet</p>
      </li>
    </ul>
  </section>
  <section
    v-if="topicOutcomes.length"
    class="progress-section"
    aria-labelledby="progress-topics-heading"
  >
    <h2 id="progress-topics-heading">Topics</h2>
    <ul class="progress-topics">
      <li v-for="outcome in topicOutcomes" :key="outcome.topic">
        <span>{{ outcome.topic }}</span>
        <span>{{ outcome.passed }} of {{ outcome.attempted }} passed</span>
      </li>
    </ul>
  </section>
</template>
