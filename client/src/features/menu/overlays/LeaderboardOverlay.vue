<script setup>
import OverlayPanel from '../OverlayPanel.vue'
import LeaderboardPage from '../../leaderboard/LeaderboardPage.vue'

defineEmits(['request-close'])
</script>

<template>
  <OverlayPanel title="Leaderboards" @request-close="$emit('request-close')">
    <LeaderboardPage />
  </OverlayPanel>
</template>
