<script setup>
import { computed, onMounted, ref } from 'vue'
import CliIcon from './CliIcon.vue'
import ConceptTags from './ConceptTags.vue'

const props = defineProps({
  result: { type: Object, required: true },
  saving: { type: Boolean, default: false },
})
const emit = defineEmits(['replay', 'menu', 'retry-save'])

const heading = ref(null)
const OUTCOME_LABELS = {
  correct: 'OK',
  wrong: 'WRONG',
  missed: 'MISSED',
  skipped: 'SKIPPED',
}
const OUTCOME_ICONS = {
  correct: 'check',
  wrong: 'cross',
  missed: 'missed',
  skipped: 'skipped',
}
const modeLabel = computed(() => (props.result.mode === 'practice' ? 'Practice' : 'Timed game'))

const perfect = computed(
  () => props.result.score > 0 && props.result.score === props.result.maxScore,
)

// fixed pseudo-random spread so the confetti looks scattered without randomness in render
function confettiStyle(step) {
  return {
    left: `${(step * 37) % 100}%`,
    animationDelay: `${(step % 6) * 90}ms`,
    '--spin': `${(step * 53) % 360}deg`,
  }
}

const contained = computed(() => props.result.result.correct ?? 0)

// per-topic tally from the incident list, drawn as a terminal block bar
const topicRows = computed(() =>
  props.result.topicOutcomes.map((topic) => {
    const items = props.result.debrief.filter((item) => item.topic === topic.topic)
    const correct = items.filter((item) => item.outcome === 'correct').length
    return {
      ...topic,
      correct,
      total: items.length,
      bar: '\u2588'.repeat(correct) + '\u2591'.repeat(items.length - correct),
    }
  }),
)
const total = computed(() => props.result.debrief.length)

onMounted(() => heading.value?.focus())
</script>

<template>
  <section class="cli-panel cli-debrief" aria-labelledby="cli-debrief-heading">
    <div v-if="perfect" class="cli-confetti" aria-hidden="true">
      <span
        v-for="step in 24"
        :key="step"
        :class="['cli-confetti-piece', `cli-confetti-${step % 4}`]"
        :style="confettiStyle(step)"
      ></span>
    </div>

    <header class="cli-debrief-head">
      <h2 id="cli-debrief-heading" ref="heading" class="cli-heading" tabindex="-1">
        Shift debrief
      </h2>
      <p v-if="perfect" class="cli-perfect">Perfect game: every challenge contained.</p>
    </header>

    <div class="cli-debrief-summary row row-cols-2 row-cols-md-4 g-2">
      <div class="col">
        <div class="cli-stat cli-stat-score">
          <CliIcon name="score" :size="28" class="cli-stat-icon" />
          <div class="cli-stat-body">
            <span class="cli-stat-label">Score</span>
            <span class="cli-score"
              >{{ result.score.toLocaleString() }} / {{ result.maxScore.toLocaleString()
              }}<span class="visually-hidden"> points</span></span
            >
          </div>
        </div>
      </div>
      <div class="col">
        <div class="cli-stat">
          <CliIcon name="handled" :size="28" class="cli-stat-icon" />
          <div class="cli-stat-body">
            <span class="cli-stat-label">Contained</span>
            <span class="cli-stat-value">{{ contained }} / {{ total }}</span>
          </div>
        </div>
      </div>
      <div class="col">
        <div class="cli-stat cli-stat-streak">
          <CliIcon name="streak" :size="28" class="cli-stat-icon" />
          <div class="cli-stat-body">
            <span class="cli-stat-label">Best streak</span>
            <span class="cli-stat-value">{{ result.result.bestStreak }}</span>
          </div>
        </div>
      </div>
      <div class="col">
        <div class="cli-stat cli-stat-window">
          <CliIcon name="window" :size="28" class="cli-stat-icon" />
          <div class="cli-stat-body">
            <span class="cli-stat-label">Mode</span>
            <span class="cli-stat-mode">{{ modeLabel }}</span>
          </div>
        </div>
      </div>
    </div>
    <p class="cli-note mt-2">{{ result.feedback.summary }}</p>
    <p v-if="result.saved" class="cli-note" role="status">Result saved to your account.</p>
    <div v-else class="cli-alert" role="alert">
      <p>{{ result.saveError?.message ?? 'This result has not been saved.' }}</p>
      <button type="button" class="btn" :disabled="saving" @click="emit('retry-save')">
        Try saving again
      </button>
    </div>

    <div class="d-flex flex-wrap align-items-center gap-3">
      <button type="button" class="btn cli-btn-primary" @click="emit('replay')">
        <CliIcon name="replay" :size="18" />Play again
      </button>
      <button type="button" class="btn" @click="emit('menu')">
        <CliIcon name="menu" :size="18" />Main menu
      </button>
    </div>

    <div class="cli-debrief-scroll">
      <section class="cli-debrief-section" aria-labelledby="cli-topics-heading">
        <h3 id="cli-topics-heading" class="cli-subheading">Topics</h3>
        <table class="cli-topic-table">
          <thead>
            <tr>
              <th scope="col">Topic</th>
              <th scope="col">Correct</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="topic in topicRows" :key="topic.topic">
              <th scope="row">{{ topic.label }}</th>
              <td>
                <span class="cli-topic-bar" aria-hidden="true">{{ topic.bar }}</span>
                {{ topic.correct }}/{{ topic.total }}
              </td>
              <td>
                <span :class="topic.achieved ? 'cli-strong' : 'cli-review-tag'">{{
                  topic.achieved ? 'Strong' : 'Review'
                }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="cli-debrief-section" aria-labelledby="cli-incidents-heading">
        <h3 id="cli-incidents-heading" class="cli-subheading">Incident by incident</h3>
        <p class="cli-note">Tap an incident to see why. Mistakes open first.</p>
        <ol class="cli-debrief-list">
          <li
            v-for="(item, index) in result.debrief"
            :key="item.incidentId"
            class="cli-debrief-item"
            :style="{ '--i': index }"
          >
            <details
              :class="['cli-incident', `cli-incident-${item.outcome}`]"
              :open="['wrong', 'missed'].includes(item.outcome)"
            >
              <summary class="cli-debrief-title">
                <span class="cli-incident-number">{{ index + 1 }}</span>
                <span :class="['cli-outcome', `cli-outcome-${item.outcome}`]">
                  <CliIcon :name="OUTCOME_ICONS[item.outcome]" :size="14" />{{
                    OUTCOME_LABELS[item.outcome]
                  }}
                </span>
                <span class="cli-incident-title">{{ item.title }}</span>
                <span v-if="item.hintUsed" class="cli-hint-tag">hint used</span>
                <span v-if="item.pointsAwarded" class="cli-incident-points"
                  >+{{ item.pointsAwarded }}</span
                >
              </summary>
              <div class="cli-incident-body">
                <dl class="cli-incident-commands">
                  <div>
                    <dt>Your command</dt>
                    <dd>
                      <code>{{ item.yourCommand ?? 'none' }}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Correct response</dt>
                    <dd>
                      <code>{{ item.expectedCommand }}</code>
                    </dd>
                  </div>
                </dl>
                <p class="cli-incident-why">{{ item.explanation }}</p>
                <ConceptTags :concepts="item.concepts" />
              </div>
            </details>
          </li>
        </ol>
      </section>
    </div>
  </section>
</template>
