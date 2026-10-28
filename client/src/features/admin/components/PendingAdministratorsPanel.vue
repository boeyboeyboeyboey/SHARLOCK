<script setup>
defineProps({
  items: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
})
defineEmits(['reissue', 'cancel'])

function statusText(item) {
  const expires = item.linkExpiresAt ? new Date(item.linkExpiresAt) : null
  if (item.linkStatus === 'expired' || !expires || Number.isNaN(expires.getTime())) {
    return 'Link expired'
  }
  return `Link expires ${expires.toLocaleString()}`
}
</script>

<template>
  <section class="admin-workspace__panel" aria-labelledby="pending-administrators-title">
    <div class="admin-workspace__section-heading">
      <div>
        <p class="admin-workspace__eyebrow">ACCESS</p>
        <h2 id="pending-administrators-title">Pending administrators</h2>
      </div>
    </div>
    <p v-if="error" class="admin-workspace__alert" role="alert">{{ error }}</p>
    <p v-if="loading && items.length === 0" role="status">Loading…</p>
    <p v-else-if="items.length === 0" class="admin-workspace__empty">No pending administrators</p>
    <ul v-else class="admin-workspace__instructor-list">
      <li v-for="item in items" :key="item.id" class="admin-workspace__instructor-row">
        <div class="admin-workspace__instructor-identity">
          <div>
            <strong>{{ item.username }}</strong>
            <span>{{ item.email }}</span>
            <span class="admin-workspace__status">{{ statusText(item) }}</span>
          </div>
        </div>
        <div>
          <button
            class="admin-workspace__text-button"
            type="button"
            :disabled="loading"
            :aria-label="`Reissue link for ${item.username}`"
            @click="$emit('reissue', item.id)"
          >
            Reissue link
          </button>
          <button
            class="admin-workspace__text-button admin-workspace__text-button--danger"
            type="button"
            :disabled="loading"
            :aria-label="`Cancel ${item.username}`"
            @click="$emit('cancel', item)"
          >
            Cancel
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>
