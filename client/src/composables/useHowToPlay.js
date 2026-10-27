import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '../features/auth/store.js'

// opens on mount unless the signed-in user has dismissed this game's guide
export function useHowToPlay(gameId) {
  const auth = useAuthStore()
  const open = ref(false)
  const dismissed = computed(() => auth.user?.howToPlayDismissed?.includes(gameId) ?? false)

  onMounted(() => {
    open.value = !dismissed.value
  })

  function show() {
    open.value = true
  }

  return { open, dismissed, show }
}
