<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import InlineConfirm from '../../cohorts/components/InlineConfirm.vue'

const props = defineProps({
  institutions: { type: Array, default: () => [] },
  cohorts: { type: Array, default: () => [] },
  institutionPage: { type: Number, default: 1 },
  institutionTotal: { type: Number, default: 0 },
  cohortPage: { type: Number, default: 1 },
  cohortTotal: { type: Number, default: 0 },
  selectedInstitutionId: { type: String, default: '' },
  loadingInstitutions: { type: Boolean, default: false },
  loadingCohorts: { type: Boolean, default: false },
  pendingInstitution: { type: Boolean, default: false },
  pendingCohort: { type: Boolean, default: false },
  updatingInstitutionId: { type: String, default: '' },
  updatingCohortId: { type: String, default: '' },
  error: { type: String, default: '' },
  // the form that failed and the server's message for each of its fields
  fieldErrors: { type: Object, default: () => ({ form: '', fields: {} }) },
})
const emit = defineEmits([
  'create-institution',
  'create-cohort',
  'update-institution',
  'update-cohort',
  'select-institution',
  'institution-page',
  'cohort-page',
])

const institutionName = ref('')
const institutionSlug = ref('')
const cohortName = ref('')
const cohortTerm = ref('')
const institutionEditId = ref('')
const institutionDraft = ref({ name: '', status: 'active' })
const cohortEditId = ref('')
const cohortDraft = ref({ name: '', term: '', status: 'active' })
const activeInstitutions = computed(() =>
  props.institutions.filter((institution) => institution.status === 'active'),
)
const cohortInstitutionId = ref('')
const confirmingDeactivation = ref('')
const institutionsHeading = ref(null)
const cohortsHeading = ref(null)
const panel = ref(null)
const DEACTIVATE_CLASS =
  'Deactivate this class? Students keep their results and can join another class, but its code stops working and no one can join or be approved.'
const DEACTIVATE_INSTITUTION =
  'Deactivate this institution? No class can be created or reactivated in it until it is active again.'

watch(
  () => [activeInstitutions.value, props.selectedInstitutionId],
  ([rows, selectedId]) => {
    if (rows.some(({ id }) => id === selectedId)) {
      cohortInstitutionId.value = selectedId
    } else if (!rows.some(({ id }) => id === cohortInstitutionId.value)) {
      cohortInstitutionId.value = rows[0]?.id || ''
    }
  },
  { immediate: true },
)

function createInstitution() {
  emit('create-institution', {
    name: institutionName.value,
    slug: institutionSlug.value,
  })
}

function createCohort() {
  emit('create-cohort', {
    institutionId: cohortInstitutionId.value,
    name: cohortName.value,
    term: cohortTerm.value,
  })
}

function editInstitution(institution) {
  institutionEditId.value = institution.id
  institutionDraft.value = { name: institution.name, status: institution.status }
  cohortEditId.value = ''
}

function editCohort(cohort) {
  cohortEditId.value = cohort.id
  cohortDraft.value = { name: cohort.name, term: cohort.term, status: cohort.status }
  institutionEditId.value = ''
}

function fieldError(form, field) {
  return props.fieldErrors.form === form ? props.fieldErrors.fields?.[field] || '' : ''
}

function saveInstitution(institution) {
  if (institutionDraft.value.status === 'inactive' && institution.status === 'active') {
    if (confirmingDeactivation.value !== institution.id) {
      confirmingDeactivation.value = institution.id
      return
    }
  }
  confirmingDeactivation.value = ''
  emit('update-institution', {
    id: institution.id,
    name: institutionDraft.value.name,
    status: institutionDraft.value.status,
    expectedRevision: institution.revision ?? 0,
  })
}

function saveCohort(cohort) {
  if (cohortDraft.value.status === 'inactive' && cohort.status === 'active') {
    if (confirmingDeactivation.value !== cohort.id) {
      confirmingDeactivation.value = cohort.id
      return
    }
  }
  confirmingDeactivation.value = ''
  emit('update-cohort', {
    id: cohort.id,
    name: cohortDraft.value.name,
    term: cohortDraft.value.term,
    status: cohortDraft.value.status,
    expectedRevision: cohort.revision ?? 0,
  })
}

function finishInstitutionEdit() {
  institutionEditId.value = ''
  confirmingDeactivation.value = ''
}

function finishCohortEdit() {
  cohortEditId.value = ''
  confirmingDeactivation.value = ''
}

// backing out of an edit returns to its button; the row is still there because nothing reloaded
async function cancelEdit(finish, id) {
  finish()
  await nextTick()
  panel.value?.querySelector(`[data-edit-id="${id}"]`)?.focus()
}

function focusInstitutions() {
  institutionsHeading.value?.focus()
}

function focusCohorts() {
  cohortsHeading.value?.focus()
}

function resetInstitutionForm() {
  institutionName.value = ''
  institutionSlug.value = ''
}

function resetCohortForm() {
  cohortName.value = ''
  cohortTerm.value = ''
}

defineExpose({
  resetInstitutionForm,
  resetCohortForm,
  finishInstitutionEdit,
  finishCohortEdit,
  focusInstitutions,
  focusCohorts,
})

function statusLabel(status) {
  return status === 'active' ? 'Active' : 'Inactive'
}
</script>

<template>
  <section ref="panel" class="admin-workspace__panel" aria-labelledby="institution-class-title">
    <div class="admin-workspace__section-heading">
      <div>
        <h2 id="institution-class-title">Institutions and classes</h2>
      </div>
    </div>

    <p v-if="error" class="admin-workspace__alert" role="alert">{{ error }}</p>

    <div class="admin-workspace__two-column">
      <form class="admin-workspace__form" @submit.prevent="createInstitution">
        <h3>Create an institution</h3>
        <label for="admin-institution-name">Institution name</label>
        <input
          id="admin-institution-name"
          v-model="institutionName"
          name="name"
          autocomplete="organization"
          maxlength="100"
          required
          :disabled="pendingInstitution"
          :aria-invalid="Boolean(fieldError('institution', 'name'))"
          :aria-describedby="
            fieldError('institution', 'name') ? 'admin-institution-name-error' : undefined
          "
        />
        <p
          v-if="fieldError('institution', 'name')"
          id="admin-institution-name-error"
          class="admin-workspace__field-error"
        >
          {{ fieldError('institution', 'name') }}
        </p>
        <label for="admin-institution-slug">Institution slug</label>
        <input
          id="admin-institution-slug"
          v-model="institutionSlug"
          name="slug"
          autocapitalize="none"
          maxlength="64"
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          required
          :disabled="pendingInstitution"
          :aria-invalid="Boolean(fieldError('institution', 'slug'))"
          aria-describedby="admin-institution-slug-hint"
        />
        <p v-if="fieldError('institution', 'slug')" class="admin-workspace__field-error">
          {{ fieldError('institution', 'slug') }}
        </p>
        <small id="admin-institution-slug-hint">
          Use lowercase letters or numbers separated by single hyphens.
        </small>
        <button class="admin-workspace__button" type="submit" :disabled="pendingInstitution">
          {{ pendingInstitution ? 'Creating…' : 'Create institution' }}
        </button>
      </form>

      <div class="admin-workspace__list-panel">
        <h3 ref="institutionsHeading" tabindex="-1">Institutions</h3>
        <p v-if="loadingInstitutions" role="status">Loading institutions…</p>
        <p v-else-if="institutions.length === 0" class="admin-workspace__empty">
          No institutions are listed yet.
        </p>
        <ul v-else class="admin-workspace__list">
          <li v-for="institution in institutions" :key="institution.id">
            <form
              v-if="institutionEditId === institution.id"
              class="admin-workspace__edit-form"
              @submit.prevent="saveInstitution(institution)"
            >
              <label :for="`admin-institution-edit-name-${institution.id}`">Institution name</label>
              <input
                :id="`admin-institution-edit-name-${institution.id}`"
                v-model="institutionDraft.name"
                maxlength="100"
                required
                :disabled="updatingInstitutionId === institution.id"
                :aria-invalid="Boolean(fieldError('institution-edit', 'name'))"
              />
              <p v-if="fieldError('institution-edit', 'name')" class="admin-workspace__field-error">
                {{ fieldError('institution-edit', 'name') }}
              </p>
              <label :for="`admin-institution-edit-status-${institution.id}`">Status</label>
              <select
                :id="`admin-institution-edit-status-${institution.id}`"
                v-model="institutionDraft.status"
                :disabled="updatingInstitutionId === institution.id"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <button
                class="admin-workspace__button"
                type="submit"
                :disabled="updatingInstitutionId === institution.id"
              >
                {{ updatingInstitutionId === institution.id ? 'Saving…' : 'Save institution' }}
              </button>
              <button
                class="admin-workspace__text-button"
                type="button"
                :disabled="updatingInstitutionId === institution.id"
                @click="cancelEdit(finishInstitutionEdit, institution.id)"
              >
                Cancel
              </button>
              <InlineConfirm
                v-if="confirmingDeactivation === institution.id"
                :message="DEACTIVATE_INSTITUTION"
                confirm-label="Yes, deactivate"
                @confirm="saveInstitution(institution)"
                @cancel="confirmingDeactivation = ''"
              />
            </form>
            <div v-else>
              <strong>{{ institution.name }}</strong>
              <span>{{ institution.slug }} · {{ statusLabel(institution.status) }}</span>
            </div>
            <div class="admin-workspace__list-actions">
              <button
                v-if="institutionEditId !== institution.id"
                class="admin-workspace__text-button"
                type="button"
                :data-edit-id="institution.id"
                :aria-label="`Edit ${institution.name}`"
                @click="editInstitution(institution)"
              >
                Edit
              </button>
              <button
                class="admin-workspace__text-button"
                type="button"
                :aria-pressed="selectedInstitutionId === institution.id"
                @click="emit('select-institution', institution.id)"
              >
                {{ selectedInstitutionId === institution.id ? 'Selected' : 'View classes' }}
              </button>
            </div>
          </li>
        </ul>
        <div class="admin-workspace__pagination" aria-label="Institution pages">
          <button
            class="admin-workspace__text-button"
            type="button"
            :disabled="institutionPage <= 1 || loadingInstitutions"
            @click="emit('institution-page', institutionPage - 1)"
          >
            Previous
          </button>
          <span
            >Page {{ institutionPage }} of {{ Math.max(1, Math.ceil(institutionTotal / 20)) }}</span
          >
          <button
            class="admin-workspace__text-button"
            type="button"
            :disabled="institutionPage * 20 >= institutionTotal || loadingInstitutions"
            @click="emit('institution-page', institutionPage + 1)"
          >
            Next
          </button>
        </div>
      </div>
    </div>

    <div class="admin-workspace__two-column admin-workspace__two-column--classes">
      <form class="admin-workspace__form" @submit.prevent="createCohort">
        <h3>Create a class</h3>
        <label for="admin-cohort-institution">Institution</label>
        <select
          id="admin-cohort-institution"
          v-model="cohortInstitutionId"
          required
          :disabled="pendingCohort || activeInstitutions.length === 0"
          @change="emit('select-institution', $event.target.value)"
        >
          <option value="" disabled>Select an institution</option>
          <option
            v-for="institution in activeInstitutions"
            :key="institution.id"
            :value="institution.id"
          >
            {{ institution.name }}
          </option>
        </select>
        <label for="admin-cohort-name">Class name</label>
        <input
          id="admin-cohort-name"
          v-model="cohortName"
          name="name"
          maxlength="100"
          required
          :disabled="pendingCohort"
          :aria-invalid="Boolean(fieldError('cohort', 'name'))"
        />
        <p v-if="fieldError('cohort', 'name')" class="admin-workspace__field-error">
          {{ fieldError('cohort', 'name') }}
        </p>
        <label for="admin-cohort-term">Term</label>
        <input
          id="admin-cohort-term"
          v-model="cohortTerm"
          name="term"
          maxlength="50"
          required
          :disabled="pendingCohort"
          :aria-invalid="Boolean(fieldError('cohort', 'term'))"
        />
        <p v-if="fieldError('cohort', 'term')" class="admin-workspace__field-error">
          {{ fieldError('cohort', 'term') }}
        </p>
        <button
          class="admin-workspace__button"
          type="submit"
          :disabled="pendingCohort || !cohortInstitutionId"
        >
          {{ pendingCohort ? 'Creating…' : 'Create class' }}
        </button>
      </form>

      <div class="admin-workspace__list-panel">
        <h3 ref="cohortsHeading" tabindex="-1">Classes</h3>
        <p v-if="loadingCohorts" role="status">Loading classes…</p>
        <p v-else-if="cohorts.length === 0" class="admin-workspace__empty">
          No classes are listed for this institution.
        </p>
        <ul v-else class="admin-workspace__list">
          <li v-for="cohort in cohorts" :key="cohort.id">
            <form
              v-if="cohortEditId === cohort.id"
              class="admin-workspace__edit-form"
              @submit.prevent="saveCohort(cohort)"
            >
              <label :for="`admin-cohort-edit-name-${cohort.id}`">Class name</label>
              <input
                :id="`admin-cohort-edit-name-${cohort.id}`"
                v-model="cohortDraft.name"
                maxlength="100"
                required
                :disabled="updatingCohortId === cohort.id"
                :aria-invalid="Boolean(fieldError('cohort-edit', 'name'))"
              />
              <p v-if="fieldError('cohort-edit', 'name')" class="admin-workspace__field-error">
                {{ fieldError('cohort-edit', 'name') }}
              </p>
              <label :for="`admin-cohort-edit-term-${cohort.id}`">Term</label>
              <input
                :id="`admin-cohort-edit-term-${cohort.id}`"
                v-model="cohortDraft.term"
                maxlength="50"
                required
                :disabled="updatingCohortId === cohort.id"
                :aria-invalid="Boolean(fieldError('cohort-edit', 'term'))"
              />
              <p v-if="fieldError('cohort-edit', 'term')" class="admin-workspace__field-error">
                {{ fieldError('cohort-edit', 'term') }}
              </p>
              <label :for="`admin-cohort-edit-status-${cohort.id}`">Status</label>
              <select
                :id="`admin-cohort-edit-status-${cohort.id}`"
                v-model="cohortDraft.status"
                :disabled="updatingCohortId === cohort.id"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <button
                class="admin-workspace__button"
                type="submit"
                :disabled="updatingCohortId === cohort.id"
              >
                {{ updatingCohortId === cohort.id ? 'Saving…' : 'Save class' }}
              </button>
              <button
                class="admin-workspace__text-button"
                type="button"
                :disabled="updatingCohortId === cohort.id"
                @click="cancelEdit(finishCohortEdit, cohort.id)"
              >
                Cancel
              </button>
              <InlineConfirm
                v-if="confirmingDeactivation === cohort.id"
                :message="DEACTIVATE_CLASS"
                confirm-label="Yes, deactivate"
                @confirm="saveCohort(cohort)"
                @cancel="confirmingDeactivation = ''"
              />
            </form>
            <div v-else>
              <strong>{{ cohort.name }}</strong>
              <span
                >{{ cohort.institutionName }} · {{ cohort.term }} ·
                {{ statusLabel(cohort.status) }}</span
              >
            </div>
            <button
              v-if="cohortEditId !== cohort.id"
              class="admin-workspace__text-button"
              type="button"
              :data-edit-id="cohort.id"
              :aria-label="`Edit ${cohort.name}`"
              @click="editCohort(cohort)"
            >
              Edit
            </button>
          </li>
        </ul>
        <div class="admin-workspace__pagination" aria-label="Class pages">
          <button
            class="admin-workspace__text-button"
            type="button"
            :disabled="cohortPage <= 1 || loadingCohorts"
            @click="emit('cohort-page', cohortPage - 1)"
          >
            Previous
          </button>
          <span>Page {{ cohortPage }} of {{ Math.max(1, Math.ceil(cohortTotal / 20)) }}</span>
          <button
            class="admin-workspace__text-button"
            type="button"
            :disabled="cohortPage * 20 >= cohortTotal || loadingCohorts"
            @click="emit('cohort-page', cohortPage + 1)"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
