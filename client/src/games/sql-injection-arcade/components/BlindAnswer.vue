<script setup>
import { nextTick, ref } from 'vue'

defineProps({ question: { type: String, default: '' }, disabled: Boolean })
const emit = defineEmits(['answer'])

const LABELS = { yes: 'Yes', no: 'No' }
// a wrong answer closes the case, so one tap only chooses and a second one sends
const chosen = ref(null)
const confirmButton = ref(null)
const firstChoice = ref(null)

async function choose(value) {
  chosen.value = value
  await nextTick()
  confirmButton.value?.focus()
}

async function change() {
  chosen.value = null
  await nextTick()
  firstChoice.value?.focus()
}

function confirm() {
  emit('answer', chosen.value)
  chosen.value = null
}
</script>

<template>
  <fieldset class="sql-blind-answer" :disabled="disabled">
    <legend>You have your proof. Answer the question.</legend>
    <p>{{ question }}</p>
    <div v-if="chosen" class="sql-form-submit">
      <p class="mb-0" role="status">You are answering {{ LABELS[chosen] }}.</p>
      <button ref="confirmButton" type="button" class="btn btn-primary" @click="confirm">
        Confirm answer
      </button>
      <button type="button" class="btn btn-outline-primary" @click="change">Change answer</button>
    </div>
    <div v-else class="sql-form-submit">
      <button ref="firstChoice" type="button" class="btn btn-primary" @click="choose('yes')">
        Yes
      </button>
      <button type="button" class="btn btn-primary" @click="choose('no')">No</button>
    </div>
  </fieldset>
</template>
