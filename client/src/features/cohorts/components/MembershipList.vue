<script setup>
defineProps({
  memberships: { type: Array, default: () => [] },
  page: { type: Number, default: 1 },
  total: { type: Number, default: 0 },
  pending: { type: Boolean, default: false },
})
defineEmits(['page'])
const statusText = (membership) => {
  if (membership.status === 'pending') return 'Request pending'
  if (membership.status === 'removed' && membership.decision === 'declined')
    return 'Request declined'
  if (membership.status === 'removed') return 'Removed'
  return 'Active'
}
const parentUnavailable = (membership) =>
  membership.cohortStatus !== 'active' || membership.institutionStatus !== 'active'
</script>

<template>
  <section class="cohort-panel" aria-labelledby="membership-list-title">
    <h2 id="membership-list-title" class="visually-hidden">Class memberships</h2>
    <p v-if="pending" role="status">Loading your classes…</p>
    <p v-else-if="memberships.length === 0" class="cohort-empty">
      You have not joined a class yet. Personal play is available while you learn.
    </p>
    <ul v-else class="cohort-list">
      <li v-for="membership in memberships" :key="membership.id">
        <div>
          <strong>{{ membership.cohortName || 'Unavailable class' }}</strong
          ><small>{{ membership.institutionName || 'Unavailable institution' }}</small>
          <small v-if="membership.status === 'pending' && !parentUnavailable(membership)">
            Waiting for your instructor to approve. You can still play personal practice.
          </small>
        </div>
        <div class="cohort-status-details">
          <span class="cohort-status">{{ statusText(membership) }}</span>
          <small v-if="parentUnavailable(membership)">Class unavailable</small>
        </div>
      </li>
    </ul>
    <div v-if="total > 20" class="cohort-pagination">
      <button
        class="btn btn-secondary"
        type="button"
        :disabled="page <= 1 || pending"
        @click="$emit('page', page - 1)"
      >
        Previous
      </button>
      <span>Page {{ page }} of {{ Math.max(1, Math.ceil(total / 20)) }}</span>
      <button
        class="btn btn-secondary"
        type="button"
        :disabled="page * 20 >= total || pending"
        @click="$emit('page', page + 1)"
      >
        Next
      </button>
    </div>
  </section>
</template>
