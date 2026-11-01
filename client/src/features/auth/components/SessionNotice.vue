<script setup>
import PixelIcon from '../../../components/town/PixelIcon.vue'
import '../session-notice.css'

defineProps({
  message: { type: String, default: '' },
  pending: { type: Boolean, default: false },
})
defineEmits(['retry'])
</script>

<template>
  <aside class="auth-session-notice" aria-live="polite">
    <PixelIcon name="question" :size="24" aria-hidden="true" />
    <div class="auth-session-notice__content">
      <p>{{ message }}</p>
      <slot />
      <button class="btn btn-secondary" type="button" :disabled="pending" @click="$emit('retry')">
        {{ pending ? 'Checking account…' : 'Try again' }}
      </button>
    </div>
  </aside>
</template>
