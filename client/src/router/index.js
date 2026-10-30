import { createRouter, createWebHistory } from 'vue-router'
import { reactive, readonly } from 'vue'
import Dashboard from '../views/Dashboard.vue'
import ComingSoon from '../views/ComingSoon.vue'

const RESET_PASSWORD_PATH = '/reset-password'
const RESET_TOKEN_PATTERN = /^[A-Za-z\d_-]{43}$/
const resetLinkCapture = reactive({ status: 'missing', token: '' })
export const resetLinkCaptureState = readonly(resetLinkCapture)

function captureHashToken(hash) {
  const match = /^#token=([A-Za-z\d_-]{43})$/.exec(hash)
  if (match && RESET_TOKEN_PATTERN.test(match[1])) {
    resetLinkCapture.status = 'ready'
    resetLinkCapture.token = match[1]
    return
  }
  resetLinkCapture.status = 'invalid'
  resetLinkCapture.token = ''
}

function captureInitialResetLink() {
  if (
    typeof window === 'undefined' ||
    window.location.pathname.replace(/\/+$/, '') !== RESET_PASSWORD_PATH
  )
    return

  const hasQueryToken = [...new URLSearchParams(window.location.search).keys()].some(
    (key) => key.toLowerCase() === 'token',
  )
  if (hasQueryToken) {
    resetLinkCapture.status = 'invalid'
    resetLinkCapture.token = ''
  } else if (window.location.hash) {
    captureHashToken(window.location.hash)
  }

  if (hasQueryToken || window.location.hash) {
    window.history.replaceState(window.history.state, '', RESET_PASSWORD_PATH)
  }
}

captureInitialResetLink()

export function getResetLinkCapture() {
  return { ...resetLinkCapture }
}

export function clearResetLinkCapture() {
  resetLinkCapture.status = 'missing'
  resetLinkCapture.token = ''
}

export const routes = [
  {
    path: '/',
    name: 'town',
    component: Dashboard,
    meta: { title: 'Sharlock Town', theme: 'town', requiresAccount: true, immersive: true },
    children: [
      {
        path: '/games/threat-briefing',
        name: 'news',
        component: () => import('../games/threat-briefing/NewsDialog.vue'),
        meta: { title: 'The Sharlock Times', newsDialog: true },
      },
      // menu overlays open over the town like the Times; each keeps the meta it had as a page
      {
        path: '/profile',
        name: 'profile',
        component: () => import('../features/menu/overlays/ProfileOverlay.vue'),
        meta: {
          title: 'Detective profile',
          overlay: true,
          requiresAccount: false,
          accountAware: true,
          hideAccountSummary: true,
        },
      },
      {
        path: '/leaderboard',
        name: 'leaderboard',
        component: () => import('../features/menu/overlays/LeaderboardOverlay.vue'),
        meta: { title: 'Leaderboards', overlay: true, requiresAccount: true },
      },
      {
        path: '/classes',
        name: 'classes',
        component: () => import('../features/menu/overlays/ClassesOverlay.vue'),
        meta: { title: 'Your classes', overlay: true, requiresAccount: true },
      },
      {
        path: '/settings',
        name: 'settings',
        component: () => import('../features/menu/overlays/SettingsOverlay.vue'),
        meta: { title: 'Settings', overlay: true, requiresAccount: true },
      },
      {
        path: '/discoveries',
        name: 'discoveries',
        component: () => import('../features/menu/overlays/DiscoveriesOverlay.vue'),
        meta: { title: 'Discoveries', overlay: true, requiresAccount: true },
      },
      {
        path: '/about',
        name: 'about',
        component: () => import('../features/menu/overlays/AboutOverlay.vue'),
        meta: { title: 'About Sharlock', overlay: true, requiresAccount: false },
      },
    ],
  },
  { path: '/dashboard', redirect: (to) => ({ path: '/', query: to.query, hash: to.hash }) },
  { path: '/progress', redirect: (to) => ({ path: '/profile', query: { ...to.query, tab: 'progress' } }) },
  {
    path: '/login',
    component: () => import('../features/auth/pages/LoginPage.vue'),
    // these pages show account problems in their own card, so the sidebar copy is dropped: it
    // duplicated the message and pushed the sidebar past the window height, which adds a scrollbar
    // that takes 18px of its 236px
    meta: { title: 'Sign in', authPage: true, hideAccountSummary: true },
  },
  {
    path: '/register',
    component: () => import('../features/auth/pages/RegisterPage.vue'),
    meta: { title: 'Create account', authPage: true, hideAccountSummary: true },
  },
  {
    path: '/activate-account',
    component: () => import('../features/activation/pages/ActivationPage.vue'),
    meta: { title: 'Activate staff account' },
  },
  {
    path: RESET_PASSWORD_PATH,
    component: () => import('../features/recovery/pages/ResetPasswordPage.vue'),
    meta: { title: 'Reset student password' },
  },
  {
    path: '/join-class',
    component: () => import('../features/cohorts/pages/JoinClassPage.vue'),
    meta: { title: 'Join a class' },
  },
  {
    path: '/instructor',
    component: () => import('../features/cohorts/pages/ClassManagementPage.vue'),
    meta: {
      title: 'Class enrollment',
      requiresAccount: true,
      allowedRoles: ['instructor', 'admin'],
    },
  },
  {
    path: '/admin',
    component: () => import('../features/admin/pages/AdminPage.vue'),
    meta: {
      title: 'Administrator workspace',
      theme: 'utility',
      requiresAccount: true,
      requiredRole: 'admin',
    },
  },
  ...[
    ['integrity-detective', 'cli-cyber-defender'],
    ['mini-ctf', 'sql-injection-arcade'],
    ['access-control', 'social-engineering-simulator'],
    ['red-blue', 'clearance-tower'],
    ['regex-defender', 'clearance-tower'],
  ].map(([previous, current]) => ({
    path: `/games/${previous}`,
    redirect: `/games/${current}`,
  })),
  // the five game routes render inside a Babylon room; /games alone is not a page
  {
    path: '/games',
    redirect: '/',
    component: () => import('../features/interiors/InteriorLayout.vue'),
    // game screens carry their own glass controls instead of the navbar and sidebar
    meta: { immersive: true },
    children: [
      {
        path: '/games/sql-injection-arcade',
        component: () => import('../games/sql-injection-arcade/SqlInjectionArcade.vue'),
        meta: { interior: 'sql-injection-arcade', title: 'SQL Injection Arcade', requiresAccount: true },
      },
      {
        path: '/games/phishing-post-mortem',
        component: () => import('../games/phishing-post-mortem/PhishingPostMortem.vue'),
        meta: { interior: 'phishing-post-mortem', title: 'The Phishing Post-Mortem', requiresAccount: true },
      },
      {
        path: '/games/social-engineering-simulator',
        component: () => import('../games/social-engineering-simulator/SocialEngineeringSimulator.vue'),
        meta: { interior: 'social-engineering-simulator', title: 'LLM Social Engineering Simulator', requiresAccount: true },
      },
      {
        path: '/games/cli-cyber-defender',
        component: () => import('../games/cli-cyber-defender/CliDefenderGame.vue'),
        meta: { interior: 'cli-cyber-defender', title: 'CLI Cyber Defender', requiresAccount: true },
      },
      {
        path: '/games/clearance-tower',
        component: () => import('../games/clearance-tower/ClearanceTowerGame.vue'),
        meta: { interior: 'clearance-tower', title: 'Clearance Tower', requiresAccount: true },
      },
    ],
  },
  {
    path: '/games/:gameId',
    component: () => import('../views/GamePreview.vue'),
    meta: { title: 'Case preview', requiresAccount: true },
  },
  {
    path: '/forbidden',
    component: ComingSoon,
    props: {
      title: 'This case needs permission',
      description: 'Return to town to find an available activity.',
      showMascot: false,
    },
    meta: { title: 'This case needs permission' },
  },
  {
    path: '/:pathMatch(.*)*',
    component: () => import('../views/NotFound.vue'),
    meta: { title: 'Page not found' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: (to, from, savedPosition) =>
    to.meta.theme === 'town' && from.meta.theme === 'town' ? false : savedPosition || { top: 0 },
})
router.beforeEach((to, from) => {
  if (to.path === RESET_PASSWORD_PATH) {
    if (Object.keys(to.query).some((key) => key.toLowerCase() === 'token')) {
      resetLinkCapture.status = 'invalid'
      resetLinkCapture.token = ''
      return { path: RESET_PASSWORD_PATH, replace: true }
    }
    if (to.hash) {
      captureHashToken(to.hash)
      return { path: RESET_PASSWORD_PATH, replace: true }
    }
    return true
  }
  if (from.path === RESET_PASSWORD_PATH) clearResetLinkCapture()
  return true
})
router.afterEach((to) => {
  document.title = `${to.meta.title || 'Explore'} · Sharlock`
})
export default router
