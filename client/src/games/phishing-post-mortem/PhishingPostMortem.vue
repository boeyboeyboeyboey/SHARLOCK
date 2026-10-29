<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import HowToPlayDialog from '../../components/common/HowToPlayDialog.vue'
import { useHowToPlay } from '../../composables/useHowToPlay.js'
import { playSfx } from '../../composables/playSfx.js'
import AttemptContextChooser from '../../features/attempts/components/AttemptContextChooser.vue'
import SavedAttemptResult from '../../features/attempts/components/SavedAttemptResult.vue'
import HowToPlayScene from './components/HowToPlayScene.vue'
import RoundFeedback from './components/RoundFeedback.vue'
import TriageDebrief from './components/TriageDebrief.vue'
import TriageEmailCard from './components/TriageEmailCard.vue'
import TriageStatusBar from './components/TriageStatusBar.vue'
import { HOW_TO_PLAY } from './howToPlay.js'
import { useTriageRun } from './useTriageRun.js'
import './phish.css'

const MAX_ROUNDS = 60

const { open: howToOpen, show: showHowTo } = useHowToPlay('phishing-post-mortem')
const route = useRoute()
const router = useRouter()
const {
  snapshot,
  busy,
  error,
  retryable,
  finishing,
  timed,
  completed,
  legacy,
  current,
  last,
  previousEmail,
  review,
  score,
  streak,
  mistakes,
  roundsPlayed,
  totalRounds,
  maxMistakes,
  secondsLeft,
  needsCompletion,
  canAct,
  start,
  resume,
  report,
  trust,
  retry,
  resetGame,
} = useTriageRun()

const initializing = ref(true)
const picking = ref(false)
const reportButton = ref(null)
// practice shows the explanation until Next, so this remembers the last round already read
const readRound = ref(null)

const locked = computed(() => busy.value || finishing.value || !canAct.value)
const runOver = computed(() => needsCompletion.value || completed.value)
const holdFeedback = computed(
  () => !timed.value && Boolean(last.value) && readRound.value !== last.value.roundId,
)
const showResult = computed(() => completed.value && !holdFeedback.value)
const canRetry = computed(() => retryable.value || needsCompletion.value)
const endReason = computed(() => {
  if (timed.value && mistakes.value >= (maxMistakes.value ?? 3)) return 'mistakes'
  if (!timed.value) return 'rounds'
  return roundsPlayed.value >= MAX_ROUNDS ? 'cap' : 'time'
})

onMounted(async () => {
  if (typeof route.query.attempt === 'string') {
    await resume(route.query.attempt)
    // a finished run opens on its debrief, not on the last explanation
    if (completed.value) readRound.value = last.value?.roundId ?? null
  }
  initializing.value = false
})

watch(
  () => current.value?.roundId,
  () => {
    picking.value = false
  },
)

// brief stamp and shake after each timed call, never blocks input
const STAMP_MS = 450
const stamp = ref(null)
const shaking = ref(false)
let stampTimer = null
let shakeTimer = null

function callOf(item) {
  if (item.call === 'report' || item.call === 'trust') return item.call
  return (item.verdict === 'phish') === item.correct ? 'report' : 'trust'
}

watch(
  () => last.value?.roundId,
  (roundId) => {
    if (!roundId || !timed.value) return
    clearTimeout(stampTimer)
    clearTimeout(shakeTimer)
    stamp.value = { key: roundId, call: callOf(last.value) }
    stampTimer = setTimeout(() => {
      stamp.value = null
    }, STAMP_MS)
    shaking.value = false
    if (!last.value.correct) {
      nextTick(() => {
        shaking.value = true
        shakeTimer = setTimeout(() => {
          shaking.value = false
        }, STAMP_MS)
      })
    }
  },
)

// sound for each call and for the end of the run
watch(
  () => last.value?.roundId,
  (roundId) => {
    if (roundId && !initializing.value) playSfx(last.value.correct ? 'correct' : 'wrong')
  },
)
watch(completed, (done) => {
  if (done && !initializing.value) playSfx(endReason.value === 'mistakes' ? 'lose' : 'win')
})

onBeforeUnmount(() => {
  clearTimeout(stampTimer)
  clearTimeout(shakeTimer)
})

async function begin(context) {
  readRound.value = null
  if (await start(context)) await router.replace({ query: { attempt: snapshot.value.attemptId } })
}

// replay returns to the chooser, and the server picks the next run
async function replay() {
  await router.replace({ query: {} })
  picking.value = false
  readRound.value = null
  resetGame()
}

async function focusReport() {
  await nextTick()
  reportButton.value?.focus({ preventScroll: true })
}

function startPicking() {
  if (locked.value) return
  picking.value = true
}

async function cancelPicking() {
  picking.value = false
  await focusReport()
}

async function pickPart(partId) {
  await report(partId)
  picking.value = false
  await focusReport()
}

async function callTrust() {
  await trust()
  await focusReport()
}

async function nextEmail() {
  readRound.value = last.value?.roundId ?? null
  await focusReport()
}
</script>

<template>
  <div class="phish-game">
    <div class="phish-intro">
      <RouterLink to="/" class="phish-back back-link">Back to town</RouterLink>
      <h1 tabindex="-1">The Phishing Post-Mortem</h1>
    </div>

    <p v-if="busy && !snapshot" class="phish-state" role="status">Loading your run...</p>

    <p v-if="finishing" class="phish-state" role="status">Saving your run…</p>

    <div v-if="error" class="phish-state phish-error" role="alert">
      <p>{{ error }}</p>
      <button v-if="canRetry" type="button" class="triage-next" :disabled="busy" @click="retry">
        Retry
      </button>
    </div>

    <section v-if="!snapshot && !initializing" class="phish-state" aria-labelledby="phish-start">
      <h2 id="phish-start">Start a run</h2>
      <button type="button" class="triage-secondary" @click="showHowTo">How to play</button>
      <p class="phish-mode-line">
        Class: a 3-minute timed run for your class leaderboard. Personal: 12 emails, untimed
        practice.
      </p>
      <AttemptContextChooser
        :disabled="busy"
        label="Save this run to"
        submit-label="Start run"
        @start="begin"
      />
    </section>

    <section v-else-if="snapshot && legacy" class="phish-state" aria-labelledby="phish-earlier">
      <h2 id="phish-earlier">Earlier inbox investigation</h2>
      <p class="phish-earlier-score">{{ snapshot.score }} / {{ snapshot.maxScore }}</p>
      <button type="button" class="triage-next" @click="replay">Play again</button>
    </section>

    <component
      :is="showResult ? SavedAttemptResult : 'div'"
      v-else-if="snapshot"
      v-bind="showResult ? { attempt: snapshot, onReplay: replay } : {}"
    >
      <TriageDebrief
        v-if="showResult"
        :review="review ?? []"
        :score="score"
        :mistakes="mistakes"
        :rounds-played="roundsPlayed"
        :timed="timed"
        :end-reason="endReason"
      />

      <div v-else class="triage-run">
        <TriageStatusBar
          :timed="timed"
          :seconds-left="secondsLeft ?? 0"
          :score="score"
          :streak="streak"
          :mistakes="mistakes"
          :max-mistakes="maxMistakes ?? 3"
          :rounds-played="roundsPlayed"
          :total-rounds="totalRounds ?? 12"
        />

        <div class="triage-desk" :class="{ 'is-shaking': shaking }">
          <div v-if="timed" class="triage-live" aria-live="polite">
            <span
              v-if="stamp"
              :key="stamp.key"
              class="triage-stamp triage-stamp-float"
              :class="stamp.call === 'report' ? 'is-report' : 'is-trust'"
              aria-hidden="true"
            >
              {{ stamp.call === 'report' ? 'Reported' : 'Trusted' }}
            </span>
            <RoundFeedback v-if="last" :key="last.roundId" :last="last" :timed="true" />
          </div>

          <RoundFeedback
            v-if="holdFeedback"
            :key="last.roundId"
            :last="last"
            :email="previousEmail"
            :run-over="runOver"
            @next="nextEmail"
          />

          <template v-else-if="current">
            <TriageEmailCard
              :key="current.roundId"
              :email="current"
              :picking="picking"
              :disabled="locked"
              @select-part="pickPart"
              @cancel-pick="cancelPicking"
            />

            <div v-if="picking" class="triage-pick-bar">
              <p>Tap what gave it away</p>
              <button type="button" class="triage-secondary" @click="cancelPicking">Cancel</button>
            </div>
            <div v-else class="triage-controls">
              <button
                ref="reportButton"
                type="button"
                class="triage-report"
                :disabled="locked"
                @click="startPicking"
              >
                Report
              </button>
              <button type="button" class="triage-trust" :disabled="locked" @click="callTrust">
                Trust
              </button>
            </div>
          </template>
        </div>
      </div>
    </component>

    <HowToPlayDialog v-model:open="howToOpen" game-id="phishing-post-mortem" v-bind="HOW_TO_PLAY">
      <template #scene="scene">
        <HowToPlayScene v-if="howToOpen" :step="scene.step" :reduced-motion="scene.reducedMotion" />
      </template>
    </HowToPlayDialog>
  </div>
</template>
