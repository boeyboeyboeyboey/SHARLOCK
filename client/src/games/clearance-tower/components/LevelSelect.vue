<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'

const props = defineProps({
  levels: { type: Array, required: true },
  readyToComplete: { type: Boolean, default: false },
  pending: { type: Boolean, default: false },
})
const emit = defineEmits(['select', 'finish'])

const submittedCount = computed(() => props.levels.filter((level) => level.submitted).length)
const unplayedCount = computed(() => props.levels.length - submittedCount.value)
const confirmingFinish = ref(false)
const finishArmed = ref(false)
// long enough that the second click of a double-click cannot be the confirmation
const FINISH_ARM_MS = 800
let armTimer = null

// finishing closes the climb for good, so an unfinished climb needs a separate second press
function pressFinish() {
  if (props.pending) return
  if (unplayedCount.value > 0 && !confirmingFinish.value) {
    confirmingFinish.value = true
    finishArmed.value = false
    armTimer = setTimeout(() => (finishArmed.value = true), FINISH_ARM_MS)
    return
  }
  if (confirmingFinish.value && !finishArmed.value) return
  cancelFinish()
  emit('finish')
}

function cancelFinish() {
  clearTimeout(armTimer)
  confirmingFinish.value = false
  finishArmed.value = false
}

onBeforeUnmount(() => clearTimeout(armTimer))

const acts = computed(() => {
  const groups = []
  props.levels.forEach((level, index) => {
    let act = groups.find((group) => group.number === level.act)
    if (!act) {
      act = { number: level.act, title: level.actTitle, levels: [] }
      groups.push(act)
    }
    act.levels.push({ ...level, number: index + 1 })
  })
  return groups
})
</script>

<template>
  <section class="clear-card" aria-labelledby="clear-levels-title">
    <h2 id="clear-levels-title" tabindex="-1" data-phase-heading>Choose a case</h2>
    <p>
      Six cases across three access-control models. Play them in any order; nothing is timed. Each
      case runs once: read the dossier, set the policy, predict a few decisions, then run the day. A
      climb scores up to 600 points, and cases you skip score 0.
    </p>
    <div v-for="act in acts" :key="act.number" class="clear-act">
      <h3>Act {{ act.number }} · {{ act.title }}</h3>
      <ul class="clear-level-list">
        <li v-for="level in act.levels" :key="level.id">
          <button
            type="button"
            class="clear-button clear-level-button"
            :disabled="pending"
            @click="emit('select', level.id)"
          >
            <span class="clear-level-number">Case {{ level.number }}</span>
            <span class="clear-level-title">{{ level.title }}</span>
            <span v-if="level.submitted" class="clear-level-best">
              Scored <span class="clear-number">{{ level.result.score }}</span> / 100 · review the
              day
            </span>
          </button>
        </li>
      </ul>
    </div>
    <div class="clear-actions">
      <p class="clear-hint">{{ submittedCount }} of {{ levels.length }} cases run.</p>
      <button
        type="button"
        class="clear-button is-primary"
        :disabled="!readyToComplete"
        :aria-disabled="pending || (confirmingFinish && !finishArmed)"
        @click="pressFinish"
      >
        {{
          confirmingFinish
            ? `Finish with ${submittedCount} of ${levels.length} cases? Press again to save`
            : 'Finish climb'
        }}
      </button>
      <template v-if="confirmingFinish">
        <p class="clear-warning" role="status">
          The climb closes for good and the {{ unplayedCount }} cases you have not run score 0.
        </p>
        <button type="button" class="clear-button" @click="cancelFinish">Keep climbing</button>
      </template>
    </div>
  </section>
</template>
