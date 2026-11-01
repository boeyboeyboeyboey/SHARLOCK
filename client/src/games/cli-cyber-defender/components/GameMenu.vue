<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import CliIcon from './CliIcon.vue'

defineProps({
  canPause: { type: Boolean, default: false },
  pauseNote: { type: String, default: '' },
  paused: { type: Boolean, default: false },
  canEnd: { type: Boolean, default: false },
  soundOn: { type: Boolean, default: false },
  soundUnavailable: { type: Boolean, default: false },
})
const emit = defineEmits(['pause', 'resume', 'toggle-sound', 'end', 'leave'])

const open = ref(false)
const root = ref(null)
const trigger = ref(null)
const list = ref(null)

function menuItems() {
  return [...(list.value?.querySelectorAll('[role^="menuitem"]') ?? [])]
}

async function toggle() {
  open.value = !open.value
  if (!open.value) return
  await nextTick()
  menuItems()[0]?.focus()
}

function close(returnFocus = true) {
  open.value = false
  if (returnFocus) trigger.value?.focus()
}

function choose(action) {
  close(action === 'toggle-sound')
  emit(action)
}

// arrow keys move between items, escape closes and returns focus to the menu button
function onKeydown(event) {
  if (!open.value) return
  const items = menuItems()
  const index = items.indexOf(document.activeElement)
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    items[(index + 1) % items.length]?.focus()
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    items[(index - 1 + items.length) % items.length]?.focus()
  } else if (event.key === 'Tab') close(false)
}

function onOutside(event) {
  if (open.value && !root.value?.contains(event.target)) close(false)
}

onMounted(() => document.addEventListener('pointerdown', onOutside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside))
</script>

<template>
  <div ref="root" class="cli-menu" @keydown="onKeydown">
    <button
      ref="trigger"
      type="button"
      class="btn cli-menu-button"
      aria-haspopup="menu"
      :aria-expanded="open"
      aria-controls="cli-game-menu"
      @click="toggle"
    >
      <CliIcon name="menu" :size="18" />Options
    </button>
    <ul
      v-show="open"
      id="cli-game-menu"
      ref="list"
      class="cli-menu-list"
      role="menu"
      aria-label="Game options"
    >
      <li role="none">
        <button
          type="button"
          role="menuitemcheckbox"
          :aria-checked="soundOn"
          class="cli-menu-item"
          @click="choose('toggle-sound')"
        >
          <CliIcon :name="soundOn ? 'sound-on' : 'sound-off'" :size="16" />Sound
          {{ soundOn ? 'on' : 'off' }}
        </button>
      </li>
      <li v-if="soundUnavailable" role="none" class="cli-menu-note">
        Sound is not available here.
      </li>
      <li v-if="canPause" role="none">
        <button
          type="button"
          role="menuitem"
          class="cli-menu-item"
          @click="choose(paused ? 'resume' : 'pause')"
        >
          <CliIcon :name="paused ? 'play' : 'pause'" :size="16" />{{ paused ? 'Resume' : 'Pause' }}
        </button>
      </li>
      <li v-if="pauseNote" role="none" class="cli-menu-note">{{ pauseNote }}</li>
      <li v-if="canEnd" role="none">
        <button type="button" role="menuitem" class="cli-menu-item" @click="choose('end')">
          <CliIcon name="stop" :size="16" />End practice
        </button>
      </li>
      <li role="none">
        <button
          type="button"
          role="menuitem"
          class="cli-menu-item cli-menu-danger"
          @click="choose('leave')"
        >
          <CliIcon name="cross" :size="16" />Quit to briefing
        </button>
      </li>
    </ul>
  </div>
</template>
