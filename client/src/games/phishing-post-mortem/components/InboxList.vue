<script setup>
import { mailTime, senderInitials } from '../phishing.js'

defineProps({
  emails: { type: Array, required: true },
  selectedEmailId: { type: String, default: '' },
})
defineEmits(['select-email'])

// arrow keys walk the message rows the way a desktop mail client does
function moveFocus(event) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  const rows = [...event.currentTarget.querySelectorAll('button')]
  const index = rows.indexOf(document.activeElement)
  if (index < 0) return
  event.preventDefault()
  const target = event.key === 'ArrowDown' ? index + 1 : index - 1
  rows[Math.min(Math.max(target, 0), rows.length - 1)]?.focus()
}
</script>

<template>
  <ul class="sharmail-list" aria-label="Inbox messages" @keydown="moveFocus">
    <li v-for="email in emails" :key="email.id">
      <button
        type="button"
        class="sharmail-row"
        :data-email-id="email.id"
        :class="{ 'is-open': email.id === selectedEmailId, 'is-unread': !email.read }"
        :aria-current="email.id === selectedEmailId ? 'true' : undefined"
        @click="$emit('select-email', email.id)"
      >
        <span class="sharmail-avatar" aria-hidden="true">{{
          senderInitials(email.senderName)
        }}</span>
        <span class="sharmail-row-text">
          <span class="sharmail-row-top">
            <span class="sharmail-sender">{{ email.senderName }}</span>
            <span class="sharmail-when">{{ mailTime(email.sentAt) }}</span>
          </span>
          <span class="sharmail-subject">{{ email.subject }}</span>
          <span class="sharmail-preview">{{ email.bodyText }}</span>
        </span>
        <span v-if="!email.read" class="sharmail-unread-dot"
          ><span class="visually-hidden">Unread</span></span
        >
      </button>
    </li>
  </ul>
</template>
