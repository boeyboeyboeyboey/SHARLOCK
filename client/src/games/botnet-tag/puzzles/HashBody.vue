<script setup>
import { ref, watch } from 'vue'
import ChoiceList from './ChoiceList.vue'

defineProps({ data: { type: Object, required: true } })
const emit = defineEmits(['change'])

const index = ref(-1)
watch(index, (value) => emit('change', value >= 0 ? { index: value } : null), { immediate: true })

// 8-char groups make long hashes comparable by eye without changing the text
const grouped = (hash) => (hash.includes(' ') ? hash : (hash.match(/.{1,8}/g) ?? [hash]).join(' '))
</script>

<template>
  <div data-testid="puzzle-hash">
    <p class="pz-ref" data-testid="hash-published">
      <span aria-hidden="true">#</span>
      <span class="pz-mono">{{ grouped(data.published) }}</span>
    </p>
    <ChoiceList v-model="index" name="hash" :items="data.candidates">
      <template #default="{ item }">
        <span class="pz-grow"
          ><b>{{ item.file }}</b
          ><br /><span class="pz-mono pz-hash">{{ grouped(item.hash) }}</span></span
        >
      </template>
    </ChoiceList>
  </div>
</template>
