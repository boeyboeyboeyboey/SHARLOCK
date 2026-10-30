<script setup>
defineOptions({ name: 'SharlockImmersiveControls' })
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import SiteMenu from './SiteMenu.vue'
import { useTownControls } from './townControls.js'
import './menu.css'

const props = defineProps({
  mode: { type: String, default: '3d' },
  // the 3d option is unavailable when the wharf cannot start at all
  locked: { type: Boolean, default: false },
  menuOpen: { type: Boolean, default: false },
  // true while an overlay, the Times or the intro owns Escape
  suppressed: { type: Boolean, default: false },
  user: { type: Object, default: null },
  logoutPending: { type: Boolean, default: false },
  // a selector whose subtree keeps Escape for itself (a game panel with its own dialogs)
  escapeIgnoreWithin: { type: String, default: '' },
  label3d: { type: String, default: '3D town' },
  label2d: { type: String, default: '2D town' },
})
const emit = defineEmits(['update:menuOpen', 'toggle-mode', 'sign-out', 'navigate'])
const menuButton = ref(null)
const soundSlot = ref(null)
const controls = useTownControls()

function select(target) {
  if (target !== props.mode) emit('toggle-mode')
}
function closeMenu({ restoreFocus = true } = {}) {
  emit('update:menuOpen', false)
  if (restoreFocus) nextTick(() => menuButton.value?.focus())
}
function onNavigate() {
  closeMenu({ restoreFocus: false })
  emit('navigate')
}
// scenes consume Escape first (and mark it handled); the menu only takes what is left
function onKeydown(event) {
  if (event.key !== 'Escape' || props.menuOpen) return
  // capture phase, read now: a game may remove the focused element while handling the key
  const inField = Boolean(event.target?.closest?.('input, textarea, select, [contenteditable]'))
  const inIgnored = Boolean(props.escapeIgnoreWithin && event.target?.closest?.(props.escapeIgnoreWithin))
  setTimeout(() => {
    if (event.defaultPrevented || props.suppressed || props.menuOpen) return
    if (document.querySelector('dialog[open]')) return
    if (inField || inIgnored) return
    emit('update:menuOpen', true)
  }, 0)
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown, true)
  if (controls?.soundSlot) controls.soundSlot.value = soundSlot.value
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true)
  if (controls?.soundSlot) controls.soundSlot.value = null
})
defineExpose({ focusMenu: () => menuButton.value?.focus() })
</script>

<template>
  <div class="immersive-controls" data-testid="immersive-controls">
    <button
      ref="menuButton"
      type="button"
      class="glass-surface glass-button"
      data-testid="menu-button"
      aria-haspopup="dialog"
      aria-controls="site-menu"
      :aria-expanded="String(menuOpen)"
      @click="emit('update:menuOpen', true)"
    >
      <span aria-hidden="true">&#9776;</span> Menu <kbd class="menu-hint">Esc</kbd>
    </button>
    <div class="controls-right">
      <slot name="sound">
        <div ref="soundSlot" class="immersive-sound" data-testid="sound-slot"></div>
      </slot>
      <div class="glass-surface mode-switch" role="group" aria-label="View mode">
        <button
          type="button"
          :aria-label="label3d"
          :aria-pressed="String(mode === '3d')"
          :disabled="locked"
          :data-testid="mode === '3d' ? 'mode-3d' : 'town-mode-toggle'"
          @click="select('3d')"
        >
          3D
        </button>
        <button
          type="button"
          :aria-label="label2d"
          :aria-pressed="String(mode === '2d')"
          :data-testid="mode === '2d' ? 'mode-2d' : 'town-mode-toggle'"
          @click="select('2d')"
        >
          2D
        </button>
      </div>
      <slot name="end" />
    </div>
    <SiteMenu
      id="site-menu"
      :open="menuOpen"
      :user="user"
      :logout-pending="logoutPending"
      @close="closeMenu()"
      @navigate="onNavigate"
      @sign-out="emit('sign-out')"
    />
  </div>
</template>
