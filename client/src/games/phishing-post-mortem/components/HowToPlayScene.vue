<script setup>
const props = defineProps({
  step: { type: Number, default: 0 },
  reducedMotion: { type: Boolean, default: false },
})

const ROWS = [
  { sender: 'Aurora IT', subject: 'Action required' },
  { sender: 'Payroll', subject: 'Your payslip' },
  { sender: 'Courier', subject: 'Parcel on hold' },
  { sender: 'HR team', subject: 'Welcome pack' },
]
const CLUES = ['Lookalike domain', 'Proxy log hit']
</script>

<template>
  <div class="scene" :class="[`is-step-${props.step}`, { 'is-static': props.reducedMotion }]">
    <ul class="scene-inbox">
      <li
        v-for="(row, index) in ROWS"
        :key="row.sender"
        class="scene-row"
        :class="{ 'is-target': index === 0 }"
      >
        <strong>{{ row.sender }}</strong>
        <span>{{ row.subject }}</span>
        <em class="scene-accuse">Accuse this message</em>
      </li>
    </ul>
    <div class="scene-side">
      <div class="scene-clues">
        <span v-for="(clue, index) in CLUES" :key="clue" class="scene-clue" :class="`is-${index}`">
          {{ clue }}
        </span>
      </div>
      <p class="scene-verdict">Verdict: 100 / 100</p>
    </div>
  </div>
</template>

<style scoped>
.scene {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
  gap: 0.75rem;
  align-items: start;
  min-height: 8.5rem;
  font-size: 0.85rem;
}

.scene-inbox {
  display: grid;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.scene-row {
  display: grid;
  gap: 0.1rem;
  padding: 0.3rem 0.5rem;
  background: var(--game-surface);
  border: 2px solid var(--game-line);
  transition:
    background 0.4s ease,
    border-color 0.4s ease;
}

.scene-row span {
  color: var(--game-muted);
}

.scene-accuse {
  display: none;
  font-style: normal;
  font-weight: 700;
  color: var(--game-bad);
}

.is-step-0 .scene-row.is-target,
.is-step-1 .scene-row.is-target,
.is-step-2 .scene-row.is-target,
.is-step-3 .scene-row.is-target {
  background: var(--game-accent-soft);
  border-color: var(--game-accent);
}

.is-step-1 .scene-row.is-target .scene-accuse,
.is-step-2 .scene-row.is-target .scene-accuse,
.is-step-3 .scene-row.is-target .scene-accuse {
  display: block;
}

.scene-side {
  display: grid;
  gap: 0.5rem;
}

.scene-clues {
  display: grid;
  gap: 0.25rem;
}

.scene-clue {
  padding: 0.3rem 0.5rem;
  background: var(--game-surface);
  border: 2px solid var(--game-line);
  opacity: 0.35;
  transition:
    opacity 0.4s ease,
    background 0.4s ease,
    border-color 0.4s ease;
}

.is-step-2 .scene-clue,
.is-step-3 .scene-clue {
  opacity: 1;
  background: var(--game-good-soft);
  border-color: var(--game-good);
  color: var(--game-good);
}

.is-step-2 .scene-clue.is-1 {
  transition-delay: 0.5s;
}

.scene-verdict {
  margin: 0;
  padding: 0.4rem 0.5rem;
  font-weight: 700;
  visibility: hidden;
  background: var(--game-surface);
  border: 2px solid var(--game-accent);
  opacity: 0;
  transition:
    opacity 0.4s ease,
    visibility 0.4s;
}

.is-step-3 .scene-verdict {
  visibility: visible;
  opacity: 1;
}

.is-static *,
.is-static *::before {
  transition: none !important;
  animation: none !important;
}

@media (prefers-reduced-motion: reduce) {
  .scene *,
  .scene *::before {
    transition: none !important;
    animation: none !important;
  }
}

@media (max-width: 30rem) {
  .scene {
    grid-template-columns: 1fr;
  }
}
</style>
