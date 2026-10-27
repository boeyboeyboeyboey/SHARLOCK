<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import BriefingPanel from './components/BriefingPanel.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import GameMenu from './components/GameMenu.vue'
import CommandReference from './components/CommandReference.vue'
import IncidentBanner from './components/IncidentBanner.vue'
import PausedPanel from './components/PausedPanel.vue'
import ReviewNote from './components/ReviewNote.vue'
import ScoreHud from './components/ScoreHud.vue'
import ShiftDebrief from './components/ShiftDebrief.vue'
import TerminalPanel from './components/TerminalPanel.vue'
import { COMMAND_TEMPLATES, MAX_COMMAND_LENGTH } from './cliDefender.js'
import { useCliDefender } from './composables/useCliDefender.js'
import { useCliSound } from './composables/useCliSound.js'
import './cli.css'

const sound = useCliSound()
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
  lastReview,
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

// a timed clock stops while the player decides, and restarts if they stay
async function askToLeave() {
  confirmingLeave.value = true
  pausedForLeave = await pause('Game paused while you decide whether to leave.')
}

function stay() {
  confirmingLeave.value = false
  if (pausedForLeave) resume()
  pausedForLeave = false
}

function leave() {
  confirmingLeave.value = false
  pausedForLeave = false
  replay()
}

const terminal = ref(null)

function insertTemplate(template) {
  draft.value = template
  terminal.value?.focus()
}

// a tapped name completes a picked command template, otherwise it starts the command
function insertTarget(target) {
  const typed = draft.value.trimStart().toLowerCase()
  const template = COMMAND_TEMPLATES.find((item) => typed.startsWith(item.template.trim()))
  draft.value = template ? `${template.template}${target}` : target
  terminal.value?.focus()
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

watch([phase, paused], async ([next, isPaused]) => {
  if (next !== 'running' || isPaused) return
  await nextTick()
  terminal.value?.focus()
})
</script>

<template>
  <div class="cli-game is-fitted">
    <div class="cli-intro">
      <nav class="cli-nav" aria-label="Game navigation">
        <RouterLink v-if="!inGame" to="/" class="cli-back back-link"
          ><span aria-hidden="true">&larr;&nbsp;</span>Back to town</RouterLink
        >
        <span v-if="inGame && mode === 'practice'" class="cli-mode-tag">Practice</span>
        <GameMenu
          v-if="inGame"
          class="ms-auto"
          :can-pause="mode === 'timed' && phase === 'running'"
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
      <p class="cli-strap">
        Contain fictional incidents from a simulated terminal. Nothing here is real.
      </p>
    </div>

    <BriefingPanel
      v-if="phase === 'briefing' || phase === 'starting'"
      :pending="phase === 'starting'"
      :error="error"
      @start="start"
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
      />
      <div :class="['cli-stage', { 'is-paused': paused }]">
        <PausedPanel v-if="paused" :pending="resuming" @resume="resume" />
        <div class="row g-3 align-items-stretch" :inert="paused" :aria-hidden="paused">
          <div class="col-12 col-xl-5 d-flex flex-column gap-3">
            <IncidentBanner
              :incident="current"
              :remaining-ms="remainingMs"
              :mode="mode"
              :interactive="phase === 'running'"
              :can-hint="mode === 'practice' && phase === 'running'"
              :hint-disabled="hinting || !current || current.hintLine != null"
              @select-target="insertTarget"
              @hint="hint"
            />
            <ReviewNote class="d-none d-xl-block" :review="lastReview" />
          </div>
          <div class="col-12 col-xl-7 d-flex flex-column gap-2">
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
      @confirm="leave"
      @cancel="stay"
    >
      <p>Points from this game won't be saved.</p>
    </ConfirmDialog>
  </div>
</template>
