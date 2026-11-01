<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { avatarFor } from '../../auth/avatars.js'
import ActivationLinkDialog from '../components/ActivationLinkDialog.vue'
import AccountStatusPanel from '../components/AccountStatusPanel.vue'
import AssignmentEditor from '../components/AssignmentEditor.vue'
import AuditEventsPanel from '../components/AuditEventsPanel.vue'
import InstitutionCohortForm from '../components/InstitutionCohortForm.vue'
import InstructorProvisionForm from '../components/InstructorProvisionForm.vue'
import InlineConfirm from '../../cohorts/components/InlineConfirm.vue'
import PendingAdministratorsPanel from '../components/PendingAdministratorsPanel.vue'
import RecoveryIssueForm from '../../recovery/components/RecoveryIssueForm.vue'
import RecoveryLinkDialog from '../../recovery/components/RecoveryLinkDialog.vue'
import RecoveryStudentLookup from '../../recovery/components/RecoveryStudentLookup.vue'
import {
  AdminApiError,
  cancelPendingAdministrator,
  cancelPendingInstructor,
  createCohort,
  createInstitution,
  createAdministrator,
  createInstructor,
  listCohorts,
  listInstitutions,
  listInstructors,
  listPendingAdministrators,
  reissueAdministratorActivation,
  reissueInstructorActivation,
  updateCohort,
  updateInstitution,
  updateInstructorAssignments,
} from '../api.js'
import { issueAdminRecovery, lookupStudent, safeRecoveryError } from '../../recovery/api.js'
import '../admin.css'
import '../../auth/auth.css'
import '../../recovery/recovery.css'

const TABS = [
  { id: 'institutions', label: 'Institutions & classes' },
  { id: 'instructors', label: 'Instructors' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'audit', label: 'Audit log' },
]
const route = useRoute()
const router = useRouter()
const tablist = ref(null)
const tab = computed(() => {
  const requested = String(route.query.tab || '')
  return TABS.some((item) => item.id === requested) ? requested : TABS[0].id
})

function selectTab(id) {
  router.replace({ query: { ...route.query, tab: id } })
}

function onTabKey(event) {
  const steps = { ArrowRight: 1, ArrowLeft: -1 }
  if (!(event.key in steps) && event.key !== 'Home' && event.key !== 'End') return
  event.preventDefault()
  const index = TABS.findIndex((item) => item.id === tab.value)
  const last = TABS.length - 1
  let next = (index + steps[event.key] + TABS.length) % TABS.length
  if (event.key === 'Home') next = 0
  if (event.key === 'End') next = last
  selectTab(TABS[next].id)
  tablist.value?.querySelectorAll('[role="tab"]')[next]?.focus()
}

const PAGE_SIZE = 20
const ASSIGNMENT_PAGE_SIZE = 50
const institutions = ref([])
const cohorts = ref([])
const assignmentCohorts = ref([])
const instructors = ref([])
const institutionPage = ref(1)
const cohortPage = ref(1)
const assignmentCohortPage = ref(1)
const instructorPage = ref(1)
const institutionTotal = ref(0)
const cohortTotal = ref(0)
const assignmentCohortTotal = ref(0)
const instructorTotal = ref(0)
const selectedInstitutionId = ref('')
const loadingInstitutions = ref(false)
const loadingCohorts = ref(false)
const loadingAssignmentCohorts = ref(false)
const loadingInstructors = ref(false)
const pendingInstitution = ref(false)
const pendingCohort = ref(false)
const updatingInstitutionId = ref('')
const updatingCohortId = ref('')
const pendingInstructor = ref(false)
const pendingAssignments = ref(Object.create(null))
const reissuing = ref(Object.create(null))
const activationErrors = ref(Object.create(null))
const activationAccessError = ref('')
const institutionError = ref('')
const instructorError = ref('')
const assignmentErrors = ref(Object.create(null))
// each list reports its own load failure, so one loading fine cannot erase another's error
const loadErrors = ref(Object.create(null))
const notice = computed(() => Object.values(loadErrors.value).find(Boolean) || '')
const statusNotice = ref('')
const institutionFieldErrors = ref({ form: '', fields: {} })
const instructorFieldErrors = ref({})
const administratorFieldErrors = ref({})
const openAssignmentId = ref('')
const confirmingCancelInstructorId = ref('')
const pendingCancelInstructor = ref(false)
const instructorActionError = ref('')
const instructorsHeading = ref(null)
const pendingAdministratorsPanel = ref(null)
const accountPanel = ref(null)
const auditPanel = ref(null)
let activationOpener = null
const activationLink = ref(null)
const recoveryMatch = ref(undefined)
const recoveryStudent = ref(null)
const recoveryLink = ref(null)
const recoveryLookupPending = ref(false)
const recoveryIssuePending = ref(false)
const recoveryLookupError = ref('')
const recoveryIssueError = ref('')
const recoveryIssueForm = ref(null)
const institutionForm = ref(null)
const instructorForm = ref(null)
const administratorForm = ref(null)
const pendingAdministrator = ref(false)
const administratorError = ref('')
const pendingAdministrators = ref([])
const loadingPendingAdministrators = ref(false)
const pendingAdministratorsError = ref('')
const pendingAdministratorAction = ref(false)
const pendingAdministratorActionError = ref('')
const controllers = new Map()
let disposed = false

function instructorStatusLabel(instructor) {
  if (instructor.pendingActivation) return 'Pending activation'
  return instructor.accountStatus === 'active' ? 'Active' : 'Disabled'
}

function setLoadError(area, message) {
  loadErrors.value = { ...loadErrors.value, [area]: message }
}

function fieldErrorsOf(error) {
  return error instanceof AdminApiError ? error.fieldErrors || {} : {}
}

function showActivationLink(link, account) {
  activationLink.value = { ...link, username: account?.username, email: account?.email }
}

function rememberActivationOpener() {
  activationOpener = document.activeElement
}

// the opening button was disabled while its request ran, so focus goes back there by hand
async function closeActivationLink() {
  activationLink.value = null
  await nextTick()
  const target =
    activationOpener?.isConnected && !activationOpener.disabled
      ? activationOpener
      : instructorsHeading.value
  target?.focus()
  activationOpener = null
}

function startRequest(key) {
  controllers.get(key)?.abort()
  const controller = new AbortController()
  controllers.set(key, controller)
  return controller
}

function isCurrentRequest(key, controller) {
  return !disposed && controllers.get(key) === controller && !controller.signal.aborted
}

function safeMessage(error, fallback) {
  return error instanceof AdminApiError ? error.message : fallback
}

function rowsFor(response, key) {
  return Array.isArray(response?.[key]) ? response[key] : []
}

function totalFor(response) {
  return Number.isSafeInteger(response?.total) && response.total >= 0 ? response.total : 0
}

async function loadInstitutions(page = institutionPage.value) {
  const controller = startRequest('institutions')
  institutionPage.value = page
  loadingInstitutions.value = true
  try {
    const response = await listInstitutions({ page, limit: PAGE_SIZE, signal: controller.signal })
    if (!isCurrentRequest('institutions', controller)) return
    institutions.value = rowsFor(response, 'institutions')
    institutionTotal.value = totalFor(response)
    setLoadError('institutions', '')
    if (!selectedInstitutionId.value) selectedInstitutionId.value = institutions.value[0]?.id || ''
  } catch (error) {
    if (!isCurrentRequest('institutions', controller)) return
    setLoadError(
      'institutions',
      safeMessage(error, 'Institutions could not be loaded. Refresh and try again.'),
    )
  } finally {
    if (controllers.get('institutions') === controller) loadingInstitutions.value = false
  }
}

async function loadCohorts(page = cohortPage.value, institutionId = selectedInstitutionId.value) {
  const controller = startRequest('cohorts')
  cohortPage.value = page
  loadingCohorts.value = true
  try {
    const response = await listCohorts({
      page,
      limit: PAGE_SIZE,
      ...(institutionId ? { institutionId } : {}),
      signal: controller.signal,
    })
    if (!isCurrentRequest('cohorts', controller)) return
    cohorts.value = rowsFor(response, 'cohorts')
    cohortTotal.value = totalFor(response)
    setLoadError('cohorts', '')
  } catch (error) {
    if (!isCurrentRequest('cohorts', controller)) return
    setLoadError(
      'cohorts',
      safeMessage(error, 'Classes could not be loaded. Refresh and try again.'),
    )
  } finally {
    if (controllers.get('cohorts') === controller) loadingCohorts.value = false
  }
}

async function loadAssignmentCohorts(page = assignmentCohortPage.value) {
  const controller = startRequest('assignment-cohorts')
  assignmentCohortPage.value = page
  loadingAssignmentCohorts.value = true
  try {
    const response = await listCohorts({
      page,
      limit: ASSIGNMENT_PAGE_SIZE,
      signal: controller.signal,
    })
    if (!isCurrentRequest('assignment-cohorts', controller)) return
    assignmentCohorts.value = rowsFor(response, 'cohorts')
    assignmentCohortTotal.value = totalFor(response)
    setLoadError('assignmentCohorts', '')
  } catch (error) {
    if (!isCurrentRequest('assignment-cohorts', controller)) return
    setLoadError(
      'assignmentCohorts',
      safeMessage(error, 'Available classes could not be loaded. Refresh and try again.'),
    )
  } finally {
    if (controllers.get('assignment-cohorts') === controller) {
      loadingAssignmentCohorts.value = false
    }
  }
}

async function loadInstructors(page = instructorPage.value) {
  const controller = startRequest('instructors')
  instructorPage.value = page
  loadingInstructors.value = true
  try {
    const response = await listInstructors({ page, limit: PAGE_SIZE, signal: controller.signal })
    if (!isCurrentRequest('instructors', controller)) return
    instructors.value = rowsFor(response, 'instructors')
    instructorTotal.value = totalFor(response)
    setLoadError('instructors', '')
    assignmentErrors.value = Object.create(null)
  } catch (error) {
    if (!isCurrentRequest('instructors', controller)) return
    setLoadError(
      'instructors',
      safeMessage(error, 'Instructors could not be loaded. Refresh and try again.'),
    )
  } finally {
    if (controllers.get('instructors') === controller) loadingInstructors.value = false
  }
}

async function loadPendingAdministrators() {
  const controller = startRequest('pending-administrators')
  loadingPendingAdministrators.value = true
  try {
    const response = await listPendingAdministrators({
      page: 1,
      limit: PAGE_SIZE,
      signal: controller.signal,
    })
    if (!isCurrentRequest('pending-administrators', controller)) return
    pendingAdministrators.value = rowsFor(response, 'administrators')
    pendingAdministratorsError.value = ''
  } catch (error) {
    if (!isCurrentRequest('pending-administrators', controller)) return
    pendingAdministratorsError.value = safeMessage(
      error,
      'Pending administrators could not be loaded. Refresh and try again.',
    )
  } finally {
    if (controllers.get('pending-administrators') === controller) {
      loadingPendingAdministrators.value = false
    }
  }
}

async function createInstitutionEntry(input) {
  if (pendingInstitution.value) return
  institutionError.value = ''
  statusNotice.value = ''
  institutionFieldErrors.value = { form: '', fields: {} }
  pendingInstitution.value = true
  const controller = startRequest('create-institution')
  try {
    const created = await createInstitution(input, controller.signal)
    if (disposed) return
    institutionForm.value?.resetInstitutionForm()
    selectedInstitutionId.value = ''
    await loadInstitutions(1)
    if (created?.id && institutions.value.some(({ id }) => id === created.id)) {
      selectedInstitutionId.value = created.id
    }
    statusNotice.value = 'Institution created.'
  } catch (error) {
    if (!disposed && !controller.signal.aborted) {
      institutionFieldErrors.value = { form: 'institution', fields: fieldErrorsOf(error) }
      institutionError.value = safeMessage(
        error,
        'The institution could not be created. Review and try again.',
      )
    }
  } finally {
    if (controllers.get('create-institution') === controller) pendingInstitution.value = false
  }
}

async function createCohortEntry(input) {
  if (pendingCohort.value || !input.institutionId) return
  institutionError.value = ''
  statusNotice.value = ''
  institutionFieldErrors.value = { form: '', fields: {} }
  pendingCohort.value = true
  const controller = startRequest('create-cohort')
  try {
    await createCohort(input, controller.signal)
    if (disposed) return
    institutionForm.value?.resetCohortForm()
    await Promise.all([loadCohorts(1), loadAssignmentCohorts(1)])
    statusNotice.value = 'Class created.'
  } catch (error) {
    if (!disposed && !controller.signal.aborted) {
      institutionFieldErrors.value = { form: 'cohort', fields: fieldErrorsOf(error) }
      institutionError.value = safeMessage(
        error,
        'The class could not be created. Review and try again.',
      )
    }
  } finally {
    if (controllers.get('create-cohort') === controller) pendingCohort.value = false
  }
}

async function updateInstitutionEntry({ id, name, status, expectedRevision }) {
  if (updatingInstitutionId.value) return
  institutionError.value = ''
  statusNotice.value = ''
  institutionFieldErrors.value = { form: '', fields: {} }
  updatingInstitutionId.value = id
  const controller = startRequest(`update-institution-${id}`)
  try {
    await updateInstitution(id, { name, status, expectedRevision }, controller.signal)
    if (disposed) return
    institutionForm.value?.finishInstitutionEdit()
    await Promise.all([
      loadInstitutions(institutionPage.value),
      loadCohorts(cohortPage.value),
      loadAssignmentCohorts(1),
      loadInstructors(instructorPage.value),
    ])
    statusNotice.value =
      status === 'inactive' ? 'Institution set to inactive.' : 'Institution saved.'
    await nextTick()
    institutionForm.value?.focusInstitutions()
  } catch (error) {
    if (!disposed && !controller.signal.aborted) {
      institutionFieldErrors.value = { form: 'institution-edit', fields: fieldErrorsOf(error) }
      institutionError.value = safeMessage(
        error,
        'The institution could not be updated. Review and try again.',
      )
      if (error instanceof AdminApiError && error.code === 'ADMIN_STALE_INSTITUTION') {
        institutionForm.value?.finishInstitutionEdit()
        await Promise.all([
          loadInstitutions(institutionPage.value),
          loadCohorts(cohortPage.value),
          loadAssignmentCohorts(1),
        ])
      }
    }
  } finally {
    if (updatingInstitutionId.value === id) updatingInstitutionId.value = ''
  }
}

async function updateCohortEntry({ id, name, term, status, expectedRevision }) {
  if (updatingCohortId.value) return
  institutionError.value = ''
  statusNotice.value = ''
  institutionFieldErrors.value = { form: '', fields: {} }
  updatingCohortId.value = id
  const controller = startRequest(`update-cohort-${id}`)
  try {
    await updateCohort(id, { name, term, status, expectedRevision }, controller.signal)
    if (disposed) return
    institutionForm.value?.finishCohortEdit()
    await Promise.all([
      loadCohorts(cohortPage.value),
      loadAssignmentCohorts(1),
      loadInstructors(instructorPage.value),
    ])
    statusNotice.value = status === 'inactive' ? 'Class set to inactive.' : 'Class saved.'
    await nextTick()
    institutionForm.value?.focusCohorts()
  } catch (error) {
    if (!disposed && !controller.signal.aborted) {
      institutionFieldErrors.value = { form: 'cohort-edit', fields: fieldErrorsOf(error) }
      institutionError.value = safeMessage(
        error,
        'The class could not be updated. Review and try again.',
      )
      if (error instanceof AdminApiError && error.code === 'ADMIN_STALE_COHORT') {
        institutionForm.value?.finishCohortEdit()
        await Promise.all([
          loadCohorts(cohortPage.value),
          loadAssignmentCohorts(1),
          loadInstructors(instructorPage.value),
        ])
      }
    }
  } finally {
    if (updatingCohortId.value === id) updatingCohortId.value = ''
  }
}

async function provisionInstructor(input) {
  if (pendingInstructor.value) return
  instructorError.value = ''
  instructorFieldErrors.value = {}
  statusNotice.value = ''
  rememberActivationOpener()
  pendingInstructor.value = true
  const controller = startRequest('create-instructor')
  try {
    const result = await createInstructor(input, controller.signal)
    if (disposed) return
    showActivationLink(result, input)
    instructorForm.value?.resetForm()
    statusNotice.value = 'Instructor created.'
    await loadInstructors(1)
  } catch (error) {
    if (!disposed && !controller.signal.aborted) {
      // the account exists although its link was lost, so the list and form must say so
      if (error instanceof AdminApiError && error.code === 'ADMIN_LINK_NOT_SHOWN') {
        instructorForm.value?.resetForm()
        await loadInstructors(1)
      }
      instructorFieldErrors.value = fieldErrorsOf(error)
      instructorError.value = safeMessage(
        error,
        'The instructor could not be created. Review and try again.',
      )
    }
  } finally {
    if (controllers.get('create-instructor') === controller) pendingInstructor.value = false
  }
}

async function provisionAdministrator(input) {
  if (pendingAdministrator.value) return
  administratorError.value = ''
  administratorFieldErrors.value = {}
  statusNotice.value = ''
  rememberActivationOpener()
  pendingAdministrator.value = true
  const controller = startRequest('create-administrator')
  try {
    const result = await createAdministrator(input, controller.signal)
    if (disposed) return
    showActivationLink(result, input)
    administratorForm.value?.resetForm()
    statusNotice.value = 'Administrator created.'
    await loadPendingAdministrators()
  } catch (error) {
    if (!disposed && !controller.signal.aborted) {
      if (error instanceof AdminApiError && error.code === 'ADMIN_LINK_NOT_SHOWN') {
        administratorForm.value?.resetForm()
        await loadPendingAdministrators()
      }
      administratorFieldErrors.value = fieldErrorsOf(error)
      administratorError.value = safeMessage(
        error,
        'The administrator could not be created. Review and try again.',
      )
    }
  } finally {
    if (controllers.get('create-administrator') === controller) pendingAdministrator.value = false
  }
}

async function lookupRecoveryStudent({ email }) {
  controllers.get('recovery-issue')?.abort()
  recoveryLink.value = null
  recoveryStudent.value = null
  recoveryIssueError.value = ''
  recoveryLookupError.value = ''
  recoveryMatch.value = undefined
  const controller = startRequest('recovery-lookup')
  recoveryLookupPending.value = true
  try {
    const result = await lookupStudent(email, controller.signal)
    if (!isCurrentRequest('recovery-lookup', controller)) return
    recoveryMatch.value = result.student
  } catch (error) {
    if (isCurrentRequest('recovery-lookup', controller)) {
      recoveryLookupError.value = safeRecoveryError(error).message
    }
  } finally {
    if (controllers.get('recovery-lookup') === controller) recoveryLookupPending.value = false
  }
}

function selectRecoveryStudent(student) {
  controllers.get('recovery-issue')?.abort()
  recoveryLink.value = null
  recoveryStudent.value = student
  recoveryIssueError.value = ''
}

async function issueRecoveryLink({ identityVerified }) {
  if (!identityVerified || !recoveryStudent.value || recoveryIssuePending.value) return
  const selectedId = recoveryStudent.value.id
  recoveryIssueError.value = ''
  const controller = startRequest('recovery-issue')
  recoveryIssuePending.value = true
  try {
    const link = await issueAdminRecovery(selectedId, controller.signal)
    if (!isCurrentRequest('recovery-issue', controller) || recoveryStudent.value?.id !== selectedId)
      return
    recoveryIssuePending.value = false
    await nextTick()
    if (!isCurrentRequest('recovery-issue', controller) || recoveryStudent.value?.id !== selectedId)
      return
    recoveryIssueForm.value?.focusSubmitButton()
    recoveryLink.value = {
      ...link,
      username: recoveryStudent.value.username,
      email: recoveryStudent.value.email,
    }
  } catch (error) {
    if (isCurrentRequest('recovery-issue', controller)) {
      recoveryIssueError.value = safeRecoveryError(error).message
    }
  } finally {
    if (controllers.get('recovery-issue') === controller) recoveryIssuePending.value = false
  }
}

function closeRecoveryLink() {
  recoveryLink.value = null
}

async function reissueActivation(instructorId, account) {
  if (reissuing.value[instructorId]) return
  activationErrors.value = { ...activationErrors.value, [instructorId]: '' }
  activationAccessError.value = ''
  statusNotice.value = ''
  rememberActivationOpener()
  reissuing.value = { ...reissuing.value, [instructorId]: true }
  const controller = startRequest(`reissue-${instructorId}`)
  try {
    const result = await reissueInstructorActivation(instructorId, controller.signal)
    if (disposed) return
    showActivationLink(result, account)
    await loadInstructors(instructorPage.value)
  } catch (error) {
    if (!disposed && !controller.signal.aborted) {
      if (error instanceof AdminApiError && [401, 403].includes(error.status)) {
        activationAccessError.value =
          'Your administrator access has changed. Ask an administrator to check it.'
      }
      activationErrors.value = {
        ...activationErrors.value,
        [instructorId]: safeMessage(
          error,
          'A new activation link could not be prepared. Try again later.',
        ),
      }
    }
  } finally {
    if (controllers.get(`reissue-${instructorId}`) === controller) {
      reissuing.value = { ...reissuing.value, [instructorId]: false }
    }
  }
}

async function reissuePendingAdministrator(item) {
  const userId = item.id
  // one action at a time, so a second reissue cannot revoke the link being shown
  if (loadingPendingAdministrators.value || pendingAdministratorAction.value) return
  statusNotice.value = ''
  rememberActivationOpener()
  pendingAdministratorAction.value = true
  pendingAdministratorActionError.value = ''
  const controller = startRequest(`reissue-admin-${userId}`)
  try {
    const result = await reissueAdministratorActivation(userId, controller.signal)
    if (disposed) return
    showActivationLink(result, item)
  } catch (error) {
    if (!disposed && !controller.signal.aborted) {
      pendingAdministratorActionError.value =
        error instanceof AdminApiError && error.status === 404
          ? 'This administrator is no longer pending'
          : safeMessage(error, 'A new activation link could not be prepared. Try again later.')
    }
  } finally {
    pendingAdministratorAction.value = false
  }
  if (disposed) return
  await loadPendingAdministrators()
}

async function cancelPending(item) {
  if (loadingPendingAdministrators.value || pendingAdministratorAction.value) return
  statusNotice.value = ''
  pendingAdministratorAction.value = true
  pendingAdministratorActionError.value = ''
  const controller = startRequest(`cancel-admin-${item.id}`)
  try {
    await cancelPendingAdministrator(item.id, controller.signal)
    statusNotice.value = 'Pending administrator cancelled.'
  } catch (error) {
    if (!disposed && !controller.signal.aborted) {
      pendingAdministratorActionError.value =
        error instanceof AdminApiError && error.status === 404
          ? 'This administrator is no longer pending'
          : safeMessage(error, 'The administrator could not be cancelled. Try again later.')
    }
  } finally {
    pendingAdministratorAction.value = false
  }
  if (disposed) return
  await loadPendingAdministrators()
  await nextTick()
  pendingAdministratorsPanel.value?.focusHeading()
}

async function cancelInstructor(instructor) {
  if (pendingCancelInstructor.value) return
  confirmingCancelInstructorId.value = ''
  instructorActionError.value = ''
  statusNotice.value = ''
  pendingCancelInstructor.value = true
  const controller = startRequest(`cancel-instructor-${instructor.id}`)
  try {
    await cancelPendingInstructor(instructor.id, controller.signal)
    statusNotice.value = 'Pending instructor cancelled.'
  } catch (error) {
    if (!disposed && !controller.signal.aborted) {
      instructorActionError.value =
        error instanceof AdminApiError && error.status === 404
          ? 'This instructor is no longer pending'
          : safeMessage(error, 'The instructor could not be cancelled. Try again later.')
    }
  } finally {
    pendingCancelInstructor.value = false
  }
  if (disposed) return
  await loadInstructors(instructorPage.value)
  if (instructors.value.length === 0 && instructorPage.value > 1) {
    await loadInstructors(instructorPage.value - 1)
  }
  await nextTick()
  instructorsHeading.value?.focus()
}

function toggleAssignments(instructorId) {
  openAssignmentId.value = openAssignmentId.value === instructorId ? '' : instructorId
}

async function saveAssignments({ instructorId, input }) {
  if (pendingAssignments.value[instructorId]) return
  statusNotice.value = ''
  assignmentErrors.value = { ...assignmentErrors.value, [instructorId]: '' }
  pendingAssignments.value = { ...pendingAssignments.value, [instructorId]: true }
  const controller = startRequest(`assignments-${instructorId}`)
  try {
    await updateInstructorAssignments(instructorId, input, controller.signal)
    if (disposed) return
    await loadInstructors(instructorPage.value)
    statusNotice.value = 'Assignments saved.'
    openAssignmentId.value = ''
  } catch (error) {
    if (disposed || controller.signal.aborted) return
    const message =
      error instanceof AdminApiError && error.code === 'ADMIN_STALE_ASSIGNMENTS'
        ? 'Assignments changed elsewhere. Your draft is preserved. Reload before trying again.'
        : safeMessage(error, 'Assignments could not be saved. Review and try again.')
    assignmentErrors.value = { ...assignmentErrors.value, [instructorId]: message }
  } finally {
    if (controllers.get(`assignments-${instructorId}`) === controller) {
      pendingAssignments.value = { ...pendingAssignments.value, [instructorId]: false }
    }
  }
}

async function reloadAssignments() {
  await loadInstructors(instructorPage.value)
}

watch(selectedInstitutionId, (institutionId) => {
  cohortPage.value = 1
  assignmentCohortPage.value = 1
  loadCohorts(1, institutionId)
  loadAssignmentCohorts(1)
})

// a change made on one tab is out of date on the next, so each tab reads again when opened
watch(tab, (next) => {
  if (next === 'institutions') {
    loadInstitutions()
    loadCohorts()
  } else if (next === 'instructors') {
    loadInstructors()
    loadPendingAdministrators()
    loadAssignmentCohorts()
  } else if (next === 'accounts') {
    accountPanel.value?.refresh()
  } else {
    auditPanel.value?.refresh()
  }
})

onMounted(() => {
  loadInstitutions(1)
  loadInstructors(1)
  loadPendingAdministrators()
})

onBeforeUnmount(() => {
  disposed = true
  for (const controller of controllers.values()) controller.abort()
  controllers.clear()
  activationLink.value = null
  recoveryLink.value = null
  recoveryStudent.value = null
})
</script>

<template>
  <div class="admin-workspace">
    <header class="admin-workspace__hero">
      <div class="admin-workspace__hero-icon" aria-hidden="true"><span>HQ</span></div>
      <div>
        <h1>Admin workspace</h1>
      </div>
    </header>

    <p v-if="notice" class="admin-workspace__alert admin-workspace__feedback" role="alert">
      {{ notice }}
    </p>
    <p v-if="statusNotice" class="admin-workspace__status-line" role="status">{{ statusNotice }}</p>

    <div
      ref="tablist"
      class="admin-workspace__tabs"
      role="tablist"
      aria-label="Admin sections"
      @keydown="onTabKey"
    >
      <button
        v-for="item in TABS"
        :id="`admin-tab-${item.id}`"
        :key="item.id"
        type="button"
        role="tab"
        :aria-selected="tab === item.id"
        :aria-controls="`admin-panel-${item.id}`"
        :tabindex="tab === item.id ? 0 : -1"
        @click="selectTab(item.id)"
      >
        {{ item.label }}
      </button>
    </div>

    <div
      v-show="tab === 'institutions'"
      id="admin-panel-institutions"
      class="admin-workspace__tabpanel"
      role="tabpanel"
      aria-labelledby="admin-tab-institutions"
    >
      <InstitutionCohortForm
        ref="institutionForm"
        :institutions="institutions"
        :cohorts="cohorts"
        :institution-page="institutionPage"
        :institution-total="institutionTotal"
        :cohort-page="cohortPage"
        :cohort-total="cohortTotal"
        :selected-institution-id="selectedInstitutionId"
        :loading-institutions="loadingInstitutions"
        :loading-cohorts="loadingCohorts"
        :pending-institution="pendingInstitution"
        :pending-cohort="pendingCohort"
        :updating-institution-id="updatingInstitutionId"
        :updating-cohort-id="updatingCohortId"
        :error="institutionError"
        :field-errors="institutionFieldErrors"
        @create-institution="createInstitutionEntry"
        @create-cohort="createCohortEntry"
        @update-institution="updateInstitutionEntry"
        @update-cohort="updateCohortEntry"
        @select-institution="selectedInstitutionId = $event"
        @institution-page="loadInstitutions"
        @cohort-page="loadCohorts"
      />
    </div>

    <div
      v-show="tab === 'instructors'"
      id="admin-panel-instructors"
      class="admin-workspace__tabpanel"
      role="tabpanel"
      aria-labelledby="admin-tab-instructors"
    >
      <PendingAdministratorsPanel
        ref="pendingAdministratorsPanel"
        :items="pendingAdministrators"
        :loading="loadingPendingAdministrators || pendingAdministratorAction"
        :error="pendingAdministratorActionError || pendingAdministratorsError"
        @reissue="reissuePendingAdministrator"
        @cancel="cancelPending"
      />

      <section class="admin-workspace__panel" aria-labelledby="instructors-title">
        <div class="admin-workspace__section-heading">
          <div>
            <h2 id="instructors-title" ref="instructorsHeading" tabindex="-1">Instructors</h2>
          </div>
          <button
            class="admin-workspace__text-button"
            type="button"
            :disabled="loadingInstructors"
            @click="loadInstructors(instructorPage)"
          >
            {{ loadingInstructors ? 'Refreshing…' : 'Refresh instructors' }}
          </button>
        </div>
        <p v-if="instructorActionError" class="admin-workspace__alert" role="alert">
          {{ instructorActionError }}
        </p>
        <p v-if="loadingInstructors && instructors.length === 0" role="status">
          Loading instructors…
        </p>
        <p v-else-if="instructors.length === 0" class="admin-workspace__empty">
          No instructors are listed yet.
        </p>
        <div v-else class="admin-workspace__instructor-list">
          <div
            v-for="instructor in instructors"
            :key="instructor.id"
            class="admin-workspace__instructor-row"
          >
            <div class="admin-workspace__instructor-identity">
              <img
                :src="avatarFor(instructor.avatarId).path"
                width="48"
                height="48"
                :alt="`${avatarFor(instructor.avatarId).label} capybara avatar`"
              />
              <div>
                <strong>{{ instructor.username }}</strong>
                <span>{{ instructor.email }}</span>
                <span class="admin-workspace__status">
                  {{ instructorStatusLabel(instructor) }}
                </span>
              </div>
            </div>
            <div
              v-if="instructor.accountStatus === 'disabled'"
              class="admin-workspace__row-actions"
            >
              <button
                class="admin-workspace__text-button"
                type="button"
                :disabled="Boolean(reissuing[instructor.id])"
                :aria-label="`Reissue link for ${instructor.username}`"
                @click="reissueActivation(instructor.id, instructor)"
              >
                {{ reissuing[instructor.id] ? 'Preparing link…' : 'Reissue link' }}
              </button>
              <button
                v-if="instructor.pendingActivation"
                class="admin-workspace__text-button admin-workspace__text-button--danger"
                type="button"
                :disabled="pendingCancelInstructor"
                :aria-label="`Cancel ${instructor.username}`"
                @click="confirmingCancelInstructorId = instructor.id"
              >
                Cancel
              </button>
            </div>
            <p v-if="activationErrors[instructor.id]" class="admin-workspace__alert" role="alert">
              {{ activationErrors[instructor.id] }}
            </p>
            <InlineConfirm
              v-if="confirmingCancelInstructorId === instructor.id"
              :message="`Cancel the pending instructor ${instructor.username}? Their activation link will stop working and their email can be used again.`"
              confirm-label="Yes, cancel them"
              cancel-label="Keep them"
              @confirm="cancelInstructor(instructor)"
              @cancel="confirmingCancelInstructorId = ''"
            />
            <AssignmentEditor
              :instructor="instructor"
              :cohorts="assignmentCohorts"
              :cohort-page="assignmentCohortPage"
              :cohort-total="assignmentCohortTotal"
              :pending="Boolean(pendingAssignments[instructor.id]) || loadingAssignmentCohorts"
              :error="assignmentErrors[instructor.id] || ''"
              :open="openAssignmentId === instructor.id"
              @toggle="toggleAssignments"
              @save="saveAssignments"
              @reload="reloadAssignments"
              @cohort-page="loadAssignmentCohorts"
            />
          </div>
        </div>
        <div class="admin-workspace__pagination" aria-label="Instructor pages">
          <button
            class="admin-workspace__text-button"
            type="button"
            :disabled="instructorPage <= 1 || loadingInstructors"
            @click="loadInstructors(instructorPage - 1)"
          >
            Previous instructors
          </button>
          <span
            >Page {{ instructorPage }} of
            {{ Math.max(1, Math.ceil(instructorTotal / PAGE_SIZE)) }}</span
          >
          <button
            class="admin-workspace__text-button"
            type="button"
            :disabled="instructorPage * PAGE_SIZE >= instructorTotal || loadingInstructors"
            @click="loadInstructors(instructorPage + 1)"
          >
            Next instructors
          </button>
        </div>
      </section>

      <details class="admin-workspace__panel admin-workspace__add-staff">
        <summary>Add staff</summary>
        <InstructorProvisionForm
          ref="instructorForm"
          :pending="pendingInstructor"
          :error="instructorError"
          :field-errors="instructorFieldErrors"
          @provision="provisionInstructor"
        />

        <InstructorProvisionForm
          ref="administratorForm"
          role="administrator"
          :pending="pendingAdministrator"
          :error="administratorError"
          :field-errors="administratorFieldErrors"
          @provision="provisionAdministrator"
        />
      </details>
    </div>

    <div
      v-show="tab === 'accounts'"
      id="admin-panel-accounts"
      class="admin-workspace__tabpanel"
      role="tabpanel"
      aria-labelledby="admin-tab-accounts"
    >
      <AccountStatusPanel
        ref="accountPanel"
        :reissuing="reissuing"
        :activation-errors="activationErrors"
        :access-error="activationAccessError"
        @reissue-activation="reissueActivation"
      />

      <section class="recovery-panel" aria-labelledby="admin-recovery-title">
        <h2 id="admin-recovery-title">Student password recovery</h2>
        <RecoveryStudentLookup
          :pending="recoveryLookupPending"
          :match="recoveryMatch"
          :error="recoveryLookupError"
          @lookup="lookupRecoveryStudent"
          @select="selectRecoveryStudent"
        />
        <RecoveryIssueForm
          v-if="recoveryStudent"
          ref="recoveryIssueForm"
          :eligible-student="recoveryStudent"
          :pending="recoveryIssuePending"
          :error="recoveryIssueError"
          @issue="issueRecoveryLink"
        />
      </section>
    </div>

    <div
      v-show="tab === 'audit'"
      id="admin-panel-audit"
      class="admin-workspace__tabpanel"
      role="tabpanel"
      aria-labelledby="admin-tab-audit"
    >
      <AuditEventsPanel ref="auditPanel" />
    </div>

    <ActivationLinkDialog
      v-if="activationLink"
      :link="activationLink"
      @close="closeActivationLink"
    />
    <RecoveryLinkDialog v-if="recoveryLink" :link="recoveryLink" @close="closeRecoveryLink" />
  </div>
</template>
