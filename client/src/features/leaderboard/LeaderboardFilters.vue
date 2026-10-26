<script setup>
const props = defineProps({
  cohorts: { type: Array, default: () => [] },
  games: { type: Array, default: () => [] },
  modelValue: { type: Object, default: () => ({ cohortId: '', gameId: '' }) },
})
const emit = defineEmits(['update:modelValue'])

function update(key, value) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
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
    <div class="leaderboard__filter">
      <label for="leaderboard-game">Game</label>
      <select
        id="leaderboard-game"
        :value="modelValue.gameId"
        :disabled="games.length === 0"
        @change="update('gameId', $event.target.value)"
      >
        <option v-for="game in games" :key="game.gameId" :value="game.gameId">
          {{ game.name }}
        </option>
      </select>
    </div>
  </div>
</template>
