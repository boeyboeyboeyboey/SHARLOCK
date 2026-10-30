<script setup>
import { computed } from 'vue'
import { useAuthStore } from '../../features/auth/store.js'

const auth = useAuthStore()
const message = computed(() =>
  typeof auth.requestError === 'string' ? auth.requestError : auth.requestError?.message || '',
)

async function retry() {
  try {
    await auth.restoreSession({ force: true })
  } catch {
    // keep the store's connection feedback available for another retry
  }
}
</script>

<template>
  <div v-if="message" class="preview-notice session-notice" role="alert">
    <p class="mb-2">{{ message }}</p>
    <button
      class="btn btn-secondary"
      type="button"
      :disabled="auth.status === 'loading'"
      @click="retry"
    >
      {{ auth.status === 'loading' ? 'Checking account…' : 'Try again' }}
    </button>
  </div>
</template>
