<script setup>
import { ref, watch } from 'vue'

defineProps({ data: { type: Object, required: true } })
const emit = defineEmits(['change'])

const index = ref(-1)
watch(index, (value) => emit('change', value >= 0 ? { index: value } : null), { immediate: true })
</script>

<template>
  <div class="pz-scroll" data-testid="puzzle-process">
    <table class="pz-table">
      <thead>
        <tr>
          <th scope="col"><span class="pz-sr">Pick</span></th>
          <th scope="col">Name</th>
          <th scope="col">Path</th>
          <th scope="col">CPU</th>
          <th scope="col">Mem</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in data.processes" :key="i" :class="{ 'is-on': index === i }">
          <td>
            <label class="pz-cell"
              ><input v-model="index" type="radio" name="process" :value="i" /><span
                class="pz-sr"
                >{{ row.name }}</span
              ><span aria-hidden="true">{{ index === i ? '●' : '○' }}</span></label
            >
          </td>
          <td class="pz-mono">{{ row.name }}</td>
          <td class="pz-mono pz-path">{{ row.path }}</td>
          <td class="pz-mono">{{ row.cpu }}%</td>
          <td class="pz-mono">{{ row.mem }} MB</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
