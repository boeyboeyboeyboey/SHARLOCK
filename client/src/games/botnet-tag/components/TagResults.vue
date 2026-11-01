<script setup>
import { computed } from 'vue'
import { formatClock } from '../tagRules.js'

const props = defineProps({
  results: { type: Object, required: true },
  sid: { type: String, default: '' },
  saved: { type: Object, default: null },
})
defineEmits(['again', 'leave'])

const survivorsWon = computed(() => props.results.sideWon === 'survivors')
const abandoned = computed(() => props.results.unsaved === 'abandoned')
const banner = computed(() => {
  if (abandoned.value) return 'Round ended: not enough players'
  return survivorsWon.value ? 'Survivors win' : 'Botnet wins'
})
const NOT_SAVED = {
  short: 'Not saved: under 20 seconds',
  abandoned: 'Not saved: round abandoned',
}
const savedText = computed(() => {
  const { saved } = props
  if (saved?.saved) return `✓ Saved ${saved.score}/${saved.maxScore}`
  return NOT_SAVED[saved?.reason] ?? 'Not saved'
})
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 'es'}`
const summary = (row) =>
  `${plural(row.patches, 'patch')} · ${row.tags} tag${row.tags === 1 ? '' : 's'} · ${row.sideWon ? 'Won' : 'Lost'}`
const infected = computed(() => props.results.rows.filter((row) => row.outcome === 'infected'))
</script>

<template>
  <section
    class="tag-panel tag-results"
    aria-labelledby="tag-result-title"
    data-testid="tag-results"
  >
    <h1
      id="tag-result-title"
      class="tag-banner"
      :class="survivorsWon ? 'is-survivors' : 'is-botnet'"
    >
      <span aria-hidden="true">{{ survivorsWon ? '✓' : '✕' }}</span>
      {{ banner }}
    </h1>
    <p class="tag-pills">
      <span
        class="tag-chip is-bot"
        :aria-label="`${infected.length} of ${results.rows.length} infected`"
        >{{ infected.length }}/{{ results.rows.length }}</span
      >
      <span
        v-if="saved"
        class="tag-chip"
        :class="saved.saved ? 'is-ready' : 'is-wait'"
        role="status"
        data-testid="tag-saved"
        >{{ savedText }}</span
      >
    </p>
    <table class="tag-table">
      <thead>
        <tr>
          <th scope="col">Player</th>
          <th scope="col">Outcome</th>
          <th scope="col" class="is-optional">Time</th>
          <th scope="col" class="is-optional">Patches</th>
          <th scope="col" class="is-optional">Tags</th>
          <th scope="col" class="is-optional">Win</th>
          <th scope="col">Score</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in results.rows" :key="row.sid" :class="{ 'is-me': row.sid === sid }">
          <th scope="row">
            {{ row.username }}<span v-if="row.sid === sid" class="visually-hidden"> (you)</span>
            <span class="tag-sub">{{ summary(row) }}</span>
          </th>
          <td>
            <span class="tag-pill" :class="row.outcome === 'infected' ? 'is-bad' : 'is-ok'">{{
              row.outcome === 'infected' ? '✕ Infected' : '✓ Survived'
            }}</span>
          </td>
          <td class="is-optional">{{ formatClock(row.survivalSeconds * 1000) }}</td>
          <td class="is-optional">{{ row.patches }}</td>
          <td class="is-optional">{{ row.tags }}</td>
          <td class="is-optional">
            <span v-if="row.sideWon" aria-label="Won">✓</span>
            <span v-else aria-label="Lost">–</span>
          </td>
          <td>
            <strong>{{ row.score }}</strong>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="tag-foot is-end">
      <button type="button" class="tag-btn" data-testid="tag-leave" @click="$emit('leave')">
        Leave
      </button>
      <button
        type="button"
        class="tag-btn is-primary"
        data-testid="tag-again"
        @click="$emit('again')"
      >
        Play again
      </button>
    </div>
  </section>
</template>
