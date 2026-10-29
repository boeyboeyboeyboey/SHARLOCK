<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AttemptContextChooser from '../../features/attempts/components/AttemptContextChooser.vue'
import SavedAttemptResult from '../../features/attempts/components/SavedAttemptResult.vue'
import AttemptForm from './components/AttemptForm.vue'
import BlindAnswer from './components/BlindAnswer.vue'
import CasePanel from './components/CasePanel.vue'
import HintPanel from './components/HintPanel.vue'
import RepairSelector from './components/RepairSelector.vue'
import ResultPanel from './components/ResultPanel.vue'
import RunHud from './components/RunHud.vue'
import RunReview from './components/RunReview.vue'
import HowToPlayScene from './components/HowToPlayScene.vue'
import HowToPlayDialog from '../../components/common/HowToPlayDialog.vue'
import { useHowToPlay } from '../../composables/useHowToPlay.js'
import { HOW_TO_PLAY } from './howToPlay.js'
import { useSqlInjection } from './useSqlInjection.js'
import './sql.css'

const { open: howToOpen, show: showHowTo } = useHowToPlay('sql-injection-arcade')
const route = useRoute()
const router = useRouter()
const game = useSqlInjection()
const { snapshot, busy, error, retryable, state, current, last, timed, secondsLeft } = game
const initializing = ref(true)
const resultRegion = ref(null)
const controls = ref(null)
const blocked = computed(() => busy.value || retryable.value)
const kind = computed(() => current.value?.kind)
const isLogin = computed(() => kind.value?.startsWith('login') ?? false)
const takesOneField = computed(() => ['login-numeric', 'union', 'blind'].includes(kind.value))
const showForm = computed(() => current.value && !game.reviewing.value)
const canHint = computed(() => !timed.value && showForm.value && kind.value !== 'repair')
const feedback = computed(() => snapshot.value?.feedback ?? {})

async function start(context) {
  if (await game.start(context))
    await router.replace({ query: { attempt: snapshot.value.attemptId } })
}
async function replay() {
  await router.replace({ query: {} })
  snapshot.value = null
}
async function focusFirstControl() {
  await nextTick()
  controls.value
    ?.querySelector('.sql-case-form input, .sql-case-form button:not([disabled])')
    ?.focus()
}
function nextCase() {
  game.next()
  focusFirstControl()
}
// a new server state moves focus to the result so the outcome is announced and reachable
let wasAssisted = false
watch(
  () => snapshot.value?.revision,
  async (revision, previous) => {
    const assisted = Boolean(current.value?.assisted)
    const hinted = assisted && !wasAssisted
    wasAssisted = assisted
    if (previous === undefined) return
    await nextTick()
    if (hinted) controls.value?.querySelector('.sql-hint-text')?.focus()
    else if (last.value) resultRegion.value?.focus()
  },
)
onMounted(async () => {
  if (typeof route.query.attempt === 'string') await game.load(route.query.attempt)
  initializing.value = false
})
</script>
<template>
  <div class="sql-game is-fitted">
    <header class="sql-header">
      <RouterLink to="/" class="text-link">← Back to town</RouterLink>
      <p class="sql-eyebrow">H.M. Customs House / Database security lab</p>
      <h1 tabindex="-1">SQL Injection Arcade</h1>
      <p class="sql-tagline">Inspect the query. Break the pattern. Bind the data.</p>
    </header>
    <div v-if="error" class="sql-error" role="alert">
      {{ error }}
      <button v-if="retryable" class="btn btn-primary" :disabled="busy" @click="game.retry">
        Retry same request
      </button>
      <button
        v-else-if="snapshot"
        class="btn btn-outline-primary"
        :disabled="busy"
        @click="game.load(snapshot.attemptId)"
      >
        Reload case
      </button>
      <RouterLink v-if="!retryable" to="/login" class="text-link">Sign in</RouterLink>
    </div>
    <p v-if="busy || initializing" role="status">Checking the case with the server…</p>
    <div v-if="!snapshot && !initializing" class="sql-scroll sql-briefing">
      <div class="sql-briefing-copy">
        <h2>The ledger has a loose lock</h2>
        <p>
          Fictional customs systems build their queries by joining text. Each case shows one query.
          Your job is to show how an input can change it, then choose the real fix.
        </p>
        <p>
          <strong>★★★ · Login bypass, UNION, blind and second-order injection.</strong> A class run
          lasts 180 seconds with 3 lives and ranks on the class leaderboard. Personal practice is
          untimed, with 12 cases, 3 repairs and hints.
        </p>
        <p>
          New to SQL? A quote marks text, <code>OR</code> combines conditions, and
          <code>--</code> starts a comment in this simplified exercise. Only a small teaching
          grammar is supported.
        </p>
      </div>
      <button type="button" class="btn btn-outline-primary" @click="showHowTo">How to play</button>
      <AttemptContextChooser class="sql-briefing-start" :disabled="busy" @start="start" />
    </div>
    <div v-else-if="snapshot?.status === 'completed'" class="sql-scroll sql-result">
      <SavedAttemptResult :attempt="snapshot" @replay="replay">
        <p>
          Solved {{ feedback.casesSolved }}, failed {{ feedback.casesFailed }}, repairs correct
          {{ feedback.repairsCorrect }}, assisted {{ feedback.assistedCases }}.
          {{
            feedback.verdictCode === 'SQL_RUN_LIVES_OUT'
              ? 'The run ended when your lives ran out.'
              : 'The run reached its end.'
          }}
        </p>
        <RunReview :review="state.review" />
        <p>
          The reliable repair is always to bind input as parameters. The simulation changed no real
          account or privileges. Your score records this exercise, rather than a validated mastery
          measure.
        </p>
      </SavedAttemptResult>
    </div>
    <div v-else-if="snapshot?.status === 'active'" class="sql-play">
      <div class="sql-monitor sql-scroll" data-testid="sql-inspector-row">
        <CasePanel v-if="current" :current="current" />
        <section v-else class="sql-explanation" aria-label="Case file">
          <div class="sql-monitor-bar">
            <h2><span class="sql-console-name">01 / </span>Run complete</h2>
          </div>
          <div class="sql-query-content">
            <p>No more cases are open. Save the run to see your review.</p>
          </div>
        </section>
      </div>
      <section
        ref="controls"
        class="sql-controls sql-scroll"
        aria-label="Case actions"
        data-testid="sql-test-row"
      >
        <div class="sql-control-bar">
          <RunHud
            :timed="timed"
            :number="current?.number ?? null"
            :total-cases="state.totalCases"
            :repair="kind === 'repair'"
            :score="state.score"
            :lives="state.lives"
            :max-lives="state.maxLives"
            :seconds-left="secondsLeft"
            :tries-left="showForm && kind !== 'repair' ? current.triesLeft : null"
            :tries-max="showForm && kind !== 'repair' ? current.triesMax : null"
          />
        </div>
        <div class="sql-case-body">
          <div
            ref="resultRegion"
            class="sql-result-region"
            tabindex="-1"
            aria-live="polite"
            data-testid="sql-result"
          >
            <ResultPanel
              v-if="last"
              :last="last"
              :reviewing="game.reviewing.value"
              :final="game.runOver.value"
              :disabled="blocked"
              @next="nextCase"
              @finish="game.complete"
            />
          </div>
          <div v-if="showForm" :key="current.caseId" class="sql-case-form">
            <AttemptForm
              v-if="isLogin || takesOneField"
              :fields="current.fields"
              :disabled="blocked"
              :submit-label="kind === 'blind' ? 'Send probe' : 'Run the query'"
              @submit="game.submitInputs"
            />
            <BlindAnswer
              v-if="kind === 'blind' && current.canAnswer"
              :question="current.question"
              :disabled="blocked"
              @answer="game.answer"
            />
            <template v-if="kind === 'second-order'">
              <AttemptForm
                v-if="current.phase === 'register'"
                :fields="current.fields"
                :maxlength="40"
                submit-label="Register"
                :disabled="blocked"
                @submit="game.register($event[0])"
              />
              <div v-else class="sql-form-fields">
                <p>
                  Registered as <code>{{ current.stored }}</code
                  >. The change password feature now uses this stored name.
                </p>
                <button
                  type="button"
                  class="btn btn-primary"
                  :disabled="blocked"
                  @click="game.changePassword"
                >
                  Change password
                </button>
              </div>
            </template>
            <RepairSelector
              v-if="kind === 'repair'"
              :options="current.options"
              :disabled="blocked"
              @select-repair="game.chooseFix"
            />
            <HintPanel
              v-if="canHint"
              :hint="current.hint"
              :assisted="current.assisted"
              :disabled="blocked"
              @hint="game.requestHint"
            />
          </div>
          <div v-else-if="game.runOver.value && !last" class="sql-form-submit">
            <button
              type="button"
              class="btn btn-primary"
              :disabled="blocked"
              @click="game.complete"
            >
              Finish and save result
            </button>
          </div>
        </div>
      </section>
    </div>
    <p v-else-if="snapshot" class="sql-scroll">
      This case has ended.
      <button class="btn btn-primary" @click="replay">Open another case</button>
    </p>
    <HowToPlayDialog v-model:open="howToOpen" game-id="sql-injection-arcade" v-bind="HOW_TO_PLAY">
      <template #scene="scene">
        <HowToPlayScene v-if="howToOpen" :step="scene.step" :reduced-motion="scene.reducedMotion" />
      </template>
    </HowToPlayDialog>
  </div>
</template>
