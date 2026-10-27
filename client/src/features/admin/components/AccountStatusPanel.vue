<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { AdminApiError, listAdminUsers, updateAdminUser } from '../api.js'
import DeleteAccountDialog from './DeleteAccountDialog.vue'

const PAGE_SIZE = 25
const MAX_PAGE = 10_000
const props = defineProps({
  reissuing: { type: Object, default: () => ({}) },
  activationErrors: { type: Object, default: () => ({}) },
  accessError: { type: String, default: '' },
})
const emit = defineEmits(['reissue-activation'])

const users = ref([])
const page = ref(1)
const total = ref(0)
const roleFilter = ref('')
const statusFilter = ref('')
const appliedFilters = ref({ role: '', accountStatus: '' })
const loading = ref(false)
const loadError = ref('')
const rowErrors = ref(Object.create(null))
const pendingUsers = ref(Object.create(null))
const deleteTarget = ref(null)
const statusMessage = ref('')
let deleteTrigger = null
let listController
const mutationControllers = new Map()
let disposed = false

function clearForAccessLoss(message) {
  listController?.abort()
  loading.value = false
  users.value = []
  total.value = 0
  rowErrors.value = Object.create(null)
  loadError.value =
    message ||
    'Your administrator session or account access has expired. Sign in again or ask an administrator to check access.'
}

watch(
  () => props.accessError,
  (message) => {
    if (message) clearForAccessLoss(message)
  },
)

function safeMessage(error, fallback) {
  return error instanceof AdminApiError ? error.message : fallback
}

function isCurrentListRequest(controller) {
  return !disposed && listController === controller && !controller.signal.aborted
}

async function loadUsers(nextPage = page.value) {
  listController?.abort()
  const controller = new AbortController()
  listController = controller
  const requestedPage = Math.min(Math.max(1, nextPage), MAX_PAGE)
  if (requestedPage !== page.value) {
    users.value = []
    total.value = 0
  }
  page.value = requestedPage
  loading.value = true
  loadError.value = ''
  try {
    const response = await listAdminUsers({
      page: page.value,
      limit: PAGE_SIZE,
      ...(appliedFilters.value.role ? { role: appliedFilters.value.role } : {}),
      ...(appliedFilters.value.accountStatus
        ? { accountStatus: appliedFilters.value.accountStatus }
        : {}),
      signal: controller.signal,
    })
    if (!isCurrentListRequest(controller)) return
    users.value = Array.isArray(response?.users) ? response.users : []
    page.value =
      Number.isSafeInteger(response?.page) && response.page > 0 ? response.page : page.value
    total.value = Number.isSafeInteger(response?.total) && response.total >= 0 ? response.total : 0
    rowErrors.value = Object.create(null)
  } catch (error) {
    if (!isCurrentListRequest(controller)) return
    if (error instanceof AdminApiError && [401, 403].includes(error.status)) {
      users.value = []
      total.value = 0
    }
    loadError.value = safeMessage(error, 'Accounts could not be loaded. Try again.')
  } finally {
    if (listController === controller) loading.value = false
  }
}

function applyFilters() {
  const filtersChanged =
    roleFilter.value !== appliedFilters.value.role ||
    statusFilter.value !== appliedFilters.value.accountStatus
  appliedFilters.value = {
    role: roleFilter.value,
    accountStatus: statusFilter.value,
  }
  if (filtersChanged) {
    users.value = []
    total.value = 0
  }
  loadUsers(1)
}

function roleFor(user) {
  return Array.isArray(user.globalRoles) && user.globalRoles.length === 1 ? user.globalRoles[0] : ''
}

function roleLabel(user) {
  const role = roleFor(user)
  return role === 'student' ? 'Student' : role === 'instructor' ? 'Instructor' : 'Unavailable'
}

function accountStatusLabel(status) {
  return status === 'active' ? 'Active' : status === 'disabled' ? 'Disabled' : 'Unavailable'
}

function canManage(user) {
  return ['student', 'instructor'].includes(roleFor(user))
}

function actionLabel(user) {
  if (!canManage(user)) return ''
  if (!['active', 'disabled'].includes(user.accountStatus)) return ''
  if (roleFor(user) === 'instructor' && user.accountStatus === 'disabled') {
    return 'Reissue activation link'
  }
  return user.accountStatus === 'active' ? 'Disable account' : 'Enable account'
}

function canDelete(user) {
  return roleFor(user) === 'student' && ['active', 'disabled'].includes(user.accountStatus)
}

function openDelete(user, event) {
  deleteTrigger = event?.currentTarget || null
  statusMessage.value = ''
  deleteTarget.value = { id: user.id, username: user.username, revision: user.revision }
}

async function closeDelete() {
  deleteTarget.value = null
  await nextTick()
  if (deleteTrigger?.isConnected) deleteTrigger.focus()
  deleteTrigger = null
}

async function handleDeleted(outcome) {
  deleteTarget.value = null
  deleteTrigger = null
  statusMessage.value =
    outcome === 'anonymised' ? 'Account anonymised; saved results kept.' : 'Account deleted.'
  await loadUsers(page.value)
  if (users.value.length === 0 && page.value > 1) await loadUsers(page.value - 1)
}

function statusButtonClass(user) {
  if (actionLabel(user) === 'Disable account') return 'admin-workspace__text-button--danger'
  if (actionLabel(user) === 'Enable account') return 'admin-workspace__text-button--enable'
  return ''
}

function actionPending(user) {
  return Boolean(pendingUsers.value[user.id] || props.reissuing[user.id])
}

function rowError(user) {
  return rowErrors.value[user.id] || props.activationErrors[user.id] || ''
}

function confirmDisable(user) {
  return window.confirm(
    `Disable ${user.username}? This signs them out and revokes unused activation and recovery links. Their class memberships and instructor assignments remain.`,
  )
}

async function changeStatus(user) {
  if (!canManage(user) || pendingUsers.value[user.id]) return
  const role = roleFor(user)
  if (role === 'instructor' && user.accountStatus === 'disabled') {
    emit('reissue-activation', user.id)
    return
  }
  const accountStatus = user.accountStatus === 'active' ? 'disabled' : 'active'
  if (accountStatus === 'disabled' && !confirmDisable(user)) return

  const controller = new AbortController()
  mutationControllers.set(user.id, controller)
  pendingUsers.value = { ...pendingUsers.value, [user.id]: true }
  rowErrors.value = { ...rowErrors.value, [user.id]: '' }
  try {
    await updateAdminUser(
      user.id,
      { accountStatus, expectedRevision: user.revision },
      controller.signal,
    )
    if (disposed || controller.signal.aborted || mutationControllers.get(user.id) !== controller)
      return
    const priorPage = page.value
    await loadUsers(priorPage)
  } catch (error) {
    if (disposed || controller.signal.aborted || mutationControllers.get(user.id) !== controller)
      return
    if (error instanceof AdminApiError && [401, 403].includes(error.status)) {
      clearForAccessLoss(
        safeMessage(
          error,
          'Your administrator session or account access has expired. Sign in again or ask an administrator to check access.',
        ),
      )
      return
    }
    if (error instanceof AdminApiError && error.code === 'ADMIN_STALE_ACCOUNT') {
      await loadUsers(page.value)
    }
    rowErrors.value = {
      ...rowErrors.value,
      [user.id]: safeMessage(error, 'The account status could not be changed. Try again.'),
    }
  } finally {
    if (mutationControllers.get(user.id) === controller) {
      mutationControllers.delete(user.id)
      pendingUsers.value = { ...pendingUsers.value, [user.id]: false }
    }
  }
}

onMounted(() => loadUsers(1))

onBeforeUnmount(() => {
  disposed = true
  listController?.abort()
  for (const controller of mutationControllers.values()) controller.abort()
  mutationControllers.clear()
})
</script>

<template>
  <section class="admin-workspace__panel" aria-labelledby="account-controls-title">
    <div class="admin-workspace__section-heading">
      <div>
        <p class="admin-workspace__eyebrow">ACCOUNT ACCESS</p>
        <h2 id="account-controls-title">Student and instructor accounts</h2>
      </div>
      <button
        class="admin-workspace__text-button"
        type="button"
        :disabled="loading"
        @click="loadUsers(page)"
      >
        {{ loading ? 'Refreshing…' : 'Refresh accounts' }}
      </button>
    </div>

    <form class="admin-workspace__account-filters" @submit.prevent="applyFilters">
      <label>
        Role
        <select v-model="roleFilter" :disabled="loading">
          <option value="">All accounts</option>
          <option value="student">Students</option>
          <option value="instructor">Instructors</option>
        </select>
      </label>
      <label>
        Status
        <select v-model="statusFilter" :disabled="loading">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
      </label>
      <button class="admin-workspace__button" type="submit" :disabled="loading">
        Apply filters
      </button>
    </form>

    <p v-if="statusMessage" class="admin-workspace__empty" role="status">{{ statusMessage }}</p>
    <p v-if="loading && users.length === 0" class="admin-workspace__empty" role="status">
      Loading accounts…
    </p>
    <div v-if="loadError" class="admin-workspace__alert" role="alert">
      <p>{{ loadError }}</p>
      <button class="admin-workspace__text-button" type="button" @click="loadUsers(page)">
        Try again
      </button>
    </div>
    <p v-else-if="!loading && users.length === 0" class="admin-workspace__empty">
      No accounts match these filters.
    </p>

    <div v-if="users.length" class="admin-workspace__account-table-wrap">
      <table class="admin-workspace__account-table" :aria-busy="loading">
        <caption class="visually-hidden">
          Student and instructor account status controls
        </caption>
        <thead>
          <tr>
            <th scope="col">Username</th>
            <th scope="col">Role</th>
            <th scope="col">Status</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.id">
            <td>{{ user.username }}</td>
            <td>{{ roleLabel(user) }}</td>
            <td>{{ accountStatusLabel(user.accountStatus) }}</td>
            <td>
              <button
                v-if="actionLabel(user)"
                class="admin-workspace__text-button"
                :class="statusButtonClass(user)"
                type="button"
                :disabled="loading || actionPending(user)"
                @click="changeStatus(user)"
              >
                {{
                  actionPending(user)
                    ? pendingUsers[user.id]
                      ? 'Saving…'
                      : 'Preparing link…'
                    : actionLabel(user)
                }}
              </button>
              <button
                v-if="canDelete(user)"
                class="admin-workspace__text-button admin-workspace__text-button--danger"
                type="button"
                :disabled="loading || actionPending(user)"
                :aria-label="`Delete account ${user.username}`"
                @click="openDelete(user, $event)"
              >
                Delete account
              </button>
              <p v-if="rowError(user)" class="admin-workspace__alert" role="alert">
                {{ rowError(user) }}
              </p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <nav v-if="total > PAGE_SIZE" class="admin-workspace__pagination" aria-label="Account pages">
      <button
        class="admin-workspace__text-button"
        type="button"
        :disabled="page <= 1 || loading"
        @click="loadUsers(page - 1)"
      >
        Previous accounts
      </button>
      <span>Page {{ page }} of {{ Math.max(1, Math.ceil(total / PAGE_SIZE)) }}</span>
      <button
        class="admin-workspace__text-button"
        type="button"
        :disabled="page * PAGE_SIZE >= total || loading"
        @click="loadUsers(page + 1)"
      >
        Next accounts
      </button>
    </nav>
    <DeleteAccountDialog
      v-if="deleteTarget"
      :account="deleteTarget"
      @deleted="handleDeleted"
      @close="closeDelete"
    />
  </section>
</template>
