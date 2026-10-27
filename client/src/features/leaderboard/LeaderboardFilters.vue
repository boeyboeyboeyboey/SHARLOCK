<script setup>
import { ref } from 'vue'

const props = defineProps({
  cohorts: { type: Array, default: () => [] },
  games: { type: Array, default: () => [] },
  modelValue: { type: Object, default: () => ({ cohortId: '', gameId: '' }) },
})
const emit = defineEmits(['update:modelValue'])

function update(key, value) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

const gameTabs = ref(null)

// arrows, home and end move focus only; enter or space activates the focused tab
function onGameKey(event) {
  const steps = { ArrowRight: 1, ArrowLeft: -1 }
  if (!(event.key in steps) && event.key !== 'Home' && event.key !== 'End') return
  event.preventDefault()
  const count = props.games.length
  const index = Math.max(
    props.games.findIndex((game) => game.gameId === props.modelValue.gameId),
    0,
  )
  const buttons = [...gameTabs.value.querySelectorAll('[role="tab"]')]
  const current = buttons.indexOf(document.activeElement)
  const from = current === -1 ? index : current
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? count - 1
        : (from + steps[event.key] + count) % count
  buttons[next]?.focus()
}
</script>

<template>
  <div class="leaderboard__filters">
    <div class="leaderboard__filter">
      <label for="leaderboard-class">Class</label>
      <select
        id="leaderboard-class"
        :value="modelValue.cohortId"
        :disabled="cohorts.length <= 1"
        @change="update('cohortId', $event.target.value)"
      >
        <option v-for="cohort in cohorts" :key="cohort.cohortId" :value="cohort.cohortId">
          {{ cohort.cohortName }}
        </option>
      </select>
    </div>
    <div v-if="games.length" class="leaderboard__filter">
      <span id="leaderboard-game-label">Game</span>
      <div
        ref="gameTabs"
        class="leaderboard__tabs leaderboard__game-tabs"
        role="tablist"
        aria-labelledby="leaderboard-game-label"
        @keydown="onGameKey"
      >
        <button
          v-for="game in games"
          :id="`leaderboard-game-${game.gameId}`"
          :key="game.gameId"
          type="button"
          role="tab"
          :aria-selected="modelValue.gameId === game.gameId"
          aria-controls="leaderboard-panel"
          :tabindex="modelValue.gameId === game.gameId ? 0 : -1"
          @click="update('gameId', game.gameId)"
        >
          {{ game.name }}
        </button>
      </div>
    </div>
  </div>
</template>
