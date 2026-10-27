import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useHowToPlay } from '../useHowToPlay.js'
import { useAuthStore } from '../../features/auth/store.js'

function mountWith(dismissed) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = { howToPlayDismissed: dismissed }
  auth.status = 'authenticated'
  let api
  const Probe = defineComponent({
    setup() {
      api = useHowToPlay('clearance-tower')
      return () => h('div')
    },
  })
  mount(Probe, { global: { plugins: [pinia] } })
  return api
}

describe('useHowToPlay', () => {
  it('opens on mount when the guide has not been dismissed', () => {
    const api = mountWith([])
    expect(api.open.value).toBe(true)
    expect(api.dismissed.value).toBe(false)
  })

  it('stays closed when dismissed and show reopens it', () => {
    const api = mountWith(['clearance-tower'])
    expect(api.open.value).toBe(false)
    expect(api.dismissed.value).toBe(true)
    api.show()
    expect(api.open.value).toBe(true)
  })
})
