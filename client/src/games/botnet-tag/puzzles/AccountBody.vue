<script setup>
import { ref, watch } from 'vue'
import ChoiceList from './ChoiceList.vue'

defineProps({ data: { type: Object, required: true } })
const emit = defineEmits(['change'])

const index = ref(-1)
watch(index, (value) => emit('change', value >= 0 ? { index: value } : null), { immediate: true })
</script>

<template>
  <div data-testid="puzzle-account">
    <ChoiceList v-model="index" name="account" :items="data.passwords">
      <template #default="{ item }"
        ><span class="pz-mono pz-grow">{{ item }}</span></template
      >
    </ChoiceList>
  </div>
</template>
