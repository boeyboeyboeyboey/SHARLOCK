<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Navbar from '../components/portal/Navbar.vue'
import SessionNotice from '../components/common/SessionNotice.vue'
import { useAuthStore } from '../features/auth/store.js'
import { provideSignOut } from '../features/menu/townControls.js'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const navbar = ref(null)
const isTown = computed(() => route.meta.theme === 'town')
// the town, its overlays and the game rooms carry their own menu instead of the top bar
const immersive = computed(() => Boolean(route.meta.immersive))
const isOverlayRoute = (target) => Boolean(target.meta.overlay || target.meta.newsDialog)
const menuOpen = ref(false)
async function signOut() {
  menuOpen.value = false
  try {
    await auth.logout()
    await router.replace('/login')
  } catch {
    // the auth store provides safe feedback and preserves a retryable session
  }
}
provideSignOut(signOut)
function focusPage() {
  const heading = route.meta.newsDialog ? '[data-news-heading]' : 'main h1'
  document.querySelector(heading)?.focus({ preventScroll: true })
}
watch(
  () => route.fullPath,
  async (_path, previousPath) => {
    menuOpen.value = false
    if (isOverlayRoute(route)) return
    const returningToTownFromOverlay =
      route.name === 'town' && previousPath && isOverlayRoute(router.resolve(previousPath))
    if (returningToTownFromOverlay) return
    await nextTick()
    focusPage()
  },
)
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
      v-model:menu-open="menuOpen"
      :user="auth.user"
      :logout-pending="auth.logoutPending"
      @sign-out="signOut"
    />
    <div class="portal-workspace">
      <main id="main-content" class="portal-main" tabindex="-1">
        <!-- an open overlay is a modal dialog, so it shows its own copy of the notice -->
        <SessionNotice v-if="!route.meta.authPage && !isOverlayRoute(route)" class="is-floating" />
        <RouterView />
      </main>
      <footer v-if="!route.meta.interior" class="portal-footer">
        <span>SHARLOCK · WAD2</span>
      </footer>
    </div>
  </div>
</template>
