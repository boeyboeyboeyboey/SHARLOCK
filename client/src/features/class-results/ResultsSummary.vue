<script setup>
import { computed } from 'vue'
import { gameName } from './format.js'

const props = defineProps({
  games: { type: Array, default: () => [] },
  activeStudents: { type: Number, default: 0 },
})

const rows = computed(() =>
  props.games.map((game) => ({
    ...game,
    name: gameName(game.gameId),
    hasAttempts: game.studentsAttempted > 0 && Number.isFinite(game.averageBestPercent),
  })),
)
</script>

<template>
  <section class="class-results__section" aria-labelledby="class-results-summary-heading">
    <h2 id="class-results-summary-heading">Class summary</h2>
    <p class="class-results__note">
      Completion and performance results from class attempts, not a measure of mastery.
    </p>
    <ul class="class-results__games">
      <li v-for="game in rows" :key="game.gameId" class="class-results__game">
        <h3>{{ game.name }}</h3>
        <p v-if="!game.hasAttempts">No attempts yet</p>
        <template v-else>
          <p>{{ game.studentsAttempted }} of {{ activeStudents }} students attempted</p>
          <p>Average best score {{ Math.round(game.averageBestPercent) }}%</p>
          <ul v-if="game.topics?.length" class="class-results__topics" aria-label="Topics">
            <li v-for="topic in game.topics" :key="topic.topic">
              <span>{{ topic.topic }}</span>
              <span>{{ topic.studentsPassed }} of {{ topic.studentsAttempted }} passed</span>
            </li>
          </ul>
        </template>
      </li>
    </ul>
  </section>
</template>
