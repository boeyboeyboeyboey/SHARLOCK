<script setup>
import { computed } from 'vue'
import HowToPlayDialog from '../../components/common/HowToPlayDialog.vue'
import { useHowToPlay } from '../../composables/useHowToPlay.js'
import AttemptContextChooser from '../../features/attempts/components/AttemptContextChooser.vue'
import ChatThread from './components/ChatThread.vue'
import ConversationTabs from './components/ConversationTabs.vue'
import DecisionBar from './components/DecisionBar.vue'
import DebriefPanel from './components/DebriefPanel.vue'
import MessageComposer from './components/MessageComposer.vue'
import HowToPlayScene from './components/HowToPlayScene.vue'
import ScenarioBrief from './components/ScenarioBrief.vue'
import { useSocialEngineeringSession } from './composables/useSocialEngineeringSession.js'
import { HOW_TO_PLAY } from './howToPlay.js'
import { MAX_MESSAGE_LENGTH } from './simulator.js'
import './sim.css'

const { open: howToOpen, show: showHowTo } = useHowToPlay('social-engineering-simulator')

const {
  status,
  pending,
  persona,
  brief,
  messages,
  turnsUsed,
  turnBudget,
  leaked,
  closed,
  result,
  error,
  resetCode,
  saveRetryError,
  retrying,
  verifier,
  verifierMessages,
  verifierPending,
  verifierTurnsUsed,
  verifierTurnBudget,
  verifierError,
  verifierEnded,
  verifierFailedText,
  activeChat,
  unread,
  canSendVerifier,
  selectChat,
  sendVerifier,
  canSend,
  start,
  begin,
  send,
  complete,
  retrySave,
  reset,
} = useSocialEngineeringSession()

const personaName = computed(() => persona.value?.displayName ?? 'Colleague')
const verifierName = computed(() => verifier.value?.displayName ?? 'Colleague')
const onVerifierTab = computed(() => Boolean(verifier.value) && activeChat.value === 'verifier')
const tabs = computed(() => [
  { id: 'attacker', label: personaName.value, unread: unread.attacker },
  { id: 'verifier', label: verifierName.value, unread: unread.verifier },
])
const threadMessages = computed(() =>
  onVerifierTab.value ? verifierMessages.value : messages.value,
)
const threadPending = computed(() => (onVerifierTab.value ? verifierPending.value : pending.value))
const threadName = computed(() => (onVerifierTab.value ? verifierName.value : personaName.value))
const showComposer = computed(() =>
  onVerifierTab.value ? !verifierEnded.value && !leaked.value : !closed.value,
)
const composerDisabled = computed(() =>
  onVerifierTab.value ? !canSendVerifier.value : !canSend.value,
)

function sendActive(text) {
  return onVerifierTab.value ? sendVerifier(text) : send(text)
}

const inConversation = computed(() => ['chatting', 'awaiting', 'ended'].includes(status.value))
const fitsViewport = computed(() => inConversation.value || status.value === 'briefing')
</script>

<template>
  <div class="soc-game" :class="{ 'is-fitted': fitsViewport, 'is-wide': inConversation }">
    <!-- the back link is a direct child of the page so it can sit at the top left of the whole
         content area, while the title and everything below it stay in the centred column -->
    <RouterLink to="/" class="soc-back back-link">Back to town</RouterLink>
    <div class="soc-intro">
      <h1 tabindex="-1">LLM Social Engineering Simulator</h1>
      <p class="soc-strap">
        A fictional colleague will pressure you to hand over a synthetic reset code. Hold the line
        and verify the request. Everything here is simulated.
      </p>
    </div>

    <div v-if="status === 'choosing'" class="soc-state soc-start">
      <button type="button" class="soc-button soc-button-choice" @click="showHowTo">
        How to play
      </button>
      <AttemptContextChooser
        :disabled="pending"
        label="Save this call to"
        submit-label="Start the call"
        @start="start"
      />
    </div>

    <p v-else-if="status === 'idle' && pending" class="soc-state" role="status">
      Setting up the simulation&hellip;
    </p>

    <div v-else-if="status === 'error'" class="soc-state soc-error" role="alert">
      <p>{{ error }}</p>
      <button type="button" class="soc-button soc-button-primary" @click="start()">
        Try again
      </button>
    </div>

    <ScenarioBrief
      v-else-if="status === 'briefing' && brief && persona"
      :brief="brief"
      :persona="persona"
      :reset-code="resetCode"
      @start="begin"
    />

    <div v-else-if="inConversation" class="soc-conversation" :class="{ 'is-chat': !result }">
      <DebriefPanel
        v-if="result"
        :result="result"
        :verifier-messages="verifierMessages"
        :verifier-name="verifierName"
        :retrying="retrying"
        :retry-error="saveRetryError"
        @retry-save="retrySave"
        @restart="reset"
      />

      <template v-else>
        <header class="soc-convo-head">
          <p class="soc-convo-persona">{{ personaName }}</p>
          <p v-if="onVerifierTab" class="soc-convo-turns" aria-live="polite">
            Checks {{ verifierTurnsUsed }} of {{ verifierTurnBudget }}
          </p>
          <p v-else class="soc-convo-turns" aria-live="polite">
            Turn {{ turnsUsed }} of {{ turnBudget }}
          </p>
        </header>

        <div class="soc-convo-body">
          <DecisionBar
            :disabled="pending || Boolean(result)"
            :hide-verify="Boolean(verifier)"
            :colleague-name="verifier ? verifierName : ''"
            :colleague-role="verifier ? verifier.role : ''"
            :reset-code="resetCode"
            @decide="complete"
          />

          <div class="soc-convo-main">
            <ConversationTabs
              v-if="verifier"
              :tabs="tabs"
              :active-id="activeChat"
              @select="selectChat"
            />

            <ChatThread
              :messages="threadMessages"
              :pending="threadPending"
              :persona-name="threadName"
            />

            <p v-if="leaked" class="soc-alert soc-alert-bad" role="alert">
              You revealed the reset code. In a real incident this would compromise the account.
              Choose how to end on the left.
            </p>
            <p v-else-if="closed && !onVerifierTab" class="soc-alert" role="status">
              The conversation has reached its limit. Make your final decision on the left.
            </p>

            <MessageComposer
              v-if="showComposer"
              :key="onVerifierTab ? 'verifier' : 'attacker'"
              :disabled="composerDisabled"
              :max-length="MAX_MESSAGE_LENGTH"
              :restore-text="onVerifierTab ? verifierFailedText : ''"
              @send="sendActive"
            />

            <p v-if="onVerifierTab && verifierError" class="soc-alert soc-alert-bad" role="alert">
              {{ verifierError }}
            </p>

            <p v-if="error" class="soc-alert soc-alert-bad" role="alert">{{ error }}</p>
          </div>
        </div>
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
