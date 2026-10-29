<script setup>
import { reactive } from 'vue'

const props = defineProps({
  fields: { type: Array, required: true },
  submitLabel: { type: String, default: 'Run the query' },
  disabled: Boolean,
  maxlength: { type: Number, default: 120 },
})
const emit = defineEmits(['submit'])
const values = reactive(Object.fromEntries(props.fields.map((field) => [field.id, ''])))

function submit() {
  emit(
    'submit',
    props.fields.map((field) => values[field.id]),
  )
}
</script>

<template>
  <form class="sql-login" @submit.prevent="submit">
    <div class="sql-form-fields">
      <p>Fictional values only. Never enter your Sharlock password.</p>
      <div class="sql-input-grid">
        <div v-for="field in fields" :key="field.id" class="sql-input-field">
          <label :for="`sql-field-${field.id}`">{{ field.label }}</label>
          <input
            :id="`sql-field-${field.id}`"
            v-model="values[field.id]"
            class="form-control"
            :maxlength="maxlength"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            :disabled="disabled"
          />
        </div>
      </div>
    </div>
    <div class="sql-form-submit">
      <button class="btn btn-primary" :disabled="disabled">{{ submitLabel }}</button>
    </div>
  </form>
</template>
