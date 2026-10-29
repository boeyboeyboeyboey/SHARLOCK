import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MUSIC_MUTED_KEY } from '../useLandingMusic.js'
import { playSfx, resetSfxPools } from '../playSfx.js'

let created
let playImpl

class FakeAudio {
  constructor(src) {
    this.src = src
    this.listeners = {}
    created.push(this)
  }
  addEventListener(type, fn) {
    this.listeners[type] = fn
  }
  play() {
    return playImpl(this)
  }
}

beforeEach(() => {
  created = []
  playImpl = () => Promise.resolve()
  sessionStorage.clear()
  resetSfxPools()
  vi.stubGlobal('Audio', FakeAudio)
  // the jsdom guard keeps game component tests quiet; these tests need the real path
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 Chrome')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('playSfx', () => {
  it('plays the named file from the games folder', () => {
    playSfx('correct')
    expect(created).toHaveLength(1)
    expect(created[0].src).toBe('/audio/games/sfx-correct.mp3')
  })

  it('stays silent while sound is muted for the session', () => {
    sessionStorage.setItem(MUSIC_MUTED_KEY, '1')
    playSfx('win')
    expect(created).toHaveLength(0)
  })

  it('ignores unknown names', () => {
    playSfx('boom')
    expect(created).toHaveLength(0)
  })

  it('keeps a short pool per name', () => {
    for (let i = 0; i < 5; i++) playSfx('click')
    expect(created).toHaveLength(2)
  })

  it('fails silently when the file is missing', async () => {
    const consoleError = vi.spyOn(console, 'error')
    const consoleWarn = vi.spyOn(console, 'warn')
    playImpl = () =>
      Promise.reject(Object.assign(new Error('no source'), { name: 'NotSupportedError' }))
    expect(() => playSfx('lose')).not.toThrow()
    await Promise.resolve()
    await Promise.resolve()
    // the dead file is not requested again
    playSfx('lose')
    expect(created).toHaveLength(1)
    // a decode or network error event also retires it
    playSfx('wrong')
    created[1].listeners.error()
    playSfx('wrong')
    expect(created).toHaveLength(2)
    expect(consoleError).not.toHaveBeenCalled()
    expect(consoleWarn).not.toHaveBeenCalled()
  })

  it('never throws when playback itself throws', () => {
    playImpl = () => {
      throw new Error('blocked')
    }
    expect(() => playSfx('win')).not.toThrow()
  })
})
