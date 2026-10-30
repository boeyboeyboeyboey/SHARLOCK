import { computed, reactive } from 'vue'

// shared between the hub (writes) and the site menu (reads); the 2d town never activates it
const state = reactive({
  active: false,
  superseded: false,
  peers: [],
  classes: [],
  selectedCohortId: '',
  staff: false,
})

export function usePresenceRoster() {
  return {
    state,
    names: computed(() => state.peers.map((peer) => peer.username)),
    count: computed(() => state.peers.length),
    selectClass(id) {
      state.selectedCohortId = id
    },
  }
}

export function resetRoster() {
  state.active = false
  state.superseded = false
  state.peers = []
  state.classes = []
  state.selectedCohortId = ''
  state.staff = false
}
