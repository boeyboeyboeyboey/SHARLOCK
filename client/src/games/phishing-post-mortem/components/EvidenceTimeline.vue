<script setup>
import { clockTime } from '../phishing.js'

defineProps({
  events: { type: Array, required: true },
})
</script>

<template>
  <section class="sharmail-timeline" aria-labelledby="phish-timeline-heading">
    <h3 id="phish-timeline-heading">Security log</h3>
    <ol>
      <li v-for="event in events" :key="event.id">
        <span class="sharmail-timeline-time">{{ clockTime(event.at) }}</span>
        <span class="sharmail-timeline-label">{{ event.label }}</span>
        <span class="sharmail-timeline-detail">{{ event.detail }}</span>
      </li>
    </ol>
  </section>
</template>
