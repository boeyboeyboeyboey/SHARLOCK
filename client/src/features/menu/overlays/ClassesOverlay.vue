<script setup>
import OverlayPanel from '../OverlayPanel.vue'
import MembershipsPage from '../../cohorts/pages/MembershipsPage.vue'

defineEmits(['request-close'])
</script>

<template>
  <OverlayPanel title="Your classes" @request-close="$emit('request-close')">
    <MembershipsPage />
  </OverlayPanel>
</template>
