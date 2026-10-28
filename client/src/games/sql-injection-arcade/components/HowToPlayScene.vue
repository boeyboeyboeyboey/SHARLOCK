<script setup>
const props = defineProps({
  step: { type: Number, default: 0 },
  reducedMotion: { type: Boolean, default: false },
})

const REPAIRS = ['Block the word UNION', 'Hide the errors', 'Parameterized query']
</script>

<template>
  <div class="scene" :class="[`is-step-${props.step}`, { 'is-static': props.reducedMotion }]">
    <div class="scene-left">
      <div class="scene-login">
        <span class="scene-field">search: <b>zz' UNION SELECT user, pass FROM staff --</b></span>
        <span class="scene-button">Run the query</span>
      </div>
      <pre
        class="scene-query"
      ><code>WHERE name LIKE '%<mark class="scene-quote">zz'</mark> UNION SELECT ...</code></pre>
    </div>
    <div class="scene-right">
      <p class="scene-count">Tries left 2 of 3 · Lives 3 · 2:41</p>
      <ul class="scene-repairs">
        <li
          v-for="(repair, index) in REPAIRS"
          :key="repair"
          class="scene-repair"
          :class="{ 'is-right': index === 2 }"
        >
          {{ repair }}
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.scene {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
  gap: 0.75rem;
  align-items: start;
  min-height: 9rem;
  font-size: 0.85rem;
}

.scene-left,
.scene-right,
.scene-login {
  display: grid;
  gap: 0.3rem;
}

.scene-field,
.scene-button,
.scene-count,
.scene-repair {
  margin: 0;
  padding: 0.3rem 0.5rem;
  background: var(--game-howto-surface);
  border: 2px solid var(--game-howto-edge);
  transition:
    opacity 0.4s ease,
    background 0.4s ease,
    border-color 0.4s ease;
}

.scene-button {
  justify-self: start;
  font-weight: 700;
  color: var(--game-howto-bar-ink);
  background: var(--game-howto-bar);
}

.scene-query {
  margin: 0;
  padding: 0.4rem 0.5rem;
  overflow-x: auto;
  color: var(--game-howto-ink);
  background: var(--game-howto-scene);
  border: 2px solid var(--game-howto-edge);
  opacity: 0.35;
  transition: opacity 0.4s ease;
}

.scene-quote {
  color: inherit;
  background: transparent;
}

.is-step-0 .scene-query,
.is-step-1 .scene-query,
.is-step-2 .scene-query,
.is-step-3 .scene-query {
  opacity: 1;
}

.is-step-1 .scene-quote,
.is-step-2 .scene-quote,
.is-step-3 .scene-quote {
  color: var(--game-howto-bar-ink);
  background: var(--game-howto-bad);
}

.scene-login {
  opacity: 0.35;
  transition: opacity 0.4s ease;
}

.is-step-1 .scene-login,
.is-step-2 .scene-login,
.is-step-3 .scene-login {
  opacity: 1;
}

.scene-count {
  visibility: hidden;
  opacity: 0;
  font-weight: 700;
}

.is-step-2 .scene-count,
.is-step-3 .scene-count {
  visibility: visible;
  opacity: 1;
  background: var(--game-howto-soft);
}

.scene-repairs {
  display: grid;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.scene-repair {
  opacity: 0.35;
}

.is-step-3 .scene-repair {
  opacity: 1;
}

.is-step-3 .scene-repair.is-right {
  background: var(--game-howto-soft);
  border-color: var(--game-howto-ink);
  font-weight: 700;
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
