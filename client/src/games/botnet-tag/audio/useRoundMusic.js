import { computed, ref, watch } from 'vue'
import { useGameAudio } from '../../../composables/useGameAudio.js'

export const FINAL_MS = 30000

// which loop plays: the final track in the last 30 s of play, unless its file failed this visit
export function roundTrack({ phase, msLeft, finalUnavailable }) {
  return phase === 'playing' && msLeft > 0 && msLeft <= FINAL_MS && !finalUnavailable
    ? 'final'
    : 'round'
}

// two looping players with the shared mute; the inactive one is held silent, so one plays at a time
export function useRoundMusic(capable, view) {
  const finalUnavailable = ref(false)
  const track = computed(() =>
    capable ? roundTrack({ ...view(), finalUnavailable: finalUnavailable.value }) : '',
  )
  const round = useGameAudio(() => (track.value === 'round' ? 'botnet-tag' : ''))
  const final = useGameAudio(() => (track.value === 'final' ? 'botnet-tag-final' : ''))
  // a missing final file falls back to the round loop for the rest of the visit
  watch(final.missing, (missing) => {
    if (missing && track.value === 'final') finalUnavailable.value = true
  })
  const active = computed(() => (track.value === 'final' ? final : round))

  return {
    track,
    isMuted: computed(() => active.value.isMuted.value),
    starting: computed(() => active.value.starting.value),
    missing: computed(() => active.value.missing.value),
    toggle: () => active.value.toggle(),
  }
}
