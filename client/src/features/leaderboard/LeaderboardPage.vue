<script setup>
defineOptions({ name: 'SharlockLeaderboard' })
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { gameCatalog } from '../../data/gameCatalog.js'
import { useAuthStore } from '../auth/store.js'
import { listManagedCohorts, listMemberships } from '../cohorts/api.js'
import { getLeaderboard, getLeaderboardGames, leaderboardErrorMessage } from './api.js'
import LeaderboardFilters from './LeaderboardFilters.vue'
import LeaderboardTable from './LeaderboardTable.vue'
import './leaderboard.css'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const VIEWS = [
  { id: 'best', label: 'Best score' },
  { id: 'all-time', label: 'All-time' },
]

const cohorts = ref([])
const cohortsLoaded = ref(false)
const cohortsError = ref('')
const games = ref([])
const gamesLoaded = ref(false)
const board = ref(null)
const page = ref(1)
const loading = ref(false)
const boardError = ref('')
const tabs = ref(null)
let cohortsRequest = null
let gamesRequest = null
let boardRequest = null
let cohortsGeneration = 0
let gamesGeneration = 0
let boardGeneration = 0

const isStaff = computed(() => {
  const roles = auth.user?.globalRoles || []
  return roles.includes('instructor') || roles.includes('admin')
})
const gameOptions = computed(() =>
  games.value.map((game) => ({
    gameId: game.gameId,
    name: gameCatalog.find((entry) => entry.id === game.gameId)?.name ?? game.gameId,
  })),
)
const cohortId = computed(() => {
  const requested = String(route.query.class || '')
  return cohorts.value.some((cohort) => cohort.cohortId === requested)
    ? requested
    : cohorts.value[0]?.cohortId || ''
})
const gameId = computed(() => {
  const requested = String(route.query.game || '')
  return games.value.some((game) => game.gameId === requested)
    ? requested
    : games.value[0]?.gameId || ''
})
const view = computed(() => (route.query.view === 'all-time' ? 'all-time' : 'best'))
const gameName = computed(
  () => gameOptions.value.find((game) => game.gameId === gameId.value)?.name || '',
)
const caption = computed(() => {
  if (!board.value) return ''
  if (view.value === 'all-time') return 'All-time points'
  return board.value.competitive ? 'Timed runs' : 'Practice best scores'
})
const pageCount = computed(() =>
  board.value ? Math.max(1, Math.ceil(board.value.total / board.value.pageSize)) : 1,
)
const meOffPage = computed(() => {
  const me = board.value?.me
  return me && !board.value.rows.some((row) => row.isSelf) ? me : null
})

function updateQuery(changes) {
  router.replace({ query: { ...route.query, ...changes } })
}

async function loadCohorts() {
  const current = ++cohortsGeneration
  cohortsRequest?.abort()
  const controller = new AbortController()
  cohortsRequest = controller
  cohortsError.value = ''
  cohortsLoaded.value = false
  try {
    const options = { limit: 50, signal: controller.signal }
    if (isStaff.value) {
      const result = await listManagedCohorts(options)
      if (current !== cohortsGeneration) return
      cohorts.value = (result.cohorts || []).map(({ cohortId, cohortName }) => ({
        cohortId,
        cohortName,
      }))
    } else {
      const result = await listMemberships(options)
      if (current !== cohortsGeneration) return
      cohorts.value = (result.memberships || [])
        .filter((row) => row.status === 'active' && row.cohortStatus === 'active')
        .map(({ cohortId, cohortName }) => ({ cohortId, cohortName }))
    }
    cohortsLoaded.value = true
  } catch (error) {
    if (current !== cohortsGeneration || controller.signal.aborted) return
    cohortsError.value = leaderboardErrorMessage(error)
  }
}

async function loadGames() {
  const current = ++gamesGeneration
  gamesRequest?.abort()
  boardRequest?.abort()
  boardGeneration += 1
  games.value = []
  gamesLoaded.value = false
  board.value = null
  boardError.value = ''
  loading.value = false
  if (!cohortId.value) return
  const controller = new AbortController()
  gamesRequest = controller
  loading.value = true
  try {
    const result = await getLeaderboardGames(cohortId.value, { signal: controller.signal })
    if (current !== gamesGeneration) return
    games.value = result.games || []
    gamesLoaded.value = true
    if (!games.value.length) loading.value = false
  } catch (error) {
    if (current !== gamesGeneration || controller.signal.aborted) return
    boardError.value = leaderboardErrorMessage(error)
    loading.value = false
  }
}

async function loadBoard() {
  const current = ++boardGeneration
  boardRequest?.abort()
  if (!cohortId.value || !gameId.value) return
  const controller = new AbortController()
  boardRequest = controller
  loading.value = true
  boardError.value = ''
  try {
    const result = await getLeaderboard(cohortId.value, {
      gameId: gameId.value,
      view: view.value,
      page: page.value,
      signal: controller.signal,
    })
    if (current !== boardGeneration) return
    board.value = result
  } catch (error) {
    if (current !== boardGeneration || controller.signal.aborted) return
    board.value = null
    boardError.value = leaderboardErrorMessage(error)
  } finally {
    if (current === boardGeneration) loading.value = false
  }
}

watch(
  () => auth.user?.id,
  (id) => {
    if (id) loadCohorts()
  },
  { immediate: true },
)
watch(cohortId, loadGames, { immediate: true })
watch([cohortId, gameId, view], () => {
  page.value = 1
  loadBoard()
})
watch(page, (next, previous) => {
  if (next !== previous) loadBoard()
})

onBeforeUnmount(() => {
  cohortsGeneration += 1
  gamesGeneration += 1
  boardGeneration += 1
  cohortsRequest?.abort()
  gamesRequest?.abort()
  boardRequest?.abort()
})

function onFilters(value) {
  updateQuery({
    class: value.cohortId,
    game: value.cohortId === cohortId.value ? value.gameId : '',
  })
}

function selectView(id) {
  updateQuery({ view: id })
}

function onTabKey(event) {
  const keys = { ArrowRight: 1, ArrowLeft: -1 }
  if (!(event.key in keys) && event.key !== 'Home' && event.key !== 'End') return
  event.preventDefault()
  const index = VIEWS.findIndex((item) => item.id === view.value)
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? VIEWS.length - 1
        : (index + keys[event.key] + VIEWS.length) % VIEWS.length
  selectView(VIEWS[next].id)
  tabs.value?.querySelectorAll('[role="tab"]')[next]?.focus()
}
</script>

<template>
  <div class="profile-view leaderboard">
    <h1 tabindex="-1">Leaderboards</h1>

    <p v-if="!cohortsLoaded && !cohortsError" role="status">Loading your classes…</p>
    <div v-else-if="cohortsError" class="preview-notice" role="alert">
      <p>{{ cohortsError }}</p>
      <button class="btn btn-secondary" type="button" @click="loadCohorts">Try again</button>
    </div>
    <p v-else-if="!cohorts.length" class="preview-notice">
      Join a class to see its leaderboard.
      <RouterLink to="/classes">Go to classes</RouterLink>
    </p>
    <template v-else>
      <LeaderboardFilters
        :cohorts="cohorts"
        :games="gameOptions"
        :model-value="{ cohortId, gameId }"
        @update:model-value="onFilters"
      />
      <p v-if="loading && !board && !boardError" role="status">Loading the leaderboard…</p>
      <div v-else-if="boardError" class="preview-notice" role="alert">
        <p>{{ boardError }}</p>
        <button
          class="btn btn-secondary"
          type="button"
          @click="gamesLoaded ? loadBoard() : loadGames()"
        >
          Try again
        </button>
      </div>
      <p v-else-if="gamesLoaded && !games.length" class="preview-notice">No scores yet.</p>
      <section v-else-if="board" class="leaderboard__section" aria-labelledby="leaderboard-heading">
        <h2 id="leaderboard-heading">
          {{ gameName }}
          <small v-if="board.rulesetVersion">(ruleset {{ board.rulesetVersion }})</small>
        </h2>
        <div
          ref="tabs"
          class="leaderboard__tabs"
          role="tablist"
          aria-label="Leaderboard view"
          @keydown="onTabKey"
        >
          <button
            v-for="item in VIEWS"
            :id="`leaderboard-tab-${item.id}`"
            :key="item.id"
            type="button"
            role="tab"
            :aria-selected="view === item.id"
            aria-controls="leaderboard-panel"
            :tabindex="view === item.id ? 0 : -1"
            @click="selectView(item.id)"
          >
            {{ item.label }}
          </button>
        </div>
        <div
          id="leaderboard-panel"
          role="tabpanel"
          :aria-labelledby="`leaderboard-tab-${view}`"
          class="leaderboard__section"
        >
          <p v-if="!board.rows.length">No scores yet.</p>
          <LeaderboardTable
            v-else
            :rows="board.rows"
            :loading="loading"
            :view="board.view"
            :caption="caption"
          />
          <p v-if="meOffPage">Your rank: {{ meOffPage.rank }}</p>
          <nav
            v-if="board.total > board.pageSize"
            class="leaderboard__pager"
            aria-label="Leaderboard pages"
          >
            <button
              class="btn btn-secondary"
              type="button"
              :disabled="loading || page <= 1"
              @click="page -= 1"
            >
              Previous
            </button>
            <span>Page {{ board.page }} of {{ pageCount }}</span>
            <button
              class="btn btn-secondary"
              type="button"
              :disabled="loading || page >= pageCount"
              @click="page += 1"
            >
              Next
            </button>
          </nav>
        </div>
      </section>
    </template>
  </div>
</template>
