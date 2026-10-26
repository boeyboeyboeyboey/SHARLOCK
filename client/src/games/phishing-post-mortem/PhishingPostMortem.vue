<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AttemptContextChooser from '../../features/attempts/components/AttemptContextChooser.vue'
import SavedAttemptResult from '../../features/attempts/components/SavedAttemptResult.vue'
import CaseDebrief from './components/CaseDebrief.vue'
import EmailInspector from './components/EmailInspector.vue'
import EvidenceTimeline from './components/EvidenceTimeline.vue'
import InboxList from './components/InboxList.vue'
import SharmailShell from './components/SharmailShell.vue'
import VerdictPanel from './components/VerdictPanel.vue'
import { usePhishingCase } from './composables/usePhishingCase.js'
import './phish.css'

const route = useRoute()
const router = useRouter()
const {
  snapshot,
  caseFile,
  emails,
  busy,
  error,
  retryable,
  completed,
  unsaved,
  result,
  selectedEmailId,
  selectedEmail,
  accusedEmailId,
  accusedEmail,
  selectedEvidenceIds,
  pane,
  reviewing,
  start,
  load,
  submit,
  save,
  retry,
  resetGame,
  selectEmail,
  accuse,
  inspectLink,
  setEvidence,
  showInbox,
  backToDebrief,
} = usePhishingCase()

const readingPane = ref(null)
const unread = computed(() => emails.value.filter((email) => !email.read).length)

const initializing = ref(true)

onMounted(async () => {
  if (typeof route.query.attempt === 'string') await load(route.query.attempt)
  initializing.value = false
})

async function begin(context) {
  if (await start(context)) await router.replace({ query: { attempt: snapshot.value.attemptId } })
}

// replay returns to the chooser, and the server picks the next case
async function replay() {
  await router.replace({ query: {} })
  resetGame()
}

// the reading pane scrolls inside the page, so a new message or the debrief starts at the top
watch([selectedEmailId, result, reviewing], async () => {
  await nextTick()
  readingPane.value?.scrollTo({ top: 0 })
})

// the narrow layout swaps panes, so focus has to follow the reader in both directions
async function openMessage(id) {
  selectEmail(id)
  await nextTick()
  readingPane.value?.focus({ preventScroll: true })
}

const isPatientZero = computed(
  () => reviewing.value && result.value?.debrief?.patientZero?.id === selectedEmailId.value,
)
const wasAccused = computed(
  () => reviewing.value && result.value?.result?.selectedEmailId === selectedEmailId.value,
)

async function returnToDebrief() {
  backToDebrief()
  await nextTick()
  document.getElementById('phish-debrief-heading')?.focus({ preventScroll: true })
}

async function backToInbox() {
  const previous = selectedEmailId.value
  showInbox()
  await nextTick()
  document
    .querySelector(`.sharmail-row[data-email-id="${previous}"]`)
    ?.focus({ preventScroll: true })
}
</script>

<template>
  <div class="phish-game is-fitted">
    <div class="phish-intro">
      <RouterLink to="/" class="phish-back back-link">Back to town</RouterLink>
      <h1 tabindex="-1">The Phishing Post-Mortem</h1>
      <p class="phish-strap">
        Several of these messages are hostile. Only one of them caused the compromise. Find it, and
        prove it with two pieces of evidence.
      </p>
    </div>

    <p v-if="busy && !caseFile" class="phish-state" role="status">Opening the case file...</p>

    <div v-if="error" class="phish-state phish-error" role="alert">
      <p>{{ error }}</p>
      <button
        v-if="retryable"
        type="button"
        class="sharmail-submit"
        :disabled="busy"
        @click="retry"
      >
        {{ unsaved ? 'Retry save' : 'Retry verdict' }}
      </button>
      <button
        v-else-if="snapshot"
        type="button"
        class="sharmail-inspect"
        :disabled="busy"
        @click="load(snapshot.attemptId)"
      >
        Reload case
      </button>
    </div>

    <section v-if="!snapshot && !initializing" class="phish-state" aria-labelledby="phish-start">
      <h2 id="phish-start">Open a case</h2>
      <p>
        The server picks the case. Your verdict is scored there and saved as a result of up to 100
        points.
      </p>
      <AttemptContextChooser :disabled="busy" @start="begin" />
    </section>

    <component
      :is="completed ? SavedAttemptResult : 'div'"
      v-else-if="caseFile"
      v-bind="completed ? { attempt: snapshot, onReplay: replay } : {}"
    >
      <SharmailShell :mailbox="caseFile.organisation" :case-title="caseFile.title" :unread="unread">
        <section
          class="sharmail-pane sharmail-pane-list"
          :class="{ 'is-mobile-hidden': pane === 'message' }"
          aria-label="Inbox"
        >
          <header class="sharmail-pane-head">
            <h2>Inbox</h2>
            <p>{{ emails.length }} messages &middot; {{ unread }} unread</p>
          </header>
          <InboxList
            :emails="emails"
            :selected-email-id="selectedEmailId"
            @select-email="openMessage"
          />
        </section>

        <section
          ref="readingPane"
          class="sharmail-pane sharmail-pane-reading"
          :class="{ 'is-mobile-hidden': pane === 'inbox' }"
          tabindex="0"
          aria-label="Reading pane"
        >
          <button type="button" class="sharmail-back" @click="backToInbox">Back to inbox</button>

          <CaseDebrief v-if="result && !reviewing" :result="result" />

          <template v-else>
            <div v-if="reviewing" class="sharmail-review-bar">
              <button type="button" class="sharmail-inspect" @click="returnToDebrief">
                Back to debrief
              </button>
              <p class="sharmail-review-note">Case closed. This message is read-only.</p>
              <p v-if="isPatientZero || wasAccused" class="sharmail-review-tags" role="status">
                <span v-if="isPatientZero" class="sharmail-tag">This was Patient Zero</span>
                <span v-if="wasAccused" class="sharmail-tag is-chosen"
                  >You accused this message</span
                >
              </p>
            </div>

            <div v-if="!selectedEmail" class="sharmail-briefing">
              <h2>{{ caseFile.title }}</h2>
              <p>{{ caseFile.briefing }}</p>
              <p class="sharmail-briefing-hint">
                Open a message to inspect its sender, reply-to address and where its links really
                point. Times are shown in {{ caseFile.timezoneLabel }}.
              </p>
            </div>

            <template v-else>
              <EmailInspector :email="selectedEmail" @inspect-link="inspectLink" />
              <div v-if="!reviewing" class="sharmail-accuse-row">
                <button
                  type="button"
                  class="sharmail-accuse"
                  :class="{ 'is-accused': accusedEmailId === selectedEmail.id }"
                  :aria-pressed="accusedEmailId === selectedEmail.id"
                  @click="accuse(selectedEmail.id)"
                >
                  {{
                    accusedEmailId === selectedEmail.id
                      ? 'Accused as Patient Zero'
                      : 'Accuse this message'
                  }}
                </button>
              </div>
            </template>

            <EvidenceTimeline :events="caseFile.timeline" />
          </template>
        </section>

        <template #footer>
          <VerdictPanel
            v-if="!result"
            :selected-email-id="accusedEmailId"
            :selected-subject="accusedEmail?.subject ?? ''"
            :evidence-options="caseFile.evidenceOptions"
            :selected-evidence-ids="selectedEvidenceIds"
            :disabled="busy"
            @update-evidence="setEvidence"
            @submit-verdict="submit"
          />
        </template>
      </SharmailShell>

      <div v-if="unsaved && !error && !busy" class="phish-state">
        <button type="button" class="sharmail-submit" @click="save">Save result</button>
      </div>
    </component>
  </div>
</template>
