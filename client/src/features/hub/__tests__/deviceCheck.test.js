import { describe, expect, it, vi } from 'vitest'
import { evaluateDevice, probeGraphics, readHardware } from '../deviceCheck.js'

const good = { webgl2: true, softwareRenderer: false, baseTier: 'desktop' }

// a fake document whose canvases hand out the contexts a test describes
function fakeDoc({ normal = true, strict = true, renderer = 'Apple GPU' } = {}) {
  const lost = []
  const context = () => ({
    getExtension: (name) =>
      name === 'WEBGL_debug_renderer_info'
        ? { UNMASKED_RENDERER_WEBGL: 1 }
        : { loseContext: () => lost.push(name) },
    getParameter: () => renderer,
  })
  return {
    lost,
    createElement: () => ({
      getContext: (_type, attributes) => {
        const wanted = attributes?.failIfMajorPerformanceCaveat ? strict : normal
        return wanted ? context() : null
      },
    }),
  }
}

describe('evaluateDevice', () => {
  it('goes to 3d with the heuristic tier when nothing is wrong', () => {
    expect(evaluateDevice(good)).toEqual({ verdict: '3d', tier: 'desktop', reasons: [] })
    expect(evaluateDevice({ ...good, baseTier: 'compact', deviceMemory: 8, cores: 8 }).tier).toBe('compact')
  })

  it('opens the 2d map on a phone, after the webgl checks', () => {
    expect(evaluateDevice({ ...good, phone: true })).toEqual({ verdict: '2d', tier: 'desktop', reasons: ['phone'] })
    expect(evaluateDevice({ ...good, webgl2: false, phone: true }).reasons).toEqual(['no-webgl2'])
  })

  it('picks 2d without webgl2', () => {
    expect(evaluateDevice({ ...good, webgl2: false })).toMatchObject({ verdict: '2d', reasons: ['no-webgl2'] })
  })

  it('picks 2d for software rendering', () => {
    expect(evaluateDevice({ ...good, softwareRenderer: true })).toMatchObject({
      verdict: '2d',
      reasons: ['software-renderer'],
    })
  })

  it('starts low-end devices on 3d at the low tier', () => {
    expect(evaluateDevice({ ...good, saveData: true })).toEqual({ verdict: '3d', tier: 'low', reasons: ['save-data'] })
    expect(evaluateDevice({ ...good, deviceMemory: 2 })).toMatchObject({ tier: 'low', reasons: ['low-memory'] })
    expect(evaluateDevice({ ...good, deviceMemory: 4 }).tier).toBe('desktop')
    expect(evaluateDevice({ ...good, cores: 2 })).toMatchObject({ tier: 'low', reasons: ['low-cores'] })
    expect(evaluateDevice({ ...good, cores: 4 }).tier).toBe('desktop')
    expect(evaluateDevice({ ...good, saveData: true, deviceMemory: 1, cores: 1 }).reasons).toEqual([
      'save-data',
      'low-memory',
      'low-cores',
    ])
  })

  it('treats unknown hardware numbers as fine', () => {
    expect(evaluateDevice({ ...good, deviceMemory: undefined, cores: undefined }).tier).toBe('desktop')
  })
})

describe('probeGraphics', () => {
  it('reports a healthy gpu and releases both probe contexts', () => {
    const doc = fakeDoc()
    expect(probeGraphics(doc)).toEqual({ webgl2: true, softwareRenderer: false })
    expect(doc.lost).toHaveLength(2)
  })

  it('reports missing webgl2', () => {
    expect(probeGraphics(fakeDoc({ normal: false }))).toEqual({ webgl2: false, softwareRenderer: false })
  })

  it('flags software rendering when only the strict context is refused', () => {
    expect(probeGraphics(fakeDoc({ strict: false }))).toEqual({ webgl2: true, softwareRenderer: true })
  })

  it.each(['Google SwiftShader', 'llvmpipe (LLVM 15)', 'Mesa Software Rasterizer', 'Microsoft Basic Render Driver'])(
    'flags the renderer string %s',
    (renderer) => {
      expect(probeGraphics(fakeDoc({ renderer })).softwareRenderer).toBe(true)
    },
  )

  it('survives a context call that throws', () => {
    const doc = { createElement: () => ({ getContext: vi.fn(() => { throw new Error('blocked') }) }) }
    expect(probeGraphics(doc).webgl2).toBe(false)
  })
})

describe('readHardware', () => {
  it('reads the optional navigator hints', () => {
    expect(readHardware({ connection: { saveData: true }, deviceMemory: 2, hardwareConcurrency: 2 })).toEqual({
      saveData: true,
      deviceMemory: 2,
      cores: 2,
    })
    expect(readHardware({})).toEqual({ saveData: false, deviceMemory: undefined, cores: undefined })
  })
})
