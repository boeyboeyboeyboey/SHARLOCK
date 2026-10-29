import { afterEach, describe, expect, it } from 'vitest'
import {
  NOTICE_KEY,
  TOWN_MODE_KEY,
  noticeKey,
  readStoredMode,
  resolveMode,
  useTownMode,
} from '../useTownMode.js'

afterEach(() => localStorage.clear())

const ok = { verdict: '3d', tier: 'desktop', reasons: [] }
const software = { verdict: '2d', tier: 'desktop', reasons: ['software-renderer'] }
const noWebgl2 = { verdict: '2d', tier: 'desktop', reasons: ['no-webgl2'] }

const phone = { verdict: '2d', tier: 'desktop', reasons: ['phone'] }

describe('phone default', () => {
  it('starts on 2d, lets a stored 3d choice win and asks before switching', () => {
    expect(resolveMode({ stored: null, device: phone, failed: false })).toEqual({ mode: '2d', forced: true, auto: true, locked: false })
    expect(resolveMode({ stored: '3d', device: phone, failed: false })).toMatchObject({ mode: '3d', forced: false })
    const town = useTownMode({ device: phone })
    expect(town.mode.value).toBe('2d')
    town.toggle()
    expect(town.warning.value).toBe(true)
    expect(readStoredMode()).toBeNull()
    town.confirm3d()
    expect(town.mode.value).toBe('3d')
  })
})

describe('town mode', () => {
  it('defaults to 3d and honours a stored choice', () => {
    expect(resolveMode({ stored: null, device: ok, failed: false })).toMatchObject({ mode: '3d', forced: false })
    expect(resolveMode({ stored: '2d', device: ok, failed: false })).toMatchObject({ mode: '2d', forced: false })
  })

  it('locks to 2d without webgl2 or after the hub failed', () => {
    expect(resolveMode({ stored: '3d', device: noWebgl2, failed: false })).toMatchObject({ mode: '2d', forced: true, locked: true })
    expect(resolveMode({ stored: '3d', device: ok, failed: true })).toMatchObject({ mode: '2d', forced: true, locked: true })
  })

  it('falls back to 2d automatically on software rendering but lets an explicit 3d win', () => {
    expect(resolveMode({ stored: null, device: software, failed: false })).toEqual({ mode: '2d', forced: true, auto: true, locked: false })
    expect(resolveMode({ stored: '3d', device: software, failed: false })).toMatchObject({ mode: '3d', forced: false })
    expect(resolveMode({ stored: '2d', device: software, failed: false })).toMatchObject({ mode: '2d', forced: false })
  })

  it('ignores an unknown stored value', () => {
    localStorage.setItem(TOWN_MODE_KEY, 'vr')
    expect(readStoredMode()).toBeNull()
  })

  it('persists the explicit toggle but not a forced fallback', () => {
    const town = useTownMode({ device: ok })
    expect(town.mode.value).toBe('3d')
    town.toggle()
    expect(localStorage.getItem(TOWN_MODE_KEY)).toBe('2d')
    town.toggle()
    expect(localStorage.getItem(TOWN_MODE_KEY)).toBe('3d')
    town.markFailed()
    expect(town.mode.value).toBe('2d')
    expect(town.forced.value).toBe(true)
    expect(town.locked.value).toBe(true)
    town.toggle()
    expect(localStorage.getItem(TOWN_MODE_KEY)).toBe('3d')
  })

  it('keeps the toggle on an automatic 2d, asks first and persists only a confirmed 3d', () => {
    const town = useTownMode({ device: software })
    expect(town.mode.value).toBe('2d')
    expect(town.auto.value).toBe(true)
    expect(town.locked.value).toBe(false)
    expect(localStorage.getItem(TOWN_MODE_KEY)).toBeNull()
    town.toggle()
    expect(town.warning.value).toBe(true)
    expect(town.mode.value).toBe('2d')
    town.cancel3d()
    expect(town.warning.value).toBe(false)
    expect(town.mode.value).toBe('2d')
    expect(localStorage.getItem(TOWN_MODE_KEY)).toBeNull()
    town.toggle()
    town.confirm3d()
    expect(town.mode.value).toBe('3d')
    expect(localStorage.getItem(TOWN_MODE_KEY)).toBe('3d')
    // a later visit goes straight to 3d
    expect(useTownMode({ device: software }).mode.value).toBe('3d')
  })

  it('does not toggle without webgl2', () => {
    const town = useTownMode({ device: noWebgl2 })
    town.toggle()
    expect(town.warning.value).toBe(false)
    expect(town.mode.value).toBe('2d')
  })

  it('remembers a dismissed notice per reason set', () => {
    const town = useTownMode({ device: software })
    expect(town.noticeVisible.value).toBe(true)
    town.dismissNotice()
    expect(town.noticeVisible.value).toBe(false)
    expect(localStorage.getItem(NOTICE_KEY)).toBe('software-renderer')
    expect(useTownMode({ device: software }).noticeVisible.value).toBe(false)
    const other = { verdict: '2d', tier: 'desktop', reasons: ['software-renderer', 'x'] }
    expect(useTownMode({ device: other }).noticeVisible.value).toBe(true)
  })

  it('never hides the locked fallback notice and shows none on a 3d device', () => {
    localStorage.setItem(NOTICE_KEY, noticeKey(['no-webgl2']))
    expect(useTownMode({ device: noWebgl2 }).noticeVisible.value).toBe(true)
    expect(useTownMode({ device: ok }).noticeVisible.value).toBe(false)
  })
})
