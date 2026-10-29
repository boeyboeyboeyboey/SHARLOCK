<script setup>
import OverlayPanel from '../OverlayPanel.vue'
import AboutStory from '../../about/AboutStory.vue'

defineEmits(['request-close'])
</script>

<template>
  <OverlayPanel title="About Sharlock" @request-close="$emit('request-close')">
    <AboutStory />
  </OverlayPanel>
</template>
