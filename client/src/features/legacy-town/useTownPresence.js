import { getCurrentInstance, ref } from 'vue'
import { getActivePinia } from 'pinia'
import { useAuthStore } from '../auth/store.js'
import { endSessionFromPresence, usePresence } from '../hub/presence/usePresence.js'
import { approachTownPeer, syncTownPeers } from './townPeers.js'

// classmates in the 2d town: one 2d-mode presence socket, drawn peers eased by a frame loop (snapped under reduced motion)
// does nothing without a signed-in user
export function useTownPresence({ getPlayer, reducedMotion = () => false }) {
  const list = ref([])
  const pinia = getActivePinia()
  const auth = pinia ? useAuthStore(pinia) : null
  const router = getCurrentInstance()?.appContext.config.globalProperties.$router
  let raf = null
  let last = null

  function tick(t) {
    raf = null
    const dt = last === null ? 0 : Math.min((t - last) / 1000, 0.05)
    last = t
    const reduced = reducedMotion()
    for (const peer of list.value) approachTownPeer(peer, dt, reduced)
    if (list.value.length) raf = requestAnimationFrame(tick)
    else last = null
  }

  function onPeers(peers) {
    const from = getPlayer() ?? { x: 0, y: 0 }
    list.value = syncTownPeers(list.value, peers, from, reducedMotion())
    if (reducedMotion()) for (const peer of list.value) approachTownPeer(peer, 0, true)
    else if (list.value.length && raf === null) raf = requestAnimationFrame(tick)
  }

  const presence = usePresence({
    mode: '2d',
    getPlayer,
    staff: (auth?.user?.globalRoles ?? []).some((role) => ['instructor', 'admin'].includes(role)),
    onPeers,
    checkSession: () => auth?.restoreSession({ force: true }),
    // 4401 or a refused socket: the session is gone server side, so show the login notice
    onSessionEnded: (reason) => endSessionFromPresence(auth, router, reason),
  })

  function start() {
    if (auth?.user) presence.start()
  }
  function dispose() {
    if (raf !== null) cancelAnimationFrame(raf)
    raf = null
    presence.stop()
    list.value = []
  }

  return { list, start, dispose }
}
