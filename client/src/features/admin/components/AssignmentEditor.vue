<script setup>
import { computed, nextTick, ref, watch } from 'vue'

const props = defineProps({
  instructor: { type: Object, required: true },
  cohorts: { type: Array, default: () => [] },
  cohortPage: { type: Number, default: 1 },
  cohortTotal: { type: Number, default: 0 },
  pending: { type: Boolean, default: false },
  error: { type: String, default: '' },
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['save', 'reload', 'cohort-page', 'toggle'])
const draftIds = ref([])
const editButton = ref(null)
const displayedCohorts = computed(() => props.cohorts.filter(cohortIsEligible))
const assignedCohorts = computed(() =>
  Array.isArray(props.instructor.assignedCohorts)
    ? props.instructor.assignedCohorts
    : props.cohorts.filter((cohort) => props.instructor.cohortIds?.includes(cohort.id)),
)
const isActive = computed(() => props.instructor.accountStatus === 'active')
const draftUnsaved = computed(() => {
  const saved = props.instructor.cohortIds || []
  return draftIds.value.length !== saved.length || draftIds.value.some((id) => !saved.includes(id))
})

function cohortIsEligible(cohort) {
  return cohort.status === 'active' && cohort.institutionStatus === 'active'
}

function resetDraft() {
  draftIds.value = Array.isArray(props.instructor.cohortIds) ? [...props.instructor.cohortIds] : []
}

watch(
  () => [
    props.instructor.id,
    props.instructor.assignmentRevision,
    Array.isArray(props.instructor.cohortIds) ? props.instructor.cohortIds.join(',') : '',
  ],
  resetDraft,
  { immediate: true },
)

// closing removes the button that had focus, so it moves to the one that reopens the checklist
watch(
  () => props.open,
  async (isOpen, wasOpen) => {
    if (isOpen || !wasOpen) return
    await nextTick()
    if (document.activeElement === document.body) editButton.value?.focus()
  },
  { flush: 'post' },
)

function setSelected(cohortId, selected) {
  const selectedIds = new Set(draftIds.value)
  if (selected) selectedIds.add(cohortId)
  else selectedIds.delete(cohortId)
  draftIds.value = [...selectedIds]
}

function save() {
  emit('save', {
    instructorId: props.instructor.id,
    input: {
      cohortIds: [...draftIds.value],
      expectedRevision: props.instructor.assignmentRevision,
    },
  })
}

function cancelEdit() {
  resetDraft()
  emit('toggle', props.instructor.id)
}
</script>

<template>
  <article class="admin-workspace__instructor" :aria-label="instructor.username">
    <p v-if="error" class="admin-workspace__alert" role="alert">{{ error }}</p>
    <p v-if="instructor.pendingActivation" class="admin-workspace__empty">
      The instructor must activate their account before class access can be assigned.
    </p>
    <p v-else-if="!isActive" class="admin-workspace__empty">
      A disabled instructor cannot be given classes. Reissue their link to restore access.
    </p>

    <ul v-if="assignedCohorts.length" class="admin-workspace__retained-assignments">
      <li v-for="cohort in assignedCohorts" :key="cohort.id">
        <strong>{{ cohort.name }}</strong>
        <span>{{ cohort.institutionName }} · {{ cohort.term }}</span>
        <small v-if="!cohortIsEligible(cohort)">Inactive; retained assignment</small>
      </li>
    </ul>
    <p v-else-if="isActive" class="admin-workspace__empty">No classes assigned yet.</p>

    <button
      v-if="isActive"
      ref="editButton"
      class="admin-workspace__text-button admin-workspace__edit-toggle"
      type="button"
      :aria-expanded="open"
      :disabled="pending"
      @click="emit('toggle', instructor.id)"
    >
      Edit assignments
    </button>

    <template v-if="open && isActive">
      <fieldset class="admin-workspace__assignment-list" :disabled="pending">
        <legend>Available classes</legend>
        <p v-if="displayedCohorts.length === 0" class="admin-workspace__empty">
          No active classes are available on this page.
        </p>
        <label
          v-for="cohort in displayedCohorts"
          :key="cohort.id"
          class="admin-workspace__assignment"
        >
          <input
            type="checkbox"
            :checked="draftIds.includes(cohort.id)"
            :aria-label="`${cohort.name}, ${cohort.institutionName}, ${cohort.term}`"
            @change="setSelected(cohort.id, $event.target.checked)"
          />
          <span>
            <strong>{{ cohort.name }}</strong>
            <small>{{ cohort.institutionName }} · {{ cohort.term }}</small>
          </span>
        </label>
      </fieldset>

      <div class="admin-workspace__pagination" aria-label="Assignment class pages">
        <button
          class="admin-workspace__text-button"
          type="button"
          :disabled="cohortPage <= 1 || pending"
          @click="emit('cohort-page', cohortPage - 1)"
        >
          Previous classes
        </button>
        <span>Page {{ cohortPage }} of {{ Math.max(1, Math.ceil(cohortTotal / 50)) }}</span>
        <button
          class="admin-workspace__text-button"
          type="button"
          :disabled="cohortPage * 50 >= cohortTotal || pending"
          @click="emit('cohort-page', cohortPage + 1)"
        >
          Next classes
        </button>
      </div>

      <div class="admin-workspace__actions">
        <button class="admin-workspace__button" type="button" :disabled="pending" @click="save">
          {{ pending ? 'Saving assignments…' : 'Save assignments' }}
        </button>
        <button
          class="admin-workspace__text-button"
          type="button"
          :disabled="pending"
          @click="cancelEdit"
        >
          Cancel
        </button>
        <button
          v-if="error"
          class="admin-workspace__text-button"
          type="button"
          :disabled="pending"
          @click="emit('reload', instructor.id)"
        >
          Reload assignments
        </button>
      </div>
      <p class="admin-workspace__assignment-count">
        {{ draftIds.length }} selected{{ draftUnsaved ? ', not saved yet' : ' (saved)' }}
      </p>
    </template>
  </article>
</template>
