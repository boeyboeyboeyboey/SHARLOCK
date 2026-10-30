<script setup>
import PixelIcon from '../components/town/PixelIcon.vue'
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  showMascot: { type: Boolean, default: false },
})
</script>
<template>
  <section class="coming-soon">
    <img
      v-if="showMascot"
      class="mascot-image auth-mascot"
      src="/images/town/capybara-mint.svg"
      width="224"
      height="168"
      alt="Sharlock, a pixel-art capybara wearing a mint scarf, welcoming you to the hub"
    />
    <span v-else class="coming-soon-icon"
      ><PixelIcon name="map" :size="64" aria-hidden="true"
    /></span>
    <h1 tabindex="-1">{{ title }}</h1>
    <p v-if="description">{{ description }}</p>
    <RouterLink to="/" class="btn btn-primary"
      ><PixelIcon name="arrow" class="icon-back" :size="19" aria-hidden="true" /> Back to
      town</RouterLink
    >
  </section>
</template>
