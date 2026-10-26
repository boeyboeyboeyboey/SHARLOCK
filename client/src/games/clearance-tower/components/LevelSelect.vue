<script setup>
import { computed } from 'vue'

const props = defineProps({
  levels: { type: Array, required: true },
  readyToComplete: { type: Boolean, default: false },
  pending: { type: Boolean, default: false },
})
const emit = defineEmits(['select', 'finish'])

const submittedCount = computed(() => props.levels.filter((level) => level.submitted).length)

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
        :disabled="!readyToComplete || pending"
        @click="emit('finish')"
      >
        Finish climb
      </button>
    </div>
  </section>
</template>
