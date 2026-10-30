<script setup>
import { ref, watch } from 'vue'
import ChoiceList from './ChoiceList.vue'

defineProps({ data: { type: Object, required: true } })
const emit = defineEmits(['change'])

const index = ref(-1)
watch(index, (value) => emit('change', value >= 0 ? { index: value } : null), { immediate: true })
</script>

<template>
  <div data-testid="puzzle-spoof">
    <p v-if="data.org" class="pz-meta">
      <span class="tag-chip">{{ data.org }}</span>
    </p>
    <ChoiceList v-model="index" name="spoof" :items="data.senders">
      <template #default="{ item }"
        ><span class="pz-mono pz-grow">{{ item }}</span></template
      >
    </ChoiceList>
  </div>
</template>
