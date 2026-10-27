<script setup>
import { computed } from 'vue'
import { buildingArt } from './townArt.js'
const props = defineProps({ type: { type: String, required: true } })
const art = computed(() => buildingArt(props.type))
</script>
<template>
  <!-- static trusted svg built in townArt.js, never user text -->
  <!-- eslint-disable vue/no-v-html -->
  <svg
    class="building-sprite"
    aria-hidden="true"
    focusable="false"
    shape-rendering="crispEdges"
    :width="art.width"
    :height="art.height"
    :viewBox="art.viewBox"
    v-html="art.body"
  />
</template>
