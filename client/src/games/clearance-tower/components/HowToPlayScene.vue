<script setup>
defineProps({
  step: { type: Number, default: 0 },
  reducedMotion: { type: Boolean, default: false },
})

const FILES = ['Budget', 'Payroll', 'Plans']
const ROWS = [
  { agent: 'Analyst', rights: [true, false, false] },
  { agent: 'Intern', rights: [false, false, false] },
]
</script>

<template>
  <div class="scene" :class="[`is-step-${step}`, { 'is-static': reducedMotion }]">
    <table class="scene-matrix">
      <thead>
        <tr>
          <th></th>
          <th v-for="file in FILES" :key="file">{{ file }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, rowIndex) in ROWS" :key="row.agent">
          <th>{{ row.agent }}</th>
          <td v-for="(on, colIndex) in row.rights" :key="colIndex">
            <span
              class="scene-cell"
              :class="{
                'is-on': on,
                'is-target': rowIndex === 0 && colIndex === 1,
              }"
              >r</span
            >
          </td>
        </tr>
      </tbody>
    </table>

    <div class="scene-side">
      <div class="scene-panel scene-dossier">
        <span class="scene-line is-wide"></span>
        <span class="scene-line"></span>
        <span class="scene-line is-short"></span>
      </div>
      <div class="scene-panel scene-hint">Grant r (read) or w (write)</div>
      <div class="scene-panel scene-log">
        <span class="scene-event is-ok">Analyst reads Budget: allowed</span>
        <span class="scene-event is-blocked">Intern copies Payroll: leak blocked</span>
      </div>
      <div class="scene-panel scene-score">
        <span>Case score 85 / 100</span>
        <span>★★☆</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scene {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  gap: 0.75rem;
  align-items: start;
  min-height: 8.5rem;
  font-size: 0.85rem;
}

.scene-matrix {
  width: 100%;
  border-collapse: collapse;
  background: var(--game-surface);
}

.scene-matrix th,
.scene-matrix td {
  padding: 0.25rem;
  text-align: center;
  border: 2px solid var(--game-edge);
}

.scene-cell {
  display: inline-block;
  min-width: 1.6rem;
  font-family: var(--game-number-font);
  color: var(--game-muted);
  background: var(--game-surface);
  border: 2px solid var(--game-line);
  transition:
    background 0.4s ease 0.4s,
    color 0.4s ease 0.4s,
    border-color 0.4s ease 0.4s;
}

.scene-cell.is-on,
.is-step-1 .scene-cell.is-target,
.is-step-2 .scene-cell.is-target,
.is-step-3 .scene-cell.is-target {
  color: var(--game-bar-ink);
  background: var(--game-bar);
  border-color: var(--game-edge);
}

.scene-side {
  display: grid;
}

.scene-panel {
  display: grid;
  grid-area: 1 / 1;
  gap: 0.35rem;
  padding: 0.5rem;
  visibility: hidden;
  background: var(--game-surface);
  border: 2px solid var(--game-edge);
  opacity: 0;
  transition:
    opacity 0.4s ease,
    visibility 0.4s;
}

.is-step-0 .scene-dossier,
.is-step-1 .scene-hint,
.is-step-2 .scene-log,
.is-step-3 .scene-score {
  visibility: visible;
  opacity: 1;
}

.scene-line {
  height: 0.5rem;
  width: 70%;
  background: var(--game-line);
}

.scene-line.is-wide {
  width: 95%;
}

.scene-line.is-short {
  width: 40%;
}

.scene-event {
  padding: 0.25rem 0.4rem;
  border: 2px solid var(--game-good);
  background: var(--game-good-soft);
  color: var(--game-good);
}

.scene-event.is-blocked {
  border-color: var(--game-bad);
  background: var(--game-bad-soft);
  color: var(--game-bad);
}

.is-step-2 .scene-event.is-blocked {
  animation: scene-flash 1s ease 0.6s 2;
}

.scene-score {
  font-weight: 700;
}

@keyframes scene-flash {
  50% {
    background: var(--game-bad);
    color: var(--game-surface);
  }
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
