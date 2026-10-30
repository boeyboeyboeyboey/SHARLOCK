<script setup>
const props = defineProps({
  step: { type: Number, default: 0 },
  reducedMotion: { type: Boolean, default: false },
})
</script>

<template>
  <div class="scene" :class="[`is-step-${props.step}`, { 'is-static': props.reducedMotion }]">
    <div class="scene-chat">
      <p class="scene-bubble is-0">
        <strong>Sam Okoye</strong>
        <span>I need the reset code now.</span>
      </p>
      <p class="scene-check">
        <strong>Directory</strong>
        <span>No entry for Sam Okoye.</span>
      </p>
      <p class="scene-bubble is-tell">
        <strong>Tell</strong>
        <span>Not in the directory.</span>
      </p>
    </div>
    <div class="scene-decisions">
      <span class="scene-decision is-bad">Grant</span>
      <span class="scene-decision is-safe">Refuse</span>
    </div>
  </div>
</template>

<style scoped>
.scene {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
  gap: 0.75rem;
  align-items: start;
  min-height: 9.5rem;
  font-size: 0.85rem;
}

.scene-tabs {
  display: flex;
  grid-column: 1 / -1;
  gap: 0.3rem;
}

.scene-tab {
  padding: 0.25rem 0.5rem;
  background: var(--game-howto-surface);
  border: 2px solid var(--game-howto-edge);
  transition: background 0.4s ease;
}

.is-step-2 .scene-tab.is-real,
.is-step-3 .scene-tab.is-real {
  background: var(--game-howto-soft);
  font-weight: 700;
}

.scene-chat,
.scene-decisions {
  display: grid;
  gap: 0.3rem;
}

.scene-bubble,
.scene-check {
  display: grid;
  gap: 0.1rem;
  margin: 0;
  padding: 0.3rem 0.5rem;
  background: var(--game-howto-surface);
  border: 2px solid var(--game-howto-edge);
  transition:
    opacity 0.4s ease,
    background 0.4s ease;
}

.scene-bubble span,
.scene-check span {
  color: var(--game-howto-muted);
}

.scene-bubble.is-tell,
.scene-check {
  opacity: 0.2;
}

.is-step-1 .scene-check,
.is-step-2 .scene-check,
.is-step-3 .scene-check {
  opacity: 1;
  background: var(--game-howto-soft);
}

.is-step-3 .scene-bubble.is-tell {
  opacity: 1;
  background: var(--game-howto-bad-soft);
}

.scene-decision {
  padding: 0.35rem 0.5rem;
  background: var(--game-howto-surface);
  border: 2px solid var(--game-howto-edge);
  opacity: 0.35;
  transition:
    opacity 0.4s ease,
    background 0.4s ease;
}

.is-step-2 .scene-decision,
.is-step-3 .scene-decision {
  opacity: 1;
}

.is-step-2 .scene-decision.is-safe,
.is-step-3 .scene-decision.is-safe {
  background: var(--game-howto-soft);
  font-weight: 700;
}

.is-step-2 .scene-decision.is-bad,
.is-step-3 .scene-decision.is-bad {
  background: var(--game-howto-bad-soft);
  border-color: var(--game-howto-bad);
  color: var(--game-howto-bad);
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
