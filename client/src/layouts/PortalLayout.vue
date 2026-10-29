<script setup>
import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Offcanvas from 'bootstrap/js/dist/offcanvas'
import Navbar from '../components/portal/Navbar.vue'
import PixelIcon from '../components/town/PixelIcon.vue'
import AccountSummary from '../features/auth/components/AccountSummary.vue'
import { useAuthStore } from '../features/auth/store.js'
import { provideSignOut } from '../features/menu/townControls.js'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const requestErrorMessage = computed(() =>
  typeof auth.requestError === 'string' ? auth.requestError : auth.requestError?.message || '',
)
const panel = ref(null)
const navbar = ref(null)
const isTown = computed(() => route.meta.theme === 'town')
// the town and its overlays carry their own menu instead of the navbar and sidebar
const immersive = computed(() => Boolean(route.meta.immersive))
const isOverlayRoute = (target) => Boolean(target.meta.overlay || target.meta.newsDialog)
const menuOpen = ref(false)
let offcanvas
let media
let routeChanged = false
const navigation = computed(() => [
  { to: '/', label: 'Town map', icon: 'map' },
  { to: '/profile', label: 'Detective profile', icon: 'trophy' },
  { to: '/progress', label: 'Learning progress', icon: 'chart' },
  ...(auth.user?.globalRoles?.includes('student')
    ? [{ to: '/classes', label: 'Your classes', icon: 'people' }]
    : []),
  { to: '/leaderboard', label: 'Cohort leaderboard', icon: 'people' },
  ...(auth.user?.globalRoles?.some((role) => ['instructor', 'admin'].includes(role))
    ? [
        {
          to: '/instructor',
          label: 'Class enrollment',
          icon: 'people',
          roleClass: 'role-link--instructor',
        },
      ]
    : []),
  ...(auth.user?.globalRoles?.includes('admin')
    ? [
        {
          to: '/admin',
          label: 'Administrator workspace',
          icon: 'shield',
          roleClass: 'role-link--admin',
        },
      ]
    : []),
])
function openMenu() {
  offcanvas?.show()
}
function closeMenu() {
  offcanvas?.hide()
}
async function signOut() {
  try {
    await auth.logout()
    await router.replace('/login')
  } catch {
    // the auth store provides safe feedback and preserves a retryable session
  }
}
provideSignOut(signOut)
async function retrySession() {
  try {
    await auth.restoreSession({ force: true })
  } catch {
    // keep the store's connection feedback available for another retry
  }
}
function showState() {
  menuOpen.value = true
}
function hideState() {
  menuOpen.value = false
}
function focusPage() {
  const heading = route.meta.newsDialog ? '[data-news-heading]' : 'main h1'
  document.querySelector(heading)?.focus({ preventScroll: true })
}
function onHidden() {
  if (routeChanged || media.matches) focusPage()
  else navbar.value?.focusMenu()
  routeChanged = false
}
function onBreakpoint(event) {
  if (event.matches) closeMenu()
}
function bindPanel(el) {
  offcanvas = new Offcanvas(el)
  el.addEventListener('show.bs.offcanvas', showState)
  el.addEventListener('hide.bs.offcanvas', hideState)
  el.addEventListener('hidden.bs.offcanvas', onHidden)
}
function unbindPanel(el) {
  el.removeEventListener('show.bs.offcanvas', showState)
  el.removeEventListener('hide.bs.offcanvas', hideState)
  el.removeEventListener('hidden.bs.offcanvas', onHidden)
  offcanvas?.dispose()
  offcanvas = undefined
  menuOpen.value = false
}
onMounted(() => {
  media = window.matchMedia('(min-width: 768px)')
  media.addEventListener('change', onBreakpoint)
})
// the sidebar only exists outside the town, so its offcanvas follows the element
watch(
  panel,
  (el, previous) => {
    if (previous) unbindPanel(previous)
    if (el) bindPanel(el)
  },
  { flush: 'post' },
)
watch(
  () => route.fullPath,
  async (_path, previousPath) => {
    if (menuOpen.value) {
      routeChanged = true
      closeMenu()
      return
    }
    if (isOverlayRoute(route)) return
    const returningToTownFromOverlay =
      route.name === 'town' && previousPath && isOverlayRoute(router.resolve(previousPath))
    if (returningToTownFromOverlay) return
    await nextTick()
    focusPage()
  },
)
onBeforeUnmount(() => {
  media?.removeEventListener('change', onBreakpoint)
  if (panel.value) unbindPanel(panel.value)
})
</script>

<template>
  <div
    class="portal-shell"
    :class="{
      'is-town': isTown,
      'is-immersive': immersive,
      'is-utility': route.meta.theme === 'utility',
    }"
  >
    <a href="#main-content" class="skip-link">Skip to content</a>
    <Navbar
      v-if="!immersive"
      ref="navbar"
      :town="isTown"
      :menu-open="menuOpen"
      :user="auth.user"
      :logout-pending="auth.logoutPending"
      @open-menu="openMenu"
      @sign-out="signOut"
    />
    <aside
      v-if="!immersive"
      id="portal-menu"
      ref="panel"
      class="portal-sidebar offcanvas-md offcanvas-start"
      :class="{ 'fit-sidebar': route.meta.hideAccountSummary }"
      tabindex="-1"
      aria-labelledby="menu-title"
    >
      <div class="offcanvas-header">
        <h2 id="menu-title" class="h5 mb-0">Your detective desk</h2>
        <button type="button" class="icon-button" aria-label="Close navigation" @click="closeMenu">
          <PixelIcon name="close" :size="24" />
        </button>
      </div>
      <div class="offcanvas-body">
        <AccountSummary
          v-if="!route.meta.hideAccountSummary"
          :status="auth.status"
          :user="auth.user"
          :logout-pending="auth.logoutPending"
          :error="auth.requestError"
          @sign-out="signOut"
          @retry-session="retrySession"
        />
        <p class="nav-caption">YOUR EXPLORER'S KIT</p>
        <nav class="nav flex-column portal-nav" aria-label="Main navigation">
          <RouterLink
            v-for="item in navigation"
            :key="item.to"
            :to="item.to"
            class="nav-link"
            :class="item.roleClass"
            ><PixelIcon :name="item.icon" :size="20" />{{ item.label
            }}<span class="active-nav-dot" aria-hidden="true"></span
          ></RouterLink>
        </nav>
        <div v-if="!isTown" class="sidebar-note">
          <PixelIcon name="star" :size="24" />
          <p>Every expert starts<br />with a little curiosity.</p>
          <span>You've got this, detective.</span>
        </div>
        <RouterLink to="/about" class="sidebar-about"
          >What is Sharlock? <PixelIcon name="arrow" :size="16"
        /></RouterLink>
      </div>
    </aside>
    <div class="portal-workspace">
      <main id="main-content" class="portal-main" tabindex="-1">
        <p v-if="requestErrorMessage && !route.meta.authPage" class="preview-notice" role="alert">
          {{ requestErrorMessage }}
        </p>
        <RouterView />
      </main>
      <footer class="portal-footer">
        <span>Made for curious minds.</span><span>SHARLOCK · WAD2</span>
      </footer>
    </div>
  </div>
</template>
