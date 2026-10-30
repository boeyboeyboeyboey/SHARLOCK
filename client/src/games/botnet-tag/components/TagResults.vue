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
      {{ survivorsWon ? 'Survivors win' : 'Botnet wins' }}
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
        >{{ saved.saved ? `✓ Saved ${saved.score}/${saved.maxScore}` : 'Not saved' }}</span
      >
    </p>
    <table class="tag-table">
      <thead>
        <tr>
          <th scope="col">Player</th>
          <th scope="col">Outcome</th>
          <th scope="col" class="is-optional">Time</th>
          <th scope="col">Patches</th>
          <th scope="col">Tags</th>
          <th scope="col">Win</th>
          <th scope="col">Score</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in results.rows" :key="row.sid" :class="{ 'is-me': row.sid === sid }">
          <th scope="row">
            {{ row.username }}<span v-if="row.sid === sid" class="visually-hidden"> (you)</span>
          </th>
          <td>
            <span class="tag-pill" :class="row.outcome === 'infected' ? 'is-bad' : 'is-ok'">{{
              row.outcome === 'infected' ? '✕ Infected' : '✓ Survived'
            }}</span>
          </td>
          <td class="is-optional">{{ formatClock(row.survivalSeconds * 1000) }}</td>
          <td>{{ row.patches }}</td>
          <td>{{ row.tags }}</td>
          <td>
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
