<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'

const props = defineProps({
  email: { type: Object, required: true },
  picking: { type: Boolean, default: false },
  highlightIds: { type: Array, default: () => [] },
  selectedPartId: { type: String, default: null },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['select-part', 'cancel-pick'])

const root = ref(null)
const QR_SIZE = 9

const senderPart = computed(() => props.email.parts.find((part) => part.kind === 'sender'))
const replyToPart = computed(() => props.email.parts.find((part) => part.kind === 'replyTo'))
const bodyParts = computed(() =>
  props.email.parts.filter((part) => part.kind !== 'sender' && part.kind !== 'replyTo'),
)

function isHighlighted(part) {
  return props.highlightIds.includes(part.id)
}

function partName(part) {
  if (part.kind === 'sender') return `Report sender: ${part.name} <${part.address}>`
  if (part.kind === 'replyTo') return `Report reply-to: ${part.address}`
  if (part.kind === 'link') return `Report link: ${part.label}, goes to ${part.destination}`
  if (part.kind === 'attachment') return `Report attachment: ${part.fileName}`
  if (part.kind === 'qr') return `Report QR code: ${part.caption}`
  if (part.kind === 'request') return `Report request: ${part.text}`
  return `Report message text: ${part.text}`
}

// deterministic pseudo qr pattern from the round id, three corners are finder squares
function qrCells(seedText) {
  let seed = 0
  for (const char of seedText) seed = (seed * 31 + char.charCodeAt(0)) >>> 0
  const cells = []
  for (let row = 0; row < QR_SIZE; row += 1) {
    for (let col = 0; col < QR_SIZE; col += 1) {
      const nearFinder =
        (row < 3 && col < 3) || (row < 3 && col >= QR_SIZE - 3) || (row >= QR_SIZE - 3 && col < 3)
      seed = (seed * 1664525 + 1013904223) >>> 0
      cells.push(nearFinder || seed >>> 28 > 7)
    }
  }
  return cells
}
const qrPattern = computed(() => qrCells(String(props.email.roundId)))

async function focusFirstPart() {
  await nextTick()
  root.value?.querySelector('button.triage-part')?.focus()
}
watch(
  () => props.picking,
  (picking) => {
    if (picking) focusFirstPart()
  },
)
onMounted(() => {
  if (props.picking) focusFirstPart()
})

function onKeydown(event) {
  if (props.picking && event.key === 'Escape') emit('cancel-pick')
}
</script>

<template>
  <article ref="root" class="triage-card" @keydown="onKeydown">
    <div class="triage-card-strip" aria-hidden="true">
      <span class="triage-strip-dot"></span>
      <span class="triage-strip-dot"></span>
      <span class="triage-strip-dot"></span>
    </div>
    <header class="triage-card-head">
      <dl class="triage-headers">
        <div v-if="senderPart">
          <dt>From</dt>
          <dd>
            <component
              :is="picking ? 'button' : 'span'"
              v-bind="
                picking
                  ? {
                      type: 'button',
                      disabled,
                      'aria-label': partName(senderPart),
                      'aria-pressed': selectedPartId === senderPart.id,
                    }
                  : {}
              "
              class="triage-part"
              :class="{
                'is-tell': isHighlighted(senderPart),
                'is-selected': selectedPartId === senderPart.id,
                'is-pickable': picking,
              }"
              @click="picking && emit('select-part', senderPart.id)"
            >
              <span class="triage-sender-name">{{ senderPart.name }}</span>
              <span class="triage-address">&lt;{{ senderPart.address }}&gt;</span>
              <span v-if="isHighlighted(senderPart)" class="triage-tell-mark"
                >What gave it away</span
              >
            </component>
          </dd>
        </div>
        <div v-if="replyToPart">
          <dt>Reply-to</dt>
          <dd>
            <component
              :is="picking ? 'button' : 'span'"
              v-bind="
                picking
                  ? {
                      type: 'button',
                      disabled,
                      'aria-label': partName(replyToPart),
                      'aria-pressed': selectedPartId === replyToPart.id,
                    }
                  : {}
              "
              class="triage-part"
              :class="{
                'is-tell': isHighlighted(replyToPart),
                'is-selected': selectedPartId === replyToPart.id,
                'is-pickable': picking,
              }"
              @click="picking && emit('select-part', replyToPart.id)"
            >
              <span class="triage-address">{{ replyToPart.address }}</span>
              <span v-if="isHighlighted(replyToPart)" class="triage-tell-mark"
                >What gave it away</span
              >
            </component>
          </dd>
        </div>
        <div>
          <dt>Received</dt>
          <dd>{{ email.receivedLabel }}</dd>
        </div>
      </dl>
      <h3 class="triage-subject">{{ email.subject }}</h3>
    </header>

    <div class="triage-card-body">
      <div v-for="part in bodyParts" :key="part.id" class="triage-row">
        <component
          :is="picking ? 'button' : 'div'"
          v-bind="
            picking
              ? {
                  type: 'button',
                  disabled,
                  'aria-label': partName(part),
                  'aria-pressed': selectedPartId === part.id,
                }
              : {}
          "
          class="triage-part"
          :class="[
            `triage-part-${part.kind}`,
            {
              'is-tell': isHighlighted(part),
              'is-selected': selectedPartId === part.id,
              'is-pickable': picking,
            },
          ]"
          @click="picking && emit('select-part', part.id)"
        >
          <template v-if="part.kind === 'link'">
            <span class="triage-link-label">{{ part.label }}</span>
            <span class="triage-destination">Goes to: {{ part.destination }}</span>
          </template>
          <template v-else-if="part.kind === 'attachment'">
            <span class="triage-file">{{ part.fileName }} · {{ part.sizeLabel }}</span>
          </template>
          <template v-else-if="part.kind === 'qr'">
            <span class="triage-qr" aria-hidden="true">
              <span
                v-for="(filled, index) in qrPattern"
                :key="index"
                class="triage-qr-cell"
                :class="{ 'is-filled': filled }"
              ></span>
            </span>
            <span class="triage-qr-text">
              <span>{{ part.caption }}</span>
              <span class="triage-destination">Points to: {{ part.decodedDestination }}</span>
            </span>
          </template>
          <template v-else>
            <span class="triage-text">{{ part.text }}</span>
          </template>
          <span v-if="isHighlighted(part)" class="triage-tell-mark">What gave it away</span>
        </component>
      </div>
    </div>
  </article>
</template>
