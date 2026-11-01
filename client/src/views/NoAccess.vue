<script setup>
import PixelIcon from '../components/town/PixelIcon.vue'
</script>
<template>
  <section class="coming-soon">
    <span class="coming-soon-icon"><PixelIcon name="map" :size="64" aria-hidden="true" /></span>
    <h1 tabindex="-1">You don't have access to this page.</h1>
    <RouterLink to="/" class="btn btn-primary"
      ><PixelIcon name="arrow" class="icon-back" :size="19" aria-hidden="true" /> Back to
      town</RouterLink
    >
  </section>
</template>
