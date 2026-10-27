<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AttemptContextChooser from '../../features/attempts/components/AttemptContextChooser.vue'
import SavedAttemptResult from '../../features/attempts/components/SavedAttemptResult.vue'
import HowToPlayDialog from '../../components/common/HowToPlayDialog.vue'
import { useHowToPlay } from '../../composables/useHowToPlay.js'
import AccessMatrix from './components/AccessMatrix.vue'
import DayControls from './components/DayControls.vue'
import DossierBrief from './components/DossierBrief.vue'
import EventLog from './components/EventLog.vue'
import HowToPlayScene from './components/HowToPlayScene.vue'
import LabelBoard from './components/LabelBoard.vue'
import LevelDebrief from './components/LevelDebrief.vue'
import LevelSelect from './components/LevelSelect.vue'
import PredictionPanel from './components/PredictionPanel.vue'
import RoleDesigner from './components/RoleDesigner.vue'
import TowerView from './components/TowerView.vue'
import { describeStep, starText } from './clearanceTower.js'
import { HOW_TO_PLAY } from './howToPlay.js'
import { useClearanceTower } from './composables/useClearanceTower.js'
import { useDayPlayback } from './composables/useDayPlayback.js'
import './clearance.css'

const route = useRoute()
const router = useRouter()
const {
  snapshot,
  busy,
  error,
  retryable,
  phase,
  levels,
  level,
  policy,
  predictions,
  result,
  state,
  allPredicted,
  nextLevelId,
  start,
  load,
  complete,
  retry,
  openLevel,
  runDay,
  showPhase,
  reset,
} = useClearanceTower()
const initializing = ref(true)
const { open: howToOpen, show: showHowTo } = useHowToPlay('clearance-tower')

const events = computed(() => result.value?.events ?? [])
const {
  current: currentEvent,
  shown: shownEvents,
  playing,
  finished,
  total,
  speed,
  play,
  pause,
  step,
  skip,
  setSpeed,
  reset: resetPlayback,
} = useDayPlayback(events)
const matrixView = ref('matrix')
const root = ref(null)
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

const showingTower = computed(() => ['design', 'predict', 'day', 'debrief'].includes(phase.value))

// a role needs a name before the server will accept it
const policyReady = computed(() => {
  if (level.value?.model !== 'rbac') return true
  return policy.value.roles.every((role) => role.name.trim().length > 0)
})

// move focus to the new step's heading so keyboard and screen-reader users follow along
watch(phase, async (current) => {
  matrixView.value = 'matrix'
  if (current === 'day') {
    resetPlayback()
    if (!reducedMotion) play()
  }
  await focusHeading()
})

async function focusHeading() {
  await nextTick()
  root.value?.querySelector('[data-phase-heading]')?.focus()
}

watch(() => snapshot.value?.attemptId, focusHeading)

async function begin(context) {
  if (await start(context)) {
    showPhase('levels')
    await router.replace({ query: { attempt: snapshot.value.attemptId } })
  }
}

async function replay() {
  await router.replace({ query: {} })
  reset()
}

onMounted(async () => {
  if (typeof route.query.attempt === 'string') await load(route.query.attempt)
  initializing.value = false
})
</script>

<template>
  <div ref="root" class="clearance-game is-fitted">
    <header class="clear-header">
      <RouterLink class="clear-back" to="/">Back to town</RouterLink>
      <h1>Clearance Tower</h1>
      <p class="clear-strap">
        Night shift at the Halcyon Agency. Decide who may see what, then watch the day test your
        policy. Each climb saves one result of up to 600 points.
      </p>
    </header>

    <div v-if="error" class="clear-alert" role="alert">
      {{ error }}
      <button v-if="retryable" type="button" class="clear-button" :disabled="busy" @click="retry">
        Retry same request
      </button>
    </div>
    <p v-if="busy || initializing" role="status">Checking the climb with the server…</p>

    <section
      v-if="!snapshot && !initializing"
      class="clear-card"
      aria-labelledby="clear-intro-title"
    >
      <h2 id="clear-intro-title">Start a climb</h2>
      <p>
        Six cases across discretionary, mandatory and role-based access control. Run each case once;
        the server scores the day and the climb totals up to 600 points.
      </p>
      <p>
        <button type="button" class="clear-button" @click="showHowTo">How to play</button>
      </p>
      <AttemptContextChooser :disabled="busy" @start="begin" />
    </section>

    <div v-else-if="snapshot?.status === 'completed'" class="clear-card clear-saved">
      <SavedAttemptResult :attempt="snapshot" @replay="replay">
        <ul class="clear-summary" aria-label="Score by case">
          <li v-for="item in state.levels" :key="item.id">
            {{ item.title }}:
            <template v-if="item.submitted">
              <span class="clear-number">{{ item.result.score }}</span> / 100
              <span :aria-label="`${item.result.stars} out of 3 stars`">{{
                starText(item.result.stars)
              }}</span>
            </template>
            <template v-else>not played, 0 / 100</template>
          </li>
        </ul>
        <p class="clear-hint">
          Your score records this exercise, rather than a validated measure of mastery.
        </p>
      </SavedAttemptResult>
    </div>

    <LevelSelect
      v-else-if="snapshot && phase === 'levels'"
      :levels="levels"
      :ready-to-complete="state.readyToComplete"
      :pending="busy"
      @select="openLevel"
      @finish="complete"
    />

    <DossierBrief
      v-else-if="snapshot && phase === 'brief'"
      :level="level"
      @begin="showPhase('design')"
      @back="showPhase('levels')"
    />

    <div v-else-if="snapshot && showingTower" class="clear-workspace">
      <TowerView
        :level="level"
        :policy="policy"
        :current-event="currentEvent"
        :shown-events="shownEvents"
      />

      <div class="clear-desk">
        <section v-if="phase === 'design'" class="clear-card" aria-labelledby="clear-design-title">
          <h2 id="clear-design-title" tabindex="-1" data-phase-heading>
            Policy desk · {{ level.title }}
          </h2>
          <AccessMatrix
            v-if="level.model === 'dac'"
            v-model="policy.grants"
            v-model:view="matrixView"
            :agents="level.agents"
            :files="level.files"
          />
          <LabelBoard
            v-else-if="level.model === 'blp'"
            v-model="policy.objectLabels"
            :files="level.files"
            :clearances="level.clearances"
            :categories="level.categories"
          />
          <RoleDesigner v-else v-model="policy" :level="level" />
          <details class="clear-tasks">
            <summary>Today’s work ({{ level.tasks.length }})</summary>
            <ul>
              <li v-for="task in level.tasks" :key="`${task.agent}-${task.action}-${task.file}`">
                {{ describeStep(level, task) }}
              </li>
            </ul>
          </details>
          <p v-if="!policyReady" class="clear-warning">Give every role a name first.</p>
          <div class="clear-actions">
            <button type="button" class="clear-button" @click="showPhase('brief')">Dossier</button>
            <button
              type="button"
              class="clear-button is-primary"
              :disabled="!policyReady"
              @click="showPhase('predict')"
            >
              Next: predict
            </button>
          </div>
        </section>

        <section
          v-else-if="phase === 'predict'"
          class="clear-card"
          aria-labelledby="clear-predict-title"
        >
          <h2 id="clear-predict-title" tabindex="-1" data-phase-heading>
            Make your calls before the doors open
          </h2>
          <p class="clear-hint">
            Each call is judged on the rules of this case, and correct calls score points.
          </p>
          <PredictionPanel v-model="predictions" :prompts="level.predictions" :disabled="busy" />
          <div class="clear-actions">
            <button type="button" class="clear-button" @click="showPhase('design')">
              Back to policy
            </button>
            <button
              type="button"
              class="clear-button is-primary"
              :disabled="!allPredicted || busy || retryable"
              @click="runDay"
            >
              {{ busy ? 'Running…' : 'Run the day' }}
            </button>
          </div>
        </section>

        <section v-else-if="phase === 'day'" class="clear-card" aria-labelledby="clear-day-title">
          <h2 id="clear-day-title" tabindex="-1" data-phase-heading>The day plays out</h2>
          <DayControls
            :playing="playing"
            :finished="finished"
            :position="shownEvents.length"
            :total="total"
            :speed="speed"
            @play="play"
            @pause="pause"
            @step="step"
            @skip="skip"
            @update:speed="setSpeed"
          />
          <EventLog :level="level" :events="shownEvents" />
          <div class="clear-actions">
            <button
              type="button"
              class="clear-button is-primary"
              :disabled="!finished"
              @click="showPhase('debrief')"
            >
              Open the case file
            </button>
          </div>
        </section>

        <LevelDebrief
          v-else
          :level="level"
          :result="result"
          :has-next="Boolean(nextLevelId)"
          @next="openLevel(nextLevelId)"
          @levels="showPhase('levels')"
        />
      </div>
    </div>
    <HowToPlayDialog v-model:open="howToOpen" game-id="clearance-tower" v-bind="HOW_TO_PLAY">
      <template #scene="scene">
        <HowToPlayScene
          :step="scene.step"
          :playing="scene.playing"
          :reduced-motion="scene.reducedMotion"
        />
      </template>
    </HowToPlayDialog>
  </div>
</template>
