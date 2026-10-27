<script setup>
const props = defineProps({
  step: { type: Number, default: 0 },
  reducedMotion: { type: Boolean, default: false },
})

const TACTICS = ['Urgency', 'Authority', 'Flattery']
</script>

<template>
  <div class="scene" :class="[`is-step-${props.step}`, { 'is-static': props.reducedMotion }]">
    <div class="scene-tabs">
      <span class="scene-tab is-main">Jordan Vale</span>
      <span class="scene-tab is-real">Real colleague</span>
    </div>
    <div class="scene-chat">
      <p class="scene-bubble is-0">
        <strong>Jordan Vale</strong>
        <span>I need the reset code right now.</span>
        <em class="scene-tactic">{{ TACTICS[0] }}</em>
      </p>
      <p class="scene-bubble is-1">
        <strong>Jordan Vale</strong>
        <span>The director asked me to get it.</span>
        <em class="scene-tactic">{{ TACTICS[1] }}</em>
      </p>
      <p class="scene-bubble is-2">
        <strong>Jordan Vale</strong>
        <span>You are the only one I trust.</span>
        <em class="scene-tactic">{{ TACTICS[2] }}</em>
      </p>
      <p class="scene-check">
        <strong>Real colleague</strong>
        <span>No, I never sent that request.</span>
      </p>
    </div>
    <div class="scene-decisions">
      <span class="scene-decision is-safe">Refuse and end</span>
      <span class="scene-decision is-bad">Share the code</span>
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

.scene-bubble.is-1,
.scene-bubble.is-2,
.scene-check {
  opacity: 0.2;
}

.scene-tactic {
  display: none;
  font-style: normal;
  font-weight: 700;
  color: var(--game-howto-bad);
}

.is-step-0 .scene-bubble.is-0,
.is-step-1 .scene-bubble,
.is-step-2 .scene-bubble,
.is-step-3 .scene-bubble {
  opacity: 1;
}

.is-step-1 .scene-bubble .scene-tactic,
.is-step-2 .scene-bubble .scene-tactic,
.is-step-3 .scene-bubble .scene-tactic {
  display: block;
}

.is-step-1 .scene-bubble {
  background: var(--game-howto-bad-soft);
}

.is-step-2 .scene-check,
.is-step-3 .scene-check {
  opacity: 1;
  background: var(--game-howto-soft);
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

.is-step-3 .scene-decision {
  opacity: 1;
}

.is-step-3 .scene-decision.is-safe {
  background: var(--game-howto-soft);
  font-weight: 700;
}

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
