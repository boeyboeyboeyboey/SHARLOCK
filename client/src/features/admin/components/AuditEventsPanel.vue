<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { AdminApiError, listAuditEvents } from '../api.js'

const PAGE_SIZE = 25
const MAX_PAGE = 10_000
const MAX_RANGE_MS = 180 * 24 * 60 * 60 * 1000
const DELETE_EVENT = 'admin.account.delete'
const DEFAULT_WINDOW_MS = 90 * 24 * 60 * 60 * 1000
const EVENT_TYPES = [
  ['admin.bootstrap', 'Administrator setup'],
  ['admin.institution.create', 'Institution created'],
  ['admin.institution.update', 'Institution updated'],
  ['admin.cohort.create', 'Class created'],
  ['admin.cohort.update', 'Class updated'],
  ['admin.instructor.provision', 'Instructor account created'],
  ['admin.instructor.activation.issue', 'Instructor activation link issued'],
  ['admin.instructor.assignments.update', 'Instructor class assignments changed'],
  ['admin.administrator.provision', 'Administrator account created'],
  ['admin.administrator.activation.issue', 'Administrator activation link issued'],
  ['admin.administrator.cancel', 'Pending administrator cancelled'],
  ['admin.user.disable', 'Account disabled'],
  ['admin.user.enable', 'Account enabled'],
  [DELETE_EVENT, 'Account deleted'],
  ['account.instructor.activate', 'Instructor account activated'],
  ['account.administrator.activate', 'Administrator account activated'],
  ['cohort.code.issue', 'Class invitation issued'],
  ['cohort.code.revoke', 'Class invitation revoked'],
  ['cohort.membership.request', 'Student requested class access'],
  ['cohort.membership.approve', 'Student class access approved'],
  ['cohort.membership.decline', 'Student class request declined'],
  ['cohort.membership.remove', 'Student removed from class'],
  ['cohort.onboarding.complete', 'Student onboarding completed'],
  ['admin.student.recovery.issue', 'Administrator issued student recovery'],
  ['cohort.student.recovery.issue', 'Instructor issued student recovery'],
  ['account.student.password_reset', 'Student password reset'],
]

const fromFilter = ref('')
const toFilter = ref('')
const eventTypeFilter = ref('')
const appliedFilters = ref({
  eventType: '',
  from: '',
  to: '',
})
const events = ref([])
const page = ref(1)
const total = ref(0)
const loading = ref(false)
const hasLoaded = ref(false)
const errorMessage = ref('')
const accessExpired = ref(false)
const retryAvailable = ref(false)
let requestController
let disposed = false
let retryPage

function formatDate(value) {
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : 'Time unavailable'
}

function displayEventType(eventType) {
  return EVENT_TYPES.find(([value]) => value === eventType)?.[1] || eventType
}

const REASON_LABELS = {
  'wrong-name': 'Wrong name',
  duplicate: 'Duplicate account',
  'student-request': 'Student request',
  'left-school': 'Left school',
  other: 'Other',
}

function deleteSummary(event) {
  if (event.eventType !== DELETE_EVENT) return ''
  const parts = [
    event.accountOutcome === 'anonymised' ? 'Anonymised' : 'Deleted',
    REASON_LABELS[event.reasonCategory] || event.reasonCategory,
  ]
  return parts.filter(Boolean).join(' · ')
}

function toApiDate(value) {
  const date = new Date(value)
  if (!value || !Number.isFinite(date.getTime())) throw new Error('Enter a valid date range.')
  return date
}

function requestRange(filters) {
  const now = Date.now()
  const from = filters.from ? toApiDate(filters.from) : null
  const to = filters.to ? toApiDate(filters.to) : null
  // delete rows live 180 days, so default to just under that window when only they are shown
  const defaultWindow =
    filters.eventType === DELETE_EVENT ? MAX_RANGE_MS - 60_000 : DEFAULT_WINDOW_MS
  const fromTime = from?.getTime() ?? now - defaultWindow
  const toTime = to?.getTime() ?? now
  if (fromTime > toTime) throw new Error('The start date must be before the end date.')
  if (toTime > now) throw new Error('The end date cannot be in the future.')
  if (toTime - fromTime > MAX_RANGE_MS) {
    throw new Error('Choose a date range of 180 days or less.')
  }
  return {
    ...(from
      ? { from: from.toISOString() }
      : filters.eventType === DELETE_EVENT
        ? { from: new Date(fromTime).toISOString() }
        : {}),
    ...(to ? { to: to.toISOString() } : {}),
  }
}

async function loadEvents(
  nextPage = page.value,
  { filters = appliedFilters.value, clearResults = false } = {},
) {
  requestController?.abort()
  requestController = undefined
  loading.value = false

  if (clearResults) {
    events.value = []
    total.value = 0
    page.value = 1
    retryPage = undefined
  }

  let range
  try {
    range = requestRange(filters)
  } catch (error) {
    errorMessage.value = error.message
    accessExpired.value = false
    retryAvailable.value = false
    return
  }

  const controller = new AbortController()
  requestController = controller
  loading.value = true
  errorMessage.value = ''
  accessExpired.value = false
  retryAvailable.value = false

  try {
    const response = await listAuditEvents({
      ...range,
      ...(filters.eventType ? { eventType: filters.eventType } : {}),
      page: nextPage,
      limit: PAGE_SIZE,
      signal: controller.signal,
    })
    if (disposed || requestController !== controller || controller.signal.aborted) return
    events.value = Array.isArray(response?.events) ? response.events : []
    page.value =
      Number.isSafeInteger(response?.page) && response.page > 0 ? response.page : nextPage
    total.value = Number.isSafeInteger(response?.total) && response.total >= 0 ? response.total : 0
    hasLoaded.value = true
    retryPage = undefined
  } catch (error) {
    if (disposed || requestController !== controller || controller.signal.aborted) return
    accessExpired.value = error instanceof AdminApiError && [401, 403].includes(error.status)
    if (accessExpired.value) {
      events.value = []
      total.value = 0
      page.value = 1
    }
    errorMessage.value = accessExpired.value
      ? 'Your administrator session or audit access has expired. Sign in again or ask an administrator to check access.'
      : error instanceof AdminApiError
        ? error.message
        : 'Audit events could not be loaded. Try again.'
    retryPage = accessExpired.value ? undefined : nextPage
    retryAvailable.value = !accessExpired.value && error instanceof AdminApiError
  } finally {
    if (requestController === controller) loading.value = false
  }
}

function applyFilters() {
  const filters = {
    eventType: eventTypeFilter.value,
    from: fromFilter.value,
    to: toFilter.value,
  }
  appliedFilters.value = filters
  loadEvents(1, { filters, clearResults: true })
}

function retryEvents() {
  loadEvents(retryPage ?? page.value)
}

onMounted(() => loadEvents(1, { clearResults: true }))

onBeforeUnmount(() => {
  disposed = true
  requestController?.abort()
  requestController = undefined
})
</script>

<template>
  <section class="admin-workspace__panel" aria-labelledby="audit-events-title">
    <div class="admin-workspace__section-heading">
      <div>
        <p class="admin-workspace__eyebrow">ADMINISTRATION HISTORY</p>
        <h2 id="audit-events-title">Audit events</h2>
      </div>
      <button
        class="admin-workspace__text-button"
        type="button"
        :disabled="loading"
        @click="loadEvents(page)"
      >
        {{ loading ? 'Refreshing…' : 'Refresh events' }}
      </button>
    </div>

    <form class="admin-workspace__audit-filters" @submit.prevent="applyFilters">
      <label>
        Event type
        <select id="admin-audit-event-type" v-model="eventTypeFilter" :disabled="loading">
          <option value="">All event types</option>
          <option v-for="[value, label] in EVENT_TYPES" :key="value" :value="value">
            {{ label }}
          </option>
        </select>
      </label>
      <label>
        From (optional, your local time)
        <input
          id="admin-audit-from"
          v-model="fromFilter"
          type="datetime-local"
          :disabled="loading"
        />
      </label>
      <label>
        To (optional, your local time)
        <input id="admin-audit-to" v-model="toFilter" type="datetime-local" :disabled="loading" />
      </label>
      <button class="admin-workspace__button" type="submit" :disabled="loading">
        Apply filters
      </button>
      <small>
        Leave a date empty to use the current 90-day window. Times use your browser’s local time and
        are sent to the server in UTC.
      </small>
    </form>

    <p v-if="loading && !hasLoaded" class="admin-workspace__empty" role="status">
      Loading audit events…
    </p>
    <div v-if="errorMessage" class="admin-workspace__alert" role="alert">
      <p>{{ errorMessage }}</p>
      <button
        v-if="retryAvailable"
        class="admin-workspace__text-button"
        type="button"
        :disabled="loading"
        @click="retryEvents"
      >
        Try again
      </button>
    </div>
    <p v-else-if="!loading && hasLoaded && events.length === 0" class="admin-workspace__empty">
      No audit events match these filters.
    </p>

    <ul v-if="events.length" class="admin-workspace__audit-list" :aria-busy="loading">
      <li v-for="(event, index) in events" :key="`${event.requestId}-${index}`">
        <div class="admin-workspace__audit-summary">
          <strong>{{ displayEventType(event.eventType) }}</strong>
          <span class="admin-workspace__audit-outcome">{{ event.outcome }}</span>
          <time :datetime="event.occurredAt">{{ formatDate(event.occurredAt) }}</time>
        </div>
        <p v-if="deleteSummary(event)" class="admin-workspace__audit-note">
          {{ deleteSummary(event)
          }}<template v-if="event.reasonNote">: {{ event.reasonNote }}</template>
        </p>
        <details class="admin-workspace__audit-details">
          <summary>Show identifiers</summary>
          <dl>
            <dt>Actor type</dt>
            <dd>{{ event.actorKind }}</dd>
            <dt>Actor ID</dt>
            <dd>
              <code>{{ event.actorId || 'Not available' }}</code>
            </dd>
            <dt>Target ID</dt>
            <dd>
              <code>{{ event.targetId }}</code>
            </dd>
            <dt>Class ID</dt>
            <dd>
              <code>{{ event.scopeCohortId || 'Not available' }}</code>
            </dd>
            <dt>Request ID</dt>
            <dd>
              <code>{{ event.requestId }}</code>
            </dd>
          </dl>
        </details>
      </li>
    </ul>

    <nav v-if="events.length" class="admin-workspace__pagination" aria-label="Audit event pages">
      <button
        class="admin-workspace__text-button"
        type="button"
        :disabled="page <= 1 || loading"
        @click="loadEvents(page - 1)"
      >
        Previous
      </button>
      <span>Page {{ page }} of {{ Math.max(1, Math.ceil(total / PAGE_SIZE)) }}</span>
      <button
        class="admin-workspace__text-button"
        type="button"
        :disabled="page * PAGE_SIZE >= total || page >= MAX_PAGE || loading"
        @click="loadEvents(page + 1)"
      >
        Next
      </button>
    </nav>
  </section>
</template>
