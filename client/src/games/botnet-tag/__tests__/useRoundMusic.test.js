import { describe, expect, it, vi } from 'vitest'
import { nextTick, reactive, ref } from 'vue'

const players = []
vi.mock('../../../composables/useGameAudio.js', () => ({
  useGameAudio: (roomId) => {
    const player = {
      roomId,
      isMuted: ref(true),
      starting: ref(false),
      missing: ref(false),
      toggle: vi.fn(),
    }
    players.push(player)
    return player
  },
}))

const { roundTrack, useRoundMusic } = await import('../audio/useRoundMusic.js')

describe('roundTrack', () => {
  it('plays the final track only in the last 30 seconds of play', () => {
    expect(roundTrack({ phase: 'playing', msLeft: 31000 })).toBe('round')
    expect(roundTrack({ phase: 'playing', msLeft: 30000 })).toBe('final')
    expect(roundTrack({ phase: 'playing', msLeft: 1000 })).toBe('final')
    expect(roundTrack({ phase: 'playing', msLeft: 0 })).toBe('round')
    expect(roundTrack({ phase: 'lobby', msLeft: 5000 })).toBe('round')
    expect(roundTrack({ phase: 'results', msLeft: 5000 })).toBe('round')
  })

  it('keeps the round loop when the final file failed', () => {
    expect(roundTrack({ phase: 'playing', msLeft: 1000, finalUnavailable: true })).toBe('round')
  })
})

describe('useRoundMusic', () => {
  function setup(capable = true) {
    players.length = 0
    const state = reactive({ phase: 'playing', msLeft: 60000 })
    const music = useRoundMusic(capable, () => ({ ...state }))
    const [round, final] = players
    return { state, music, round, final }
  }

  it('hands the room id to one player at a time', async () => {
    const { state, music, round, final } = setup()
    expect([round.roomId(), final.roomId()]).toEqual(['botnet-tag', ''])
    state.msLeft = 20000
    await nextTick()
    expect([round.roomId(), final.roomId()]).toEqual(['', 'botnet-tag-final'])
    music.toggle()
    expect(final.toggle).toHaveBeenCalled()
    state.phase = 'results'
    await nextTick()
    expect([round.roomId(), final.roomId()]).toEqual(['botnet-tag', ''])
  })

  it('falls back to the round loop when the final file is missing', async () => {
    const { state, music, round, final } = setup()
    state.msLeft = 20000
    await nextTick()
    final.missing.value = true
    await nextTick()
    expect(music.track.value).toBe('round')
    expect(round.roomId()).toBe('botnet-tag')
  })

  it('stays silent without 3D', () => {
    const { round, final } = setup(false)
    expect([round.roomId(), final.roomId()]).toEqual(['', ''])
  })
})
