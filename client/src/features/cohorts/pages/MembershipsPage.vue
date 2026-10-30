<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import JoinCohortForm from '../components/JoinCohortForm.vue'
import MembershipList from '../components/MembershipList.vue'
import { joinClass, listMemberships, safeError } from '../api.js'
import '../cohorts.css'

const route = useRoute()
const memberships = ref([])
const page = ref(1)
const total = ref(0)
const loading = ref(false)
const joining = ref(false)
const error = ref('')
const notice = ref(
  route.query.joined === 'pending'
    ? 'Your request was sent. Class access begins after staff approval.'
    : '',
)
let generation = 0
const controllers = new Set()
function requestController() {
  const controller = new AbortController()
  controllers.add(controller)
  return controller
}

async function loadMemberships(nextPage = page.value) {
  const operation = ++generation
  const controller = requestController()
  page.value = nextPage
  loading.value = true
  error.value = ''
  try {
    const result = await listMemberships({ page: nextPage, limit: 20, signal: controller.signal })
    if (operation !== generation) return
    memberships.value = result.memberships || []
    total.value = result.total || 0
  } catch (cause) {
    if (!controller.signal.aborted && operation === generation)
      error.value = safeError(cause).message
  } finally {
    controllers.delete(controller)
    if (operation === generation) loading.value = false
  }
}

async function submitCode(code) {
  if (joining.value) return
  const controller = requestController()
  joining.value = true
  error.value = ''
  notice.value = ''
  try {
    await joinClass({ code }, controller.signal)
    notice.value = 'Your request was sent. Class access begins after staff approval.'
    await loadMemberships(1)
  } catch (cause) {
    if (!controller.signal.aborted) error.value = safeError(cause).message
  } finally {
    controllers.delete(controller)
    joining.value = false
  }
}

onMounted(() => loadMemberships())
onBeforeUnmount(() => {
  generation += 1
  controllers.forEach((controller) => controller.abort())
})
</script>

<template>
  <div class="cohort-page" aria-labelledby="classes-title">
    <h1 id="classes-title" tabindex="-1">Your classes</h1>
    <p class="cohort-intro">Enter your instructor's invitation code to join a class.</p>
    <p v-if="notice" class="cohort-notice" role="status">{{ notice }}</p>
    <JoinCohortForm :pending="joining" :error="error" @submit="submitCode" />
    <p v-if="error && !joining" class="cohort-alert" role="alert">{{ error }}</p>
    <MembershipList
      :memberships="memberships"
      :page="page"
      :total="total"
      :pending="loading"
      @page="loadMemberships"
    />
  </div>
</template>
