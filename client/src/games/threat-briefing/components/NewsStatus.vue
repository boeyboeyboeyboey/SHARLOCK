<script setup>
import { computed } from 'vue'
import { newsDate, newsStamp } from '../news.js'
const props = defineProps({
  loading: Boolean,
  error: { type: String, default: '' },
  stale: Boolean,
  partial: Boolean,
  fetchedAt: { type: String, default: '' },
  refreshAvailableAt: { type: Number, default: 0 },
  canRefresh: Boolean,
})
defineEmits(['retry'])
const nextCheck = computed(() =>
  !props.loading && !props.canRefresh && props.refreshAvailableAt
    ? newsStamp(props.refreshAvailableAt)
    : '',
)
</script>
<template>
  <div class="gazette-status" role="status" aria-live="polite" aria-atomic="true">
    <p v-if="loading">The capybara is checking the news desk…</p>
    <p v-else-if="error">
      {{ error }}
      <button type="button" class="gazette-button" :disabled="!canRefresh" @click="$emit('retry')">
        Try again
      </button>
    </p>
    <p v-else-if="stale">
      A cached edition · check for a fresh update. Last successful update:
      {{ newsDate(fetchedAt, true) }} SGT
    </p>
    <p v-else-if="fetchedAt">
      Updated {{ newsStamp(fetchedAt) }} SGT{{ nextCheck ? ` · next ${nextCheck}` : '' }}
    </p>
    <p v-if="partial">Some stories could not be included in this edition.</p>
    <small v-if="nextCheck && (error || stale || !fetchedAt)"
      >Next update check available {{ nextCheck }} SGT</small
    >
  </div>
</template>
