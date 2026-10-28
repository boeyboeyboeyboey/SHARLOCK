<script setup>
import { computed } from 'vue'

const props = defineProps({
  last: { type: Object, required: true },
  reviewing: Boolean,
  final: Boolean,
  disabled: Boolean,
})
const emit = defineEmits(['next', 'finish'])
const outcome = computed(() => {
  if (!props.last.closed) return null
  return props.last.solved
    ? `Solved: +${props.last.points} points`
    : 'Not solved: no points for this case'
})
</script>

<template>
  <div class="sql-result-body">
    <h3>Result: {{ last.title }}</h3>
    <p v-if="last.message">{{ last.message }}</p>
    <p v-if="last.code" class="small">
      Server response <code>{{ last.code }}</code>
    </p>
    <table v-if="last.leaked" class="sql-leak">
      <caption>
        Rows the page now shows from
        {{
          last.leaked.table
        }}
      </caption>
      <thead>
        <tr>
          <th v-for="column in last.leaked.columns" :key="column" scope="col">{{ column }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, rowIndex) in last.leaked.rows" :key="rowIndex">
          <td v-for="(cell, cellIndex) in row" :key="cellIndex">{{ cell }}</td>
        </tr>
      </tbody>
    </table>
    <template v-if="last.closed">
      <p class="sql-outcome">
        <span aria-hidden="true">{{ last.solved ? '✔' : '✖' }}</span> {{ outcome }}
      </p>
      <p v-if="last.explanation">{{ last.explanation }}</p>
    </template>
    <div v-if="reviewing || final" class="sql-form-submit">
      <button
        v-if="final"
        type="button"
        class="btn btn-primary"
        :disabled="disabled"
        @click="emit('finish')"
      >
        Finish and save result
      </button>
      <button v-else type="button" class="btn btn-primary" @click="emit('next')">Next case</button>
    </div>
  </div>
</template>
