<script setup>
import { ref } from 'vue'
import InlineConfirm from '../../cohorts/components/InlineConfirm.vue'

defineProps({
  items: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
})
const emit = defineEmits(['reissue', 'cancel'])
const confirmingId = ref('')
const heading = ref(null)

function statusText(item) {
  const expires = item.linkExpiresAt ? new Date(item.linkExpiresAt) : null
  if (item.linkStatus === 'expired' || !expires || Number.isNaN(expires.getTime())) {
    return 'Link expired'
  }
  return `Link expires ${expires.toLocaleString()}`
}

function confirmCancel(item) {
  confirmingId.value = ''
  emit('cancel', item)
}

defineExpose({ focusHeading: () => heading.value?.focus() })
</script>

<template>
  <section class="admin-workspace__panel" aria-labelledby="pending-administrators-title">
    <div class="admin-workspace__section-heading">
      <div>
        <h2 id="pending-administrators-title" ref="heading" tabindex="-1">
          Pending administrators
        </h2>
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
        <div class="admin-workspace__row-actions">
          <button
            class="admin-workspace__text-button"
            type="button"
            :disabled="loading"
            :aria-label="`Reissue link for ${item.username}`"
            @click="$emit('reissue', item)"
          >
            Reissue link
          </button>
          <button
            class="admin-workspace__text-button admin-workspace__text-button--danger"
            type="button"
            :disabled="loading"
            :aria-label="`Cancel ${item.username}`"
            @click="confirmingId = item.id"
          >
            Cancel
          </button>
        </div>
        <InlineConfirm
          v-if="confirmingId === item.id"
          :message="`Cancel the pending administrator ${item.username}? Their activation link will stop working.`"
          confirm-label="Yes, cancel them"
          cancel-label="Keep them"
          @confirm="confirmCancel(item)"
          @cancel="confirmingId = ''"
        />
      </li>
    </ul>
  </section>
</template>
