<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({ data: { type: Object, required: true } })
const emit = defineEmits(['change'])

const verdicts = ref(props.data.services.map(() => ''))
const set = computed(() => verdicts.value.filter(Boolean).length)

watch(verdicts, (list) => emit('change', list.every(Boolean) ? { choices: [...list] } : null), {
  deep: true,
  immediate: true,
})
</script>

<template>
  <div data-testid="puzzle-firewall">
    <div class="pz-meta">
      <span class="tag-chip">{{ data.role }}</span>
      <span class="tag-pips" :aria-label="`${set} of ${data.services.length} set`" role="img"
        ><i v-for="(_, n) in data.services" :key="n" :class="{ 'is-on': n < set }"
      /></span>
    </div>
    <ul class="pz-list">
      <li v-for="(service, i) in data.services" :key="service.port" class="pz-row">
        <span class="pz-mono">{{ service.port }}</span>
        <span class="pz-grow">{{ service.name }}</span>
        <span class="pz-seg" role="radiogroup" :aria-label="`${service.port} ${service.name}`">
          <label :class="{ 'is-on': verdicts[i] === 'allow' }">
            <input v-model="verdicts[i]" type="radio" :name="`fw-${i}`" value="allow" />
            <span aria-hidden="true">✓</span> Allow
          </label>
          <label :class="{ 'is-on': verdicts[i] === 'block' }">
            <input v-model="verdicts[i]" type="radio" :name="`fw-${i}`" value="block" />
            <span aria-hidden="true">✕</span> Block
          </label>
        </span>
      </li>
    </ul>
  </div>
</template>
