<script setup>
defineProps({ question: { type: String, default: '' }, disabled: Boolean })
const emit = defineEmits(['answer'])
</script>

<template>
  <fieldset class="sql-blind-answer" :disabled="disabled">
    <legend>You have your proof. Answer the question.</legend>
    <p>{{ question }}</p>
    <div class="sql-form-submit">
      <button type="button" class="btn btn-primary" @click="emit('answer', 'yes')">Yes</button>
      <button type="button" class="btn btn-primary" @click="emit('answer', 'no')">No</button>
    </div>
  </fieldset>
</template>
