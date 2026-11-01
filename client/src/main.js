// libraries (mit): vue, pinia, bootstrap; versions and licences are in credits.md
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'bootstrap/dist/css/bootstrap.min.css'
import './assets/styles/main.css'
import './assets/styles/town.css'
import App from './App.vue'
import router from './router/index.js'
import { api } from './services/api.js'
import { useAuthStore } from './features/auth/store.js'
import {
  createAccountGuard,
  installBrowserAccountAccess,
  installSessionReturnCheck,
} from './features/auth/guards.js'
import { installPageWipes } from './features/auth/pixel-wipe.js'
import {
  captureInvitationCodeFromLocation,
  clearPendingInvitation,
  resolveEnrollmentDestination,
} from './features/cohorts/journey.js'

captureInvitationCodeFromLocation()

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
const auth = useAuthStore(pinia)
router.beforeEach(createAccountGuard(auth, { resolveDestination: resolveEnrollmentDestination }))
router.afterEach((to) => {
  if (!['/join-class', '/login', '/register'].includes(to.path)) clearPendingInvitation()
})
installPageWipes(router)
const checkSession = () => auth.restoreSession({ force: true })
// a sign-out in progress has its own outcome, so its 401 is not an expiry
const isSignedIn = () => auth.status === 'authenticated' && !auth.logoutPending
function onExpired({ replaced = false } = {}) {
  const reason = replaced || auth.sessionEnd === 'elsewhere' ? 'elsewhere' : 'expired'
  clearPendingInvitation()
  auth.invalidateSession(reason)
  if (router.currentRoute.value.meta.requiresAccount) {
    void router.replace({ path: '/login', query: { reason } }).catch(() => {})
  }
}
const getSessionGeneration = () => auth.sessionGeneration()
const removeAccountAccess = installBrowserAccountAccess(api, {
  checkSession,
  onExpired,
  isSignedIn,
  getSessionGeneration,
})
const removeReturnCheck = installSessionReturnCheck({
  checkSession: () => auth.restoreSession({ force: true, quiet: true }),
  onExpired,
  isSignedIn,
  getSessionGeneration,
})
if (!['/activate-account', '/join-class'].includes(window.location.pathname)) {
  void auth.restoreSession().catch(() => {})
}
app.use(router).mount('#app')
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    removeAccountAccess()
    removeReturnCheck()
  })
}
