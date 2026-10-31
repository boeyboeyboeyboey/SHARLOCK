<script setup>
import { ref } from 'vue'
import AttemptContextChooser from '../../../features/attempts/components/AttemptContextChooser.vue'
import { COMMAND_TEMPLATES } from '../cliDefender.js'
import CliIcon from './CliIcon.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import DemoTerminal from './DemoTerminal.vue'

defineProps({
  pending: { type: Boolean, default: false },
  error: { type: String, default: '' },
})
const emit = defineEmits(['start', 'how-to-play'])

const confirmingTimed = ref(false)
const context = ref(null)

function startTimed() {
  confirmingTimed.value = false
  emit('start', 'timed', context.value)
}
</script>

<template>
  <section class="cli-panel cli-briefing" aria-labelledby="cli-briefing-heading">
    <h2 id="cli-briefing-heading" class="cli-heading">Shift briefing</h2>
    <button type="button" class="btn mb-3" @click="emit('how-to-play')">How to play</button>
    <div v-if="!context" class="cli-context">
      <AttemptContextChooser
        :disabled="pending"
        label="Save this run to"
        submit-label="Start the run"
        @start="context = $event"
      />
    </div>
    <template v-else>
      <p class="cli-role">
        <CliIcon name="handled" :size="18" />You're the Security Analyst on shift at a fictional
        company's security operations centre.
      </p>
      <p class="cli-lead">Read each alert, then type the one command that contains it.</p>
      <DemoTerminal />
      <div class="row g-3">
        <div class="col-12 col-lg-6">
          <h3 class="cli-subheading">Commands</h3>
          <ul class="cli-brief-list">
            <li v-for="item in COMMAND_TEMPLATES" :key="item.id">
              <CliIcon :name="item.id" :size="18" />
              <span class="cli-brief-text"
                ><code>{{ item.label }}</code> {{ item.hint }}</span
              >
            </li>
          </ul>
        </div>
        <div class="col-12 col-lg-6">
          <h3 class="cli-subheading">Scoring</h3>
          <ul class="cli-brief-list">
            <li>
              <CliIcon name="streak" :size="18" /><span class="cli-brief-text"
                >100 &rarr; 200 &rarr; 300 per answer in a row</span
              >
            </li>
            <li>
              <CliIcon name="cross" :size="18" /><span class="cli-brief-text"
                >Wrong or missed resets the streak</span
              >
            </li>
            <li>
              <CliIcon name="check" :size="18" /><span class="cli-brief-text"
                >Mistyped commands don't count. Fix it and try again.</span
              >
            </li>
            <li>
              <CliIcon name="score" :size="18" /><span class="cli-brief-text"
                >Maximum score: 2,100</span
              >
            </li>
          </ul>
        </div>
      </div>
      <p class="cli-note cli-brief-modes">
        A game gives you 10&ndash;15 seconds per challenge. Practice has no timer and offers hints.
      </p>
      <p v-if="error" class="cli-alert" role="alert">{{ error }}</p>
      <div class="d-flex flex-wrap align-items-center gap-3 mt-3">
        <button
          type="button"
          class="btn cli-btn-primary"
          :disabled="pending"
          @click="confirmingTimed = true"
        >
          <CliIcon name="play" :size="18" />Start game
        </button>
        <button
          type="button"
          class="btn"
          :disabled="pending"
          @click="emit('start', 'practice', context)"
        >
          <CliIcon name="hint" :size="18" />
          Practice (no timer)
        </button>
      </div>
      <p v-if="pending" class="cli-note mt-3" role="status">Connecting to the terminal&hellip;</p>
    </template>
    <ConfirmDialog
      id="cli-timed-confirm"
      :open="confirmingTimed"
      title="Ready to play?"
      confirm-label="Start"
      @confirm="startTimed"
      @cancel="confirmingTimed = false"
    >
      <p>8 challenges, 10&ndash;15 seconds each.</p>
      <p class="cli-note">Your score is saved to your account when the game ends.</p>
    </ConfirmDialog>
  </section>
</template>
