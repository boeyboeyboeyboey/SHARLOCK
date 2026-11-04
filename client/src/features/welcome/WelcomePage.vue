<script setup>
import { RouterLink } from 'vue-router'
import './welcome.css'

const lamps = [1, 2, 3, 4]
</script>

<template>
  <div class="welcome-page">
    <div class="welcome-scene" aria-hidden="true">
      <div class="welcome-sun"></div>
      <div class="welcome-skyline welcome-far">
        <img src="/hub/plates/thames-far-1.webp" alt="" decoding="async" />
      </div>
      <div class="welcome-skyline welcome-mid">
        <img src="/hub/plates/thames-mid-1.webp" alt="" decoding="async" />
      </div>
      <div class="welcome-fog welcome-fog-high"></div>
      <div class="welcome-water"></div>
      <span
        v-for="lamp in lamps"
        :key="lamp"
        class="welcome-lamp"
        :class="`welcome-lamp-${lamp}`"
      ></span>
      <div class="welcome-fog welcome-fog-low"></div>
      <div class="welcome-vignette"></div>
    </div>

    <section class="welcome-card" aria-labelledby="welcome-title">
      <img class="welcome-logo" src="/images/sharlock-placeholder.svg" alt="" />
      <h1 id="welcome-title">Sharlock Hub</h1>
      <p class="welcome-lore">London, 1880. Where messages travel, thieves follow.</p>
      <div class="welcome-actions">
        <RouterLink to="/login" class="btn btn-primary">Sign in</RouterLink>
        <RouterLink to="/register" class="btn btn-secondary">Create account</RouterLink>
      </div>
      <RouterLink to="/about" class="welcome-about text-link">About</RouterLink>
    </section>
  </div>
</template>
