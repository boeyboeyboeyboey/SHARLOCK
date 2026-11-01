import { inject, onBeforeUnmount } from 'vue'

export const INTERIOR_LEAVE = Symbol('interior-leave')

// for a game under the interior layout: onopen runs when the shared leave dialog opens, onclose when it closes without leaving
export function useInteriorLeave(hooks) {
  const register = inject(INTERIOR_LEAVE, null)
  const unregister = register?.(hooks)
  onBeforeUnmount(() => unregister?.())
}
