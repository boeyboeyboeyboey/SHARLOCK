<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import HowToPlayDialog from '../../components/common/HowToPlayDialog.vue'
import { useHowToPlay } from '../../composables/useHowToPlay.js'
import { useInteriorLeave } from '../../features/interiors/useInteriorLeave.js'
import BriefingPanel from './components/BriefingPanel.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import GameMenu from './components/GameMenu.vue'
import HowToPlayScene from './components/HowToPlayScene.vue'
import CommandReference from './components/CommandReference.vue'
import IncidentBanner from './components/IncidentBanner.vue'
import PausedPanel from './components/PausedPanel.vue'
import ReviewNote from './components/ReviewNote.vue'
import ScoreHud from './components/ScoreHud.vue'
import ShiftDebrief from './components/ShiftDebrief.vue'
import TerminalPanel from './components/TerminalPanel.vue'
import { COMMAND_TEMPLATES, MAX_COMMAND_LENGTH } from './cliDefender.js'
import { HOW_TO_PLAY } from './howToPlay.js'
import { useCliDefender } from './composables/useCliDefender.js'
import { useCliSound } from './composables/useCliSound.js'
import './cli.css'

const sound = useCliSound()
const { open: howToOpen, show: showHowTo } = useHowToPlay('cli-cyber-defender')
const flash = ref(null)
const flashKey = ref(0)
const shaking = ref(false)
const STAMPS = { ok: 'CONTAINED', fail: 'BREACH', miss: 'MISSED' }

// game events drive the optional beeps and the screen flash or shake
function onEvent(kind) {
  sound.play(kind)
  if (kind === 'alert') return
  flash.value = kind
  flashKey.value += 1
  if (kind === 'ok') return
  shaking.value = false
  requestAnimationFrame(() => {
    shaking.value = true
  })
}

const {
  phase,
  mode,
  snapshot,
  result,
  lines,
  commandHistory,
  draft,
  pending,
  error,
  current,
  remainingMs,
  paused,
  resuming,
  canPause,
  pauseBudget,
  pauseSecondsLeft,
  lastReview,
  penalty,
  hinting,
  saving,
  runContext,
  start,
  hint,
  resume,
  submit,
  finish,
  endPractice,
  replay,
  retrySave,
  pause,
} = useCliDefender({ onEvent })

const confirmingLeave = ref(false)
let pausedForLeave = false
const inGame = computed(() => ['running', 'finishing'].includes(phase.value))
const pauseNote = computed(() =>
  mode.value === 'timed' && phase.value === 'running' && !paused.value && !canPause.value
    ? 'No pauses left in this game.'
    : '',
)
const canPauseFromMenu = computed(
  () => mode.value === 'timed' && phase.value === 'running' && (paused.value || canPause.value),
)
// the route guard waits on this while the leave dialog is open
let settleRouteLeave = null

// a timed clock stops while the player decides, and restarts if they stay
async function askToLeave() {
  if (confirmingLeave.value) return
  confirmingLeave.value = true
  pausedForLeave = await pause('Game paused while you decide whether to leave.', { forLeave: true })
}

// what the clock is doing behind either leave dialog; the hold has a fixed total for the whole game
const leaveClockNote = computed(() => {
  if (mode.value !== 'timed' || phase.value !== 'running') return ''
  if (!paused.value) return 'Your time to decide is used up, so the clock is running.'
  const seconds = pauseSecondsLeft.value ?? 0
  return `The clock is held while you decide, for ${seconds} more second${seconds === 1 ? '' : 's'}.`
})

function stay() {
  confirmingLeave.value = false
  if (pausedForLeave) resume()
  pausedForLeave = false
  settleRouteLeave?.(false)
  settleRouteLeave = null
}

function leave() {
  confirmingLeave.value = false
  pausedForLeave = false
  replay()
  settleRouteLeave?.(true)
  settleRouteLeave = null
}

// the shared top bar's leave dialog holds the clock the same way, from the same fixed total
let pausedForSharedLeave = false
useInteriorLeave({
  note: leaveClockNote,
  onOpen: async () => {
    pausedForSharedLeave = await pause('Game paused while you decide whether to leave.', {
      forLeave: true,
    })
  },
  onClose: () => {
    if (pausedForSharedLeave) resume()
    pausedForSharedLeave = false
  },
})

// browser back or forward has no dialog of its own; our top bar asks through its own guard, and
// only a history move has already updated history.state when this runs
onBeforeRouteLeave((to) => {
  if (!inGame.value || globalThis.history?.state?.current !== to.fullPath) return true
  return new Promise((resolve) => {
    // a second back while the dialog is open replaces the first, which stays on this page
    settleRouteLeave?.(false)
    settleRouteLeave = resolve
    askToLeave()
  })
})

// a reload or a closed tab throws the run away, so the browser asks first
function warnBeforeUnload(event) {
  if (!inGame.value) return
  event.preventDefault()
  event.returnValue = ''
}
onMounted(() => globalThis.addEventListener?.('beforeunload', warnBeforeUnload))
onBeforeUnmount(() => globalThis.removeEventListener?.('beforeunload', warnBeforeUnload))

const terminal = ref(null)

// on a touch screen focusing the input raises the keyboard over the alert, so tapping a template
// or a name only fills the prompt; the player taps the input to type
function usesTouch() {
  return Boolean(globalThis.matchMedia?.('(pointer: coarse)').matches)
}

function focusPrompt() {
  if (!usesTouch()) terminal.value?.focus()
}

function focusConsole() {
  if (usesTouch()) terminal.value?.focusLog?.()
  else terminal.value?.focus()
}

function onLeaveDialogClosed() {
  if (phase.value === 'running' && !paused.value) focusConsole()
}

function insertTemplate(template) {
  draft.value = template
  focusPrompt()
}

// a tapped name completes a picked command template, otherwise it starts the command
function insertTarget(target) {
  const typed = draft.value.trimStart().toLowerCase()
  const template = COMMAND_TEMPLATES.find((item) => typed.startsWith(item.template.trim()))
  draft.value = template && !template.noTarget ? `${template.template}${target}` : target
  focusPrompt()
}

function onShakeEnd(event) {
  if (event.animationName === 'cli-shake') shaking.value = false
}

// a new game must not replay the last game's outcome flash when its console mounts
watch(phase, (next) => {
  if (next === 'briefing' || next === 'starting') {
    flash.value = null
    shaking.value = false
  }
})

const gameRoot = ref(null)

watch([phase, paused], async ([next, isPaused], [previous]) => {
  if (next !== 'running' || isPaused) return
  await nextTick()
  // on a phone the game fills one screen while playing, so line it up with the top of the window
  if (previous !== 'running' && globalThis.matchMedia?.('(max-width: 767.98px)').matches)
    gameRoot.value?.scrollIntoView?.({ block: 'start' })
  focusConsole()
})

const alertColumn = ref(null)

// on a phone the alert scrolls with the page, so bring each new alert back into view
watch(
  () => current.value?.incidentId,
  async (next, previous) => {
    if (!next || !previous || !globalThis.matchMedia?.('(max-width: 575.98px)').matches) return
    await nextTick()
    alertColumn.value?.scrollIntoView?.({ block: 'start' })
  },
)
</script>

<template>
  <div ref="gameRoot" :class="['cli-game', 'is-fitted', { 'is-playing': inGame }]">
    <div class="cli-intro">
      <nav class="cli-nav" aria-label="Game navigation">
        <RouterLink v-if="!inGame" to="/" class="cli-back back-link"
          ><span aria-hidden="true">&larr;&nbsp;</span>Back to town</RouterLink
        >
        <span v-if="inGame && mode === 'practice'" class="cli-mode-tag">Practice</span>
        <GameMenu
          v-if="inGame"
          class="ms-auto"
          :can-pause="canPauseFromMenu"
          :pause-note="pauseNote"
          :paused="paused"
          :can-end="mode === 'practice' && phase === 'running'"
          :sound-on="sound.enabled.value"
          :sound-unavailable="sound.unavailable.value"
          @pause="pause('Game paused.')"
          @resume="resume"
          @toggle-sound="sound.toggle"
          @end="endPractice"
          @leave="askToLeave"
        />
      </nav>
      <h1 tabindex="-1">CLI Cyber Defender</h1>
    </div>

    <BriefingPanel
      v-if="phase === 'briefing' || phase === 'starting'"
      :pending="phase === 'starting'"
      :error="error"
      @start="start"
      @how-to-play="showHowTo"
    />

    <ShiftDebrief
      v-else-if="phase === 'debrief' && result"
      :result="result"
      :saving="saving"
      :context="runContext"
      @retry-save="retrySave"
      @replay="start($event.mode, $event.context)"
      @menu="replay"
    />

    <div
      v-else
      :class="['cli-console', 'd-grid', 'gap-3', { 'cli-shake': shaking }]"
      @animationend.self="onShakeEnd"
    >
      <div
        v-if="flash"
        :key="flashKey"
        :class="['cli-flash', `cli-flash-${flash}`]"
        data-testid="cli-flash"
        aria-hidden="true"
      >
        <span class="cli-stamp">{{ STAMPS[flash] }}</span>
      </div>
      <ScoreHud
        :score="snapshot?.score ?? 0"
        :streak="snapshot?.streak ?? 0"
        :multiplier="snapshot?.multiplier ?? 1"
        :remaining-ms="remainingMs"
        :resolved-count="snapshot?.resolvedCount ?? 0"
        :total="snapshot?.incidentCount ?? 8"
        :mode="mode"
        :history="snapshot?.history ?? []"
        :current-index="current?.index ?? null"
        :penalty="penalty"
      />
      <div :class="['cli-stage', { 'is-paused': paused }]" data-testid="cli-stage">
        <PausedPanel
          v-if="paused"
          :pending="resuming"
          :seconds-left="pauseSecondsLeft"
          :pauses-left="pauseBudget?.pausesLeft ?? null"
          @resume="resume"
        />
        <div class="row g-3 align-items-stretch" :inert="paused" :aria-hidden="paused">
          <div ref="alertColumn" class="cli-alert-col col-12 col-xl-5 d-flex flex-column gap-3">
            <IncidentBanner
              :incident="current"
              :remaining-ms="remainingMs"
              :mode="mode"
              :interactive="phase === 'running'"
              :can-hint="mode === 'practice' && phase === 'running'"
              :hint-disabled="hinting || !current || (current.hintTier ?? 0) >= 2"
              @select-target="insertTarget"
              @hint="hint"
            />
            <ReviewNote class="d-none d-xl-block" :review="lastReview" />
          </div>
          <div class="cli-terminal-col col-12 col-xl-7 d-flex flex-column gap-2">
            <TerminalPanel
              ref="terminal"
              v-model="draft"
              class="flex-grow-1"
              :lines="lines"
              :history="commandHistory"
              :disabled="phase !== 'running'"
              :busy="pending"
              :max-length="MAX_COMMAND_LENGTH"
              @submit-command="submit"
            />
            <CommandReference :disabled="phase !== 'running'" @insert-template="insertTemplate" />
          </div>
        </div>
      </div>
      <p v-if="phase === 'finishing' && !error" class="cli-note" role="status">
        Game over. Preparing your debrief&hellip;
      </p>
      <div v-if="error" class="cli-alert" role="alert">
        <p>{{ error }}</p>
        <button v-if="phase === 'finishing'" type="button" class="btn" @click="finish">
          Retry debrief
        </button>
      </div>
    </div>
    <ConfirmDialog
      id="cli-leave-confirm"
      :open="confirmingLeave"
      title="Leave this game?"
      confirm-label="Leave game"
      cancel-label="Keep playing"
      focus="cancel"
      @confirm="leave"
      @cancel="stay"
      @closed="onLeaveDialogClosed"
    >
      <p>Points from this game won't be saved.</p>
      <p v-if="leaveClockNote" data-testid="cli-leave-clock">{{ leaveClockNote }}</p>
    </ConfirmDialog>
    <HowToPlayDialog v-model:open="howToOpen" game-id="cli-cyber-defender" v-bind="HOW_TO_PLAY">
      <template #scene="scene">
        <HowToPlayScene v-if="howToOpen" :step="scene.step" />
      </template>
    </HowToPlayDialog>
  </div>
</template>
