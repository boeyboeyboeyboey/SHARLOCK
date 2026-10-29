<script setup>
defineOptions({ name: 'SharlockImmersiveControls' })
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import SiteMenu from './SiteMenu.vue'
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
})
const emit = defineEmits(['update:menuOpen', 'toggle-mode', 'sign-out'])
const menuButton = ref(null)

function select(target) {
  if (target !== props.mode) emit('toggle-mode')
}
function closeMenu({ restoreFocus = true } = {}) {
  emit('update:menuOpen', false)
  if (restoreFocus) nextTick(() => menuButton.value?.focus())
}
// scenes consume Escape first (and mark it handled); the menu only takes what is left
function onKeydown(event) {
  if (event.key !== 'Escape' || props.menuOpen) return
  setTimeout(() => {
    if (event.defaultPrevented || props.suppressed || props.menuOpen) return
    if (document.querySelector('dialog[open]')) return
    if (event.target?.closest?.('input, textarea, select, [contenteditable]')) return
    emit('update:menuOpen', true)
  }, 0)
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
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
    <div class="glass-surface mode-switch" role="group" aria-label="View mode">
      <button
        type="button"
        aria-label="3D wharf"
        :aria-pressed="String(mode === '3d')"
        :disabled="locked"
        :data-testid="mode === '3d' ? 'mode-3d' : 'town-mode-toggle'"
        @click="select('3d')"
      >
        3D
      </button>
      <button
        type="button"
        aria-label="2D map"
        :aria-pressed="String(mode === '2d')"
        :data-testid="mode === '2d' ? 'mode-2d' : 'town-mode-toggle'"
        @click="select('2d')"
      >
        2D
      </button>
    </div>
    <SiteMenu
      id="site-menu"
      :open="menuOpen"
      :user="user"
      :logout-pending="logoutPending"
      @close="closeMenu()"
      @navigate="closeMenu({ restoreFocus: false })"
      @sign-out="emit('sign-out')"
    />
  </div>
</template>
