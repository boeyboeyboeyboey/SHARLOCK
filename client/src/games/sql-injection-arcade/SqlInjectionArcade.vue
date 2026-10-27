<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AttemptContextChooser from '../../features/attempts/components/AttemptContextChooser.vue'
import SavedAttemptResult from '../../features/attempts/components/SavedAttemptResult.vue'
import MockAdminLogin from './components/MockAdminLogin.vue'
import QueryExplanation from './components/QueryExplanation.vue'
import RepairSelector from './components/RepairSelector.vue'
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
const { snapshot, busy, error, retryable, state, evaluation, repairPhase } = game
const hint = ref(false)
const initializing = ref(true)
const blocked = computed(() => busy.value || retryable.value)
async function start(context) {
  if (await game.start(context)) {
    hint.value = false
    await router.replace({ query: { attempt: snapshot.value.attemptId } })
  }
}
async function repair(optionId) {
  if (await game.mutate('select-repair', { optionId })) await game.complete()
}
async function replay() {
  await router.replace({ query: {} })
  snapshot.value = null
  hint.value = false
}
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
          A fictional customs terminal builds its login query by joining text. Your job is to show
          how an input can change the query, then choose a repair.
        </p>
        <p>
          <strong>★★☆ · SQL strings, Boolean conditions and comments.</strong> No timer. Five tests.
          Up to 100 points: 80 for the bypass and 20 for the repair.
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
          {{
            snapshot.feedback.bypassAchieved
              ? 'Breach demonstrated: +80 points.'
              : 'The bypass was not found this time. Review the example below and try again.'
          }}
        </p>
        <p>
          {{
            snapshot.feedback.repaired
              ? 'Ledger secured: +20 points.'
              : 'The reliable repair is to bind input as parameters. Removing spaces or hiding the query does not separate code from data.'
          }}
        </p>
        <QueryExplanation evaluation="BYPASS" mode="safe" />
        <p>
          Teaching example: <code>' OR 1=1 --</code>. The simulation changed no real account or
          privileges. Your score records this exercise, rather than a validated mastery measure.
        </p>
      </SavedAttemptResult>
    </div>
    <div v-else-if="snapshot?.status === 'active'" class="sql-play">
      <div class="sql-monitor sql-scroll" data-testid="sql-inspector-row">
        <QueryExplanation :evaluation="evaluation" />
        <ol class="sql-history" aria-label="Test history">
          <li v-for="(outcome, index) in state.evaluations" :key="index">
            Test {{ index + 1 }}:
            {{
              {
                BYPASS: 'Bypass found',
                FALSE_EQUALITY: 'False equality',
                NO_BREAKOUT: 'Input stayed data',
                UNSUPPORTED: 'Outside teaching grammar',
              }[outcome]
            }}
          </li>
        </ol>
      </div>
      <section class="sql-controls sql-scroll" aria-label="Case actions" data-testid="sql-test-row">
        <div class="sql-control-bar">
          <span class="sql-console-name">{{
            repairPhase ? '02 / PATCH THE QUERY' : '02 / PAYLOAD LAB'
          }}</span>
          <p class="sql-score">
            {{ snapshot.score }} / 100 points · {{ state.testCount }} / 5 tests
          </p>
          <p class="small">
            Case saved ·
            {{ snapshot.context.kind === 'personal' ? 'Personal practice' : 'Class practice' }}
          </p>
        </div>
        <template v-if="!repairPhase">
          <MockAdminLogin
            :disabled="blocked"
            :attempts-remaining="state.attemptsRemaining"
            @test-payload="game.mutate('test-payload', $event)"
          />
          <button class="text-link sql-hint" :aria-expanded="hint" @click="hint = !hint">
            {{ hint ? 'Hide hint' : 'Need a clue?' }}
          </button>
          <p v-if="hint" class="sql-clue" role="note">
            Try <code>' OR 1=1 --</code> in the fictional username field. First predict what each
            part changes.
          </p>
        </template>
        <RepairSelector
          v-else-if="!state.repairSelected"
          :options="state.repairOptions"
          :disabled="blocked"
          @select-repair="repair"
        />
        <div v-else>
          <h2>Repair recorded</h2>
          <p>Finish the case to save your final result.</p>
          <button class="btn btn-primary" :disabled="blocked" @click="game.complete">
            Finish and save result
          </button>
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
