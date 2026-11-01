<script setup>
defineOptions({ name: 'SharlockOverlayPanel' })
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import './menu.css'
import SessionNotice from '../../components/common/SessionNotice.vue'

const props = defineProps({
  title: { type: String, required: true },
  // the panel sits inside the portal shell so the shared page rules still reach its content
  teleport: { type: Boolean, default: true },
  paper: { type: Boolean, default: true },
  // pages that show their own session notice turn this off, so a failed session check is not reported twice
  sessionNotice: { type: Boolean, default: true },
})
const emit = defineEmits(['request-close'])
const dialog = ref(null)
const heading = ref(null)
const target = computed(() => (props.teleport ? document.querySelector('.portal-shell') : null))

onMounted(() => {
  const el = dialog.value
  if (typeof el.showModal === 'function') el.showModal()
  else el.setAttribute('open', '')
  heading.value?.focus({ preventScroll: true })
})
onBeforeUnmount(() => dialog.value?.close?.())
</script>

<template>
  <Teleport :to="target || 'body'" :disabled="!target">
    <dialog
      ref="dialog"
      class="menu-overlay glass-surface"
      data-testid="menu-overlay"
      aria-labelledby="menu-overlay-title"
      @cancel.prevent="emit('request-close')"
      @click.self="emit('request-close')"
    >
      <div class="overlay-bar">
        <h2 id="menu-overlay-title" ref="heading" class="overlay-title" tabindex="-1">
          {{ title }}
        </h2>
        <button
          type="button"
          class="overlay-close"
          data-testid="menu-overlay-close"
          :aria-label="`Close ${title}`"
          @click="emit('request-close')"
        >
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <slot name="tabs"></slot>
      <!-- focusable so a keyboard user can scroll a panel with no link or button in it -->
      <div class="overlay-body" role="region" :aria-label="title" tabindex="0">
        <SessionNotice v-if="sessionNotice" />
        <div :class="{ 'overlay-paper': paper }"><slot></slot></div>
      </div>
    </dialog>
  </Teleport>
</template>
