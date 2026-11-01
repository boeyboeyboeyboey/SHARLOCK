import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// which renderer starts, and what happens when webgpu fails. this drives the choice with fake engines: no gpu is
// used and nothing is rendered, so it says nothing about how the scene looks on webgpu
const made = vi.hoisted(() => ({ gpu: [], gl: [], supported: true, initFails: false }))
vi.mock('@babylonjs/core/Engines/webgpuEngine.js', () => ({
  WebGPUEngine: class {
    static get IsSupportedAsync() {
      return Promise.resolve(made.supported)
    }
    constructor(canvas, options) {
      this.canvas = canvas
      this.options = options
      this.disposed = false
      made.gpu.push(this)
    }
    initAsync() {
      return made.initFails ? Promise.reject(new Error('no adapter')) : Promise.resolve()
    }
    dispose() {
      this.disposed = true
    }
  },
}))
vi.mock('@babylonjs/core/Engines/engine.js', () => ({
  Engine: class {
    constructor(canvas) {
      this.canvas = canvas
      made.gl.push(this)
    }
  },
}))
vi.mock('@babylonjs/core/Engines/WebGPU/Extensions/index.js', () => ({}))
vi.mock('@babylonjs/core/scene.js', () => ({ Scene: class {} }))
vi.mock('@babylonjs/core/Physics/physicsEngineComponent.js', () => ({}))
vi.mock('@babylonjs/core/Meshes/instancedMesh.js', () => ({}))
vi.mock('@babylonjs/core/Meshes/thinInstanceMesh.js', () => ({}))
vi.mock('@babylonjs/core/Physics/v2/Plugins/havokPlugin.js', () => ({ HavokPlugin: class {} }))
vi.mock('@babylonjs/havok', () => ({ default: () => Promise.resolve({}) }))
vi.mock('@babylonjs/havok/lib/esm/HavokPhysics.wasm?url', () => ({ default: '' }))

const { createEngine } = await import('../engine.js')
const params = (text = '') => new URLSearchParams(text)

let canvas
beforeEach(() => {
  made.gpu.length = 0
  made.gl.length = 0
  made.supported = true
  made.initFails = false
  vi.stubGlobal('navigator', { gpu: {} })
  const holder = document.createElement('div')
  canvas = document.createElement('canvas')
  canvas.className = 'hub-canvas'
  holder.append(canvas)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('renderer choice', () => {
  it('prefers webgpu when the browser has an adapter', async () => {
    const result = await createEngine(canvas, params())
    expect(result.type).toBe('webgpu')
    expect(result.canvas).toBe(canvas)
    expect(made.gl).toHaveLength(0)
  })

  it('points the shader compilers at this origin, never a cdn', async () => {
    await createEngine(canvas, params())
    const { glslangOptions, twgslOptions } = made.gpu[0].options
    expect(glslangOptions.jsPath.startsWith('/')).toBe(true)
    expect(twgslOptions.wasmPath.startsWith('/')).toBe(true)
  })

  it('uses webgl2 without navigator.gpu', async () => {
    vi.stubGlobal('navigator', {})
    const result = await createEngine(canvas, params())
    expect(result.type).toBe('webgl2')
    expect(made.gpu).toHaveLength(0)
  })

  it('uses webgl2 when no adapter is available', async () => {
    made.supported = false
    const result = await createEngine(canvas, params())
    expect(result.type).toBe('webgl2')
    expect(made.gpu).toHaveLength(0)
  })

  it('honours ?renderer=webgl2', async () => {
    const result = await createEngine(canvas, params('renderer=webgl2'))
    expect(result.type).toBe('webgl2')
    expect(made.gpu).toHaveLength(0)
  })

  it('falls back on a fresh canvas when webgpu fails to start', async () => {
    made.initFails = true
    const result = await createEngine(canvas, params())
    expect(result.type).toBe('webgl2')
    expect(made.gpu[0].disposed).toBe(true)
    // a canvas that asked for a webgpu context cannot hand out webgl2
    expect(result.canvas).not.toBe(canvas)
    expect(result.canvas.className).toBe('hub-canvas')
    expect(canvas.isConnected).toBe(false)
    expect(made.gl[0].canvas).toBe(result.canvas)
  })
})
