<script setup>
defineProps({
  mailbox: { type: String, required: true },
  caseTitle: { type: String, default: '' },
  unread: { type: Number, default: 0 },
})
</script>

<template>
  <div class="sharmail">
    <header class="sharmail-bar">
      <span class="sharmail-brand">
        <svg class="sharmail-mark" viewBox="0 0 24 24" role="img" aria-label="Sharmail">
          <rect x="2" y="5" width="20" height="14" rx="2" fill="currentColor" opacity="0.15" />
          <path
            d="M3 7.5 12 13l9-5.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <rect
            x="2.9"
            y="5.9"
            width="18.2"
            height="12.2"
            rx="1.6"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
          />
        </svg>
        <span class="sharmail-wordmark">SHARMAIL</span>
      </span>
      <span class="sharmail-mailbox">{{ mailbox }}</span>
    </header>
    <div class="sharmail-body-grid">
      <nav class="sharmail-rail" aria-label="Mail folders">
        <p class="sharmail-rail-title">Folders</p>
        <ul>
          <li class="is-active">
            <span>Inbox</span><span class="sharmail-count">{{ unread }}</span>
          </li>
          <li aria-hidden="true"><span>Sent</span></li>
          <li aria-hidden="true"><span>Archive</span></li>
          <li aria-hidden="true"><span>Deleted</span></li>
        </ul>
        <p v-if="caseTitle" class="sharmail-rail-case">{{ caseTitle }}</p>
      </nav>
      <div class="sharmail-panes"><slot /></div>
    </div>
    <slot name="footer" />
  </div>
</template>
