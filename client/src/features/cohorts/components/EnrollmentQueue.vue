<script setup>
import { computed, ref, watch } from 'vue'
import InlineConfirm from './InlineConfirm.vue'

const props = defineProps({
  memberships: { type: Array, default: () => [] },
  pendingIds: { type: Object, default: () => ({}) },
  status: { type: String, default: 'pending' },
  page: { type: Number, default: 1 },
  total: { type: Number, default: 0 },
  busy: { type: Boolean, default: false },
  recoveryAllowed: { type: Boolean, default: false },
  className: { type: String, default: 'this class' },
})
const emit = defineEmits(['approve', 'reject', 'remove', 'page', 'recover'])
const confirmingId = ref('')
const confirmingMember = computed(() =>
  props.memberships.find((member) => member.id === confirmingId.value),
)
const confirmMessage = computed(() => {
  const username = confirmingMember.value?.username
  return props.status === 'pending'
    ? `Decline ${username}'s request? They must ask again with a class code.`
    : `Remove ${username} from ${props.className}? They lose class access and must rejoin.`
})

watch(
  () => props.memberships,
  () => {
    confirmingId.value = ''
  },
)

function confirmDecision(member) {
  confirmingId.value = ''
  emit(props.status === 'pending' ? 'reject' : 'remove', member)
}
</script>

<template>
  <section class="cohort-panel" aria-label="Class members">
    <p v-if="memberships.length === 0" class="cohort-empty">
      No {{ status }} class members on this page.
    </p>
    <ul v-else class="cohort-list cohort-member-list">
      <li v-for="member in memberships" :key="member.id">
        <div>
          <strong>{{ member.username }}</strong
          ><small>{{ member.email }} · {{ member.status }}</small>
        </div>
        <div class="cohort-row-actions">
          <template v-if="status === 'pending'">
            <button
              class="btn btn-primary"
              type="button"
              :disabled="pendingIds[member.id] || busy"
              @click="$emit('approve', member)"
            >
              Approve
            </button>
            <button
              class="btn btn-secondary"
              type="button"
              :disabled="pendingIds[member.id] || busy"
              :aria-label="`Decline ${member.username}`"
              @click="confirmingId = member.id"
            >
              Decline
            </button>
          </template>
          <button
            v-else-if="status === 'active'"
            class="btn btn-secondary"
            type="button"
            :disabled="pendingIds[member.id] || busy"
            :aria-label="`Remove ${member.username}`"
            @click="confirmingId = member.id"
          >
            Remove
          </button>
          <button
            v-if="status === 'active' && recoveryAllowed"
            class="btn btn-secondary"
            type="button"
            :disabled="pendingIds[member.id] || busy"
            :aria-label="`Prepare password reset link for ${member.username}`"
            @click="$emit('recover', member)"
          >
            Prepare password reset link
          </button>
        </div>
        <InlineConfirm
          v-if="confirmingId === member.id"
          :message="confirmMessage"
          :confirm-label="status === 'pending' ? 'Yes, decline' : 'Yes, remove'"
          @confirm="confirmDecision(member)"
          @cancel="confirmingId = ''"
        />
      </li>
    </ul>
    <div v-if="total > 20" class="cohort-pagination">
      <button
        class="btn btn-secondary"
        type="button"
        :disabled="page <= 1 || busy"
        @click="$emit('page', page - 1)"
      >
        Previous
      </button>
      <span>Page {{ page }} of {{ Math.max(1, Math.ceil(total / 20)) }}</span>
      <button
        class="btn btn-secondary"
        type="button"
        :disabled="page * 20 >= total || busy"
        @click="$emit('page', page + 1)"
      >
        Next
      </button>
    </div>
  </section>
</template>
