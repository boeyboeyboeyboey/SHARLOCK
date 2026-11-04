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
    <p v-if="data.org" class="pz-org" data-testid="spoof-org">
      <span class="pz-org-label">Mail claiming to be from</span>
      <strong class="pz-org-name">{{ data.org }}</strong>
    </p>
    <ChoiceList v-model="index" name="spoof" :items="data.senders">
      <template #default="{ item }"
        ><span class="pz-mono pz-grow">{{ item }}</span></template
      >
    </ChoiceList>
  </div>
</template>
