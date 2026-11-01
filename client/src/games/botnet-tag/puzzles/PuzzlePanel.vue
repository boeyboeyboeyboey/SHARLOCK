<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import AccountBody from './AccountBody.vue'
import FirewallBody from './FirewallBody.vue'
import HashBody from './HashBody.vue'
import PatchBody from './PatchBody.vue'
import ProcessBody from './ProcessBody.vue'
import SpoofBody from './SpoofBody.vue'

const props = defineProps({
  kind: { type: String, required: true },
  data: { type: Object, required: true },
  msLeft: { type: Number, default: 0 },
})
const emit = defineEmits(['submit', 'close'])

const KINDS = {
  firewall: { title: 'Firewall', icon: '▦', body: FirewallBody, action: 'Apply' },
  patch: { title: 'Patch', icon: '⬆', body: PatchBody, action: 'Install' },
  process: { title: 'Processes', icon: '⚙', body: ProcessBody, action: 'End process' },
  hash: { title: 'Checksum', icon: '#', body: HashBody, action: 'Verify' },
  spoof: { title: 'Sender', icon: '✉', body: SpoofBody, action: 'Block sender' },
  account: { title: 'Passwords', icon: '⚿', body: AccountBody, action: 'Secure' },
}
const meta = computed(() => KINDS[props.kind] ?? KINDS.firewall)

const root = ref(null)
const submission = ref(null)
// the first time left seen is the full window for the bar
const total = ref(Math.max(props.msLeft, 1))
const pct = computed(() => Math.min(100, (props.msLeft / total.value) * 100))
const seconds = computed(() => Math.ceil(props.msLeft / 1000))
let opener = null
const FOCUSABLE = 'button, input, select, a[href], [tabindex]:not([tabindex="-1"])'

function send() {
  if (submission.value) emit('submit', submission.value)
}

function onKey(event) {
  if (event.key === 'Enter' && submission.value && !event.target.closest('.pz-close')) {
    event.preventDefault()
    send()
  }
}

function keepTabInside(event) {
  const items = [...root.value.querySelectorAll(FOCUSABLE)].filter((item) => !item.disabled)
  if (items.length === 0) return
  const first = items[0]
  const last = items.at(-1)
  const active = document.activeElement
  if (!root.value.contains(active) || (event.shiftKey && [first, root.value].includes(active))) {
    event.preventDefault()
    ;(event.shiftKey ? last : first).focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

// on the document, because a click on the yard takes focus out of the panel while movement stays off
function onDocumentKey(event) {
  if (document.querySelector('dialog[open]')) return
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  } else if (event.key === 'Tab') keepTabInside(event)
}

onMounted(async () => {
  opener = document.activeElement
  document.addEventListener('keydown', onDocumentKey)
  await nextTick()
  root.value?.focus()
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocumentKey)
  if (opener?.isConnected && typeof opener.focus === 'function') opener.focus()
})
</script>

<template>
  <section
    ref="root"
    class="tag-panel tag-puzzle"
    role="dialog"
    aria-modal="true"
    aria-labelledby="pz-title"
    tabindex="-1"
    data-testid="puzzle-panel"
    @keydown="onKey"
  >
    <header class="tag-panel-head">
      <h2 id="pz-title" class="pz-title">
        <span aria-hidden="true">{{ meta.icon }}</span> {{ meta.title }}
      </h2>
      <span class="pz-time" role="timer" data-testid="puzzle-time">{{ seconds }}s</span>
    </header>
    <div
      class="tag-bar pz-bar"
      role="progressbar"
      aria-label="Time left"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="Math.round(pct)"
    >
      <i :class="{ 'is-urgent': seconds <= 5 }" :style="{ width: `${pct}%` }" />
    </div>
    <component :is="meta.body" :data="data" @change="submission = $event" />
    <div class="tag-foot is-end">
      <button
        type="button"
        class="tag-btn pz-close"
        data-testid="puzzle-close"
        @click="emit('close')"
      >
        Close
      </button>
      <button
        type="button"
        class="tag-btn is-primary"
        :disabled="!submission"
        data-testid="puzzle-submit"
        @click="send"
      >
        {{ meta.action }}
      </button>
    </div>
  </section>
</template>
