<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({ data: { type: Object, required: true } })
const emit = defineEmits(['change'])

const picks = ref(props.data.services.map(() => ''))
const active = ref(0)
const labelOf = (id) => props.data.patches.find((patch) => patch.id === id)?.label ?? ''
const owner = (id) => picks.value.indexOf(id)
const done = computed(() => picks.value.every(Boolean))

// one patch per service: taking a patch frees it from any other service
function assign(id) {
  const taken = owner(id)
  if (taken !== -1) picks.value[taken] = ''
  picks.value[active.value] = id
  const next = picks.value.findIndex((pick) => !pick)
  if (next !== -1) active.value = next
}

watch(picks, (list) => emit('change', list.every(Boolean) ? { choices: [...list] } : null), {
  deep: true,
  immediate: true,
})
</script>

<template>
  <div class="pz-cols" data-testid="puzzle-patch">
    <ul class="pz-list">
      <li v-for="(service, i) in data.services" :key="service.name">
        <button
          type="button"
          class="pz-pick"
          :class="{ 'is-on': active === i }"
          :aria-pressed="active === i"
          :data-testid="`patch-service-${i}`"
          @click="active = i"
        >
          <b>{{ service.name }}</b>
          <span class="pz-mono">v{{ service.version }}</span>
          <span v-if="picks[i]" class="pz-mono pz-ok"
            ><span aria-hidden="true">✓</span> {{ labelOf(picks[i]) }}</span
          >
        </button>
      </li>
    </ul>
    <ul class="pz-list">
      <li v-for="patch in data.patches" :key="patch.id">
        <button
          type="button"
          class="pz-pick"
          :class="{ 'is-on': owner(patch.id) !== -1 }"
          :data-testid="`patch-${patch.id}`"
          @click="assign(patch.id)"
        >
          <span>{{ patch.label }}</span>
          <span v-if="owner(patch.id) !== -1" class="pz-mono pz-ok" aria-hidden="true"
            >✓ {{ owner(patch.id) + 1 }}</span
          >
          <span v-if="owner(patch.id) !== -1" class="pz-sr">{{
            `for ${data.services[owner(patch.id)].name}`
          }}</span>
        </button>
      </li>
    </ul>
    <span v-if="done" class="pz-sr" role="status">All paired</span>
  </div>
</template>
