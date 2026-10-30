<script setup>
import { computed, ref } from 'vue'
import HowToPlayDialog from '../../components/common/HowToPlayDialog.vue'
import { useHowToPlay } from '../../composables/useHowToPlay.js'
import AttemptContextChooser from '../../features/attempts/components/AttemptContextChooser.vue'
import CallerCard from './components/CallerCard.vue'
import ChatThread from './components/ChatThread.vue'
import DecisionBar from './components/DecisionBar.vue'
import DeskTools from './components/DeskTools.vue'
import HowToPlayScene from './components/HowToPlayScene.vue'
import MessageComposer from './components/MessageComposer.vue'
import ShiftStatus from './components/ShiftStatus.vue'
import ShiftSummary from './components/ShiftSummary.vue'
import TellsDebrief from './components/TellsDebrief.vue'
import { useHelpDeskShift } from './composables/useHelpDeskShift.js'
import { HOW_TO_PLAY } from './howToPlay.js'
import { MAX_MESSAGE_LENGTH } from './simulator.js'
import './sim.css'

const { open: howToOpen, show: showHowTo } = useHowToPlay('social-engineering-simulator')
const shift = useHelpDeskShift()

// which chat the composer talks to: the caller or the colleague
const target = ref('caller')
const onColleague = computed(() => target.value === 'colleague')
const thread = computed(() =>
  onColleague.value ? shift.colleagueMessages.value : shift.messages.value,
)
const threadName = computed(() =>
  onColleague.value ? shift.call.value.colleague.displayName : shift.call.value.caller.displayName,
)
const composerOpen = computed(() =>
  onColleague.value ? shift.asksLeft.value > 0 : shift.messagesLeft.value > 0,
)

function sendActive(text) {
  return onColleague.value ? shift.ask(text) : shift.send(text)
}

function nextCall() {
  target.value = 'caller'
  return shift.next()
}

function restart() {
  target.value = 'caller'
  shift.reset()
}
</script>

<template>
  <div class="soc-game is-wide">
    <RouterLink to="/" class="soc-back back-link">Back to town</RouterLink>
    <div class="soc-intro">
      <h1 tabindex="-1">Help Desk Shift</h1>
    </div>

    <div v-if="shift.status.value === 'choosing'" class="soc-state soc-start">
      <button type="button" class="soc-button soc-button-choice" @click="showHowTo">
        How to play
      </button>
      <AttemptContextChooser
        :disabled="shift.pending.value"
        label="Save this shift to"
        submit-label="Start the shift"
        @start="shift.start"
      />
    </div>

    <p v-else-if="shift.status.value === 'loading'" class="soc-state" role="status">&hellip;</p>

    <div v-else-if="shift.status.value === 'error'" class="soc-state soc-error" role="alert">
      <p>{{ shift.error.value }}</p>
      <button type="button" class="soc-button soc-button-primary" @click="restart">
        New shift
      </button>
    </div>

    <ShiftSummary
      v-else-if="shift.status.value === 'summary'"
      :result="shift.result.value"
      :retrying="shift.retrying.value"
      :retry-error="shift.saveRetryError.value"
      @retry-save="shift.retrySave"
      @restart="restart"
    />

    <div v-else-if="shift.call.value" class="soc-shift">
      <ShiftStatus
        :call-index="shift.callIndex.value"
        :calls-total="shift.callsTotal.value"
        :strikes="shift.strikes.value"
        :max-strikes="shift.maxStrikes.value"
        :trust="shift.trust.value"
        :streak="shift.streak.value"
      />
      <CallerCard :call="shift.call.value" />

      <TellsDebrief
        v-if="shift.status.value === 'debrief'"
        :debrief="shift.debrief.value"
        :pending="shift.pending.value"
        @next="nextCall"
        @finish="shift.finish"
      />

      <template v-else>
        <div class="soc-shift-chat">
          <div class="soc-chat-target" role="group" aria-label="Chat with">
            <button
              type="button"
              class="soc-button"
              :aria-pressed="!onColleague"
              @click="target = 'caller'"
            >
              {{ shift.call.value.caller.displayName }}
            </button>
            <button
              type="button"
              class="soc-button"
              :aria-pressed="onColleague"
              @click="target = 'colleague'"
            >
              {{ shift.call.value.colleague.displayName }} ({{ shift.asksLeft.value }})
            </button>
          </div>
          <ChatThread
            :messages="thread"
            :pending="shift.pending.value"
            :persona-name="threadName"
          />
          <MessageComposer
            v-if="composerOpen"
            :key="target"
            :disabled="!shift.canAct.value"
            :max-length="MAX_MESSAGE_LENGTH"
            @send="sendActive"
          />
          <p v-if="shift.error.value" class="soc-alert soc-alert-bad" role="alert">
            {{ shift.error.value }}
          </p>
        </div>
        <DeskTools
          :tools="shift.tools.value"
          :hints="shift.hints.value"
          :hints-left="shift.hintsLeft.value"
          :disabled="!shift.canAct.value"
          @tool="shift.useTool"
          @hint="shift.hint"
        />
        <DecisionBar :disabled="!shift.canAct.value" @decide="shift.decide" />
      </template>
    </div>

    <HowToPlayDialog
      v-model:open="howToOpen"
      game-id="social-engineering-simulator"
      v-bind="HOW_TO_PLAY"
    >
      <template #scene="scene">
        <HowToPlayScene v-if="howToOpen" :step="scene.step" :reduced-motion="scene.reducedMotion" />
      </template>
    </HowToPlayDialog>
  </div>
</template>
