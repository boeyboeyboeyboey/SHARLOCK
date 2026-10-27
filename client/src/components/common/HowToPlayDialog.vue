<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '../../features/auth/store.js'

const props = defineProps({
  gameId: { type: String, required: true },
  title: { type: String, required: true },
  steps: { type: Array, required: true },
  learn: { type: String, required: true },
  rules: { type: Array, default: () => [] },
  controls: { type: Array, default: () => [] },
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['update:open'])

const STEP_MS = 4000
const auth = useAuthStore()
const dialog = ref(null)
const step = ref(0)
const saveError = ref('')
const reducedMotion =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false
const playing = ref(!reducedMotion)
const headingId = `howto-${props.gameId}-title`
let opener = null
let timer = null

const dismissed = computed(() => auth.user?.howToPlayDismissed?.includes(props.gameId) ?? false)
const current = computed(() => props.steps[step.value] ?? { title: '', text: '' })

function goTo(index) {
  const last = props.steps.length - 1
  step.value = index < 0 ? last : index > last ? 0 : index
  restartTimer()
}

function stopTimer() {
  clearInterval(timer)
  timer = null
}

function restartTimer() {
  stopTimer()
  if (!props.open || !playing.value || reducedMotion || props.steps.length < 2) return
  timer = setInterval(() => {
    step.value = (step.value + 1) % props.steps.length
  }, STEP_MS)
}

function togglePlaying() {
  playing.value = !playing.value
  restartTimer()
}

function onClose() {
  stopTimer()
  if (props.open) emit('update:open', false)
  if (opener && typeof opener.focus === 'function') opener.focus()
  opener = null
}

function requestClose() {
  emit('update:open', false)
  if (dialog.value?.open) dialog.value.close()
}

async function onDismissChange(event) {
  const want = event.target.checked
  saveError.value = ''
  try {
    await auth.setHowToPlayDismissed(props.gameId, want)
  } catch {
    saveError.value = 'Could not save that choice. Try again.'
    event.target.checked = dismissed.value
  }
}

function syncDialog(isOpen) {
  const element = dialog.value
  if (!element) return
  if (isOpen && !element.open) {
    opener = document.activeElement
    step.value = 0
    saveError.value = ''
    element.showModal()
    restartTimer()
  } else if (!isOpen && element.open) {
    element.close()
  }
  if (!isOpen) stopTimer()
}

watch(() => props.open, syncDialog, { flush: 'post' })
onMounted(() => syncDialog(props.open))
onBeforeUnmount(stopTimer)
</script>

<template>
  <dialog ref="dialog" class="howto-dialog" :aria-labelledby="headingId" @close="onClose">
    <div class="howto-body">
      <div class="howto-head">
        <h2 :id="headingId" class="howto-title">How to play: {{ title }}</h2>
        <button
          type="button"
          class="howto-button howto-x"
          aria-label="Close how to play"
          @click="requestClose"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <div class="howto-scene" aria-hidden="true">
        <slot name="scene" :step="step" :playing="playing" :reduced-motion="reducedMotion" />
      </div>

      <section class="howto-stage" aria-label="Walkthrough">
        <p class="howto-count">Step {{ step + 1 }} of {{ steps.length }}</p>
        <h3 class="howto-step-title">{{ current.title }}</h3>
        <p class="howto-step-text" :aria-live="playing ? 'off' : 'polite'">{{ current.text }}</p>
        <div class="howto-nav">
          <button type="button" class="howto-button" @click="goTo(step - 1)">Previous</button>
          <ol class="howto-dots">
            <li v-for="(item, index) in steps" :key="index">
              <button
                type="button"
                class="howto-dot"
                :aria-label="`Step ${index + 1}: ${item.title}`"
                :aria-current="index === step ? 'step' : undefined"
                @click="goTo(index)"
              ></button>
            </li>
          </ol>
          <button type="button" class="howto-button" @click="goTo(step + 1)">Next</button>
          <button
            type="button"
            class="howto-button"
            :aria-pressed="!playing"
            @click="togglePlaying"
          >
            Pause animation
          </button>
        </div>
      </section>

      <p class="howto-learn"><strong>What you'll learn:</strong> {{ learn }}</p>

      <div class="howto-lists">
        <section v-if="rules.length" aria-labelledby="howto-rules-title">
          <h3 id="howto-rules-title" class="howto-subtitle">Rules</h3>
          <ul>
            <li v-for="rule in rules" :key="rule">{{ rule }}</li>
          </ul>
        </section>
        <section v-if="controls.length" aria-labelledby="howto-controls-title">
          <h3 id="howto-controls-title" class="howto-subtitle">Controls</h3>
          <ul>
            <li v-for="control in controls" :key="control.keys">
              <strong>{{ control.keys }}</strong
              >: {{ control.action }}
            </li>
          </ul>
        </section>
      </div>

      <p v-if="saveError" class="howto-alert" role="alert">{{ saveError }}</p>

      <div class="howto-foot">
        <label class="howto-check">
          <input type="checkbox" :checked="dismissed" @change="onDismissChange" />
          Don't show again
        </label>
        <button type="button" class="howto-button howto-primary" @click="requestClose">
          Start playing
        </button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.howto-dialog {
  width: min(44rem, calc(100% - 1rem));
  max-height: calc(100dvh - 1rem);
  padding: 0;
  overflow: auto;
  color: var(--game-howto-ink, var(--text-main, #334155));
  background: var(--game-howto-surface, var(--surface, #fff8df));
  border: 3px solid var(--game-howto-edge, var(--border-strong, #50634d));
  border-radius: 0;
  box-shadow: 4px 4px 0 var(--game-howto-edge, var(--border-strong, #50634d));
  font-family: var(--game-howto-font, var(--font-pixel, monospace));
}

.howto-dialog::backdrop {
  background: rgb(27 36 48 / 55%);
}

.howto-body {
  display: grid;
  gap: 0.9rem;
  padding: 1rem;
}

.howto-head {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  justify-content: space-between;
}

.howto-title {
  margin: 0;
  font-size: 1.35rem;
  line-height: 1.2;
}

.howto-scene {
  padding: 0.75rem;
  overflow: hidden;
  background: var(--game-howto-scene, var(--bg-primary, #dfead6));
  border: 2px solid var(--game-howto-edge, var(--border-strong, #50634d));
}

.howto-stage {
  display: grid;
  gap: 0.35rem;
}

.howto-count {
  margin: 0;
  font-size: 0.85rem;
  color: var(--game-howto-muted, #566173);
}

.howto-step-title {
  margin: 0;
  font-size: 1.1rem;
}

/* game sheets may colour headings globally, so headings follow the dialog ink */
.howto-dialog h2,
.howto-dialog h3 {
  color: inherit;
}

.howto-step-text {
  min-height: 3.2em;
  margin: 0;
}

.howto-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.howto-dots {
  display: flex;
  gap: 0.15rem;
  padding: 0;
  margin: 0 auto;
  list-style: none;
}

.howto-dot {
  position: relative;
  width: 44px;
  height: 44px;
  padding: 0;
  background: none;
  border: 0;
  cursor: pointer;
}

.howto-dot::before {
  position: absolute;
  inset: 15px;
  content: '';
  background: var(--game-howto-surface, var(--surface, #fff8df));
  border: 2px solid var(--game-howto-edge, var(--border-strong, #50634d));
}

.howto-dot[aria-current='step']::before {
  background: var(--game-howto-edge, var(--border-strong, #50634d));
}

.howto-learn {
  margin: 0;
}

.howto-lists {
  display: grid;
  gap: 0.9rem;
}

.howto-subtitle {
  margin: 0 0 0.25rem;
  font-size: 1rem;
}

.howto-lists ul {
  padding-left: 1.1rem;
  margin: 0;
}

.howto-alert {
  padding: 0.5rem 0.75rem;
  margin: 0;
  color: var(--game-howto-bad, #9a3324);
  background: var(--game-howto-bad-soft, #fbecea);
  border: 2px solid var(--game-howto-bad, #9a3324);
}

.howto-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  justify-content: space-between;
}

.howto-check {
  display: inline-flex;
  gap: 0.5rem;
  align-items: center;
  min-height: 44px;
  cursor: pointer;
}

.howto-check input {
  width: 1.25rem;
  height: 1.25rem;
  accent-color: var(--game-howto-edge, var(--border-strong, #50634d));
}

.howto-button {
  min-height: 44px;
  padding: 0.5rem 1rem;
  font: inherit;
  font-weight: 700;
  color: inherit;
  background: var(--game-howto-surface, var(--surface, #fff8df));
  border: 2px solid var(--game-howto-edge, var(--border-strong, #50634d));
  border-radius: 0;
  box-shadow: 2px 2px 0 var(--game-howto-edge, var(--border-strong, #50634d));
  cursor: pointer;
}

.howto-button:hover {
  background: var(--game-howto-soft, var(--accent-secondary, #e3eacb));
}

.howto-button[aria-pressed='true'],
.howto-primary {
  color: var(--game-howto-bar-ink, #25331f);
  background: var(--game-howto-bar, var(--accent-primary, #a8c98a));
}

.howto-x {
  min-width: 44px;
  padding: 0.25rem 0.5rem;
  font-size: 1.4rem;
  line-height: 1;
}

.howto-button:focus-visible,
.howto-dot:focus-visible,
.howto-check input:focus-visible {
  outline: 3px solid var(--game-howto-ink, var(--text-main, #334155));
  outline-offset: 2px;
}

@media (max-width: 39.99rem) {
  .howto-dots {
    flex-basis: 100%;
    order: 5;
    justify-content: center;
    margin: 0;
  }
}

@media (min-width: 40rem) {
  .howto-lists {
    grid-template-columns: 1fr 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .howto-button,
  .howto-dot {
    transition: none;
  }
}
</style>
