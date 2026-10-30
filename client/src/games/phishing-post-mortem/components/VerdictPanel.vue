<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  selectedEmailId: { type: String, default: '' },
  selectedSubject: { type: String, default: '' },
  evidenceOptions: { type: Array, required: true },
  selectedEvidenceIds: { type: Array, required: true },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update-evidence', 'submit-verdict'])

const open = ref(false)
const toggleButton = ref(null)
const full = computed(() => props.selectedEvidenceIds.length >= 2)
const ready = computed(() => Boolean(props.selectedEmailId) && full.value && !props.disabled)
const status = computed(() => {
  if (!props.selectedEmailId) return 'Accuse a message to begin.'
  if (!full.value) return 'Choose exactly two clues to submit.'
  return 'Ready to submit.'
})

function toggle(id) {
  const next = props.selectedEvidenceIds.includes(id)
    ? props.selectedEvidenceIds.filter((value) => value !== id)
    : [...props.selectedEvidenceIds, id]
  emit('update-evidence', next)
}

function closeEvidence() {
  if (!open.value) return
  open.value = false
  toggleButton.value?.focus()
}
</script>

<template>
  <section
    class="sharmail-verdict"
    aria-labelledby="phish-verdict-heading"
    @keydown.esc="closeEvidence"
  >
    <h3 id="phish-verdict-heading" class="visually-hidden">Your verdict</h3>
    <p class="sharmail-verdict-target">
      <span class="sharmail-verdict-label">Patient Zero</span>
      <strong v-if="selectedEmailId">{{ selectedSubject }}</strong>
      <em v-else>Open a message and choose Accuse this message.</em>
    </p>
    <p class="sharmail-verdict-status" role="status">{{ status }}</p>
    <button
      ref="toggleButton"
      type="button"
      class="sharmail-evidence-toggle"
      aria-controls="phish-evidence"
      :aria-expanded="open"
      @click="open = !open"
    >
      Evidence {{ selectedEvidenceIds.length }}/2
    </button>
    <button
      type="button"
      class="sharmail-submit"
      :disabled="!ready"
      @click="$emit('submit-verdict')"
    >
      Submit final verdict
    </button>
    <fieldset v-show="open" id="phish-evidence" class="sharmail-evidence" :disabled="disabled">
      <legend>Supporting evidence - choose exactly two</legend>
      <div class="sharmail-evidence-grid">
        <label v-for="option in evidenceOptions" :key="option.id" class="sharmail-evidence-option">
          <input
            type="checkbox"
            :checked="selectedEvidenceIds.includes(option.id)"
            :disabled="full && !selectedEvidenceIds.includes(option.id)"
            @change="toggle(option.id)"
          />
          <span>{{ option.label }}</span>
        </label>
      </div>
      <p v-if="full" class="sharmail-evidence-hint">
        Two clues chosen. Clear one to pick a different clue.
      </p>
      <p class="sharmail-verdict-note">
        One verdict per case. The evidence chain is revealed after you submit.
      </p>
    </fieldset>
  </section>
</template>
