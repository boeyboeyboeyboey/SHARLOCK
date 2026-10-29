import { inject, provide, shallowRef } from 'vue'

const TOWN_CONTROLS = Symbol('townControls')
const SIGN_OUT = Symbol('portalSignOut')

// the sound components register themselves so the settings overlay can reach the one on screen
export function createSoundRegistry() {
  const current = shallowRef(null)
  function register(entry) {
    current.value = entry
    return () => {
      if (current.value === entry) current.value = null
    }
  }
  return { current, register }
}

export function provideTownControls(controls) {
  provide(TOWN_CONTROLS, controls)
}

export function useTownControls() {
  return inject(TOWN_CONTROLS, null)
}

export function provideSignOut(signOut) {
  provide(SIGN_OUT, signOut)
}

export function useSignOut() {
  return inject(SIGN_OUT, () => {})
}
