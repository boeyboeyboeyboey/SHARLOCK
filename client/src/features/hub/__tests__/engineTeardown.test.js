import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// the teardown order with fake engines and a fake scene build; nothing here touches a gpu
const world = vi.hoisted(() => ({
  build: null,
  sceneThrows: false,
  engines: [],
  scenes: [],
}))
vi.mock('@babylonjs/core/Engines/webgpuEngine.js', () => ({
  WebGPUEngine: { IsSupportedAsync: Promise.resolve(false) },
}))
vi.mock('@babylonjs/core/Engines/engine.js', () => ({
  Engine: class {
    constructor() {
      this.dispose = vi.fn()
      this.stopRenderLoop = vi.fn()
      this.setHardwareScalingLevel = vi.fn()
      this.resize = vi.fn()
      this.runRenderLoop = vi.fn()
      this.getFps = () => 60
      world.engines.push(this)
    }
  },
}))
vi.mock('@babylonjs/core/Engines/WebGPU/Extensions/index.js', () => ({}))
vi.mock('@babylonjs/core/scene.js', () => ({
  Scene: class {
    constructor() {
      this.enablePhysics = vi.fn()
      this.onAfterRenderObservable = { addOnce: (fn) => fn() }
      this.dispose = vi.fn(() => {
        if (world.sceneThrows) throw new Error('disposed twice')
      })
      world.scenes.push(this)
    }
  },
}))
vi.mock('@babylonjs/core/Physics/physicsEngineComponent.js', () => ({}))
vi.mock('@babylonjs/core/Meshes/instancedMesh.js', () => ({}))
vi.mock('@babylonjs/core/Meshes/thinInstanceMesh.js', () => ({}))
vi.mock('@babylonjs/core/Physics/v2/Plugins/havokPlugin.js', () => ({ HavokPlugin: class {} }))
vi.mock('@babylonjs/havok', () => ({ default: () => Promise.resolve({}) }))
vi.mock('@babylonjs/havok/lib/esm/HavokPhysics.wasm?url', () => ({ default: '' }))
vi.mock('../scenes/a-wharf.js', () => ({ build: (options) => world.build(options) }))

const { createHub } = await import('../engine.js')

const api = () => ({ select() {}, setInputPaused() {} })
let container
beforeEach(() => {
  world.engines.length = 0
  world.scenes.length = 0
  world.sceneThrows = false
  world.build = async () => ({ api: api() })
  container = document.createElement('div')
  document.body.append(container)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }))
  window.matchMedia = globalThis.matchMedia
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  container.remove()
})

const start = () => createHub({ container, params: new URLSearchParams('renderer=webgl2') })

describe('hub teardown', () => {
  it('still frees the engine and the canvas when the scene refuses to dispose', async () => {
    const hub = start()
    await hub.ready
    world.sceneThrows = true
    hub.dispose()
    await vi.waitFor(() => expect(world.engines[0].dispose).toHaveBeenCalledTimes(1))
    expect(container.querySelector('canvas')).toBeNull()
    expect(console.warn).toHaveBeenCalled()
  })

  it('runs every scene cleanup even when one of them throws, last added first', async () => {
    const order = []
    world.build = async ({ disposers }) => {
      disposers.push(() => order.push('first'))
      disposers.push(() => {
        order.push('second')
        throw new Error('nope')
      })
      disposers.push(() => order.push('third'))
      return { api: api() }
    }
    const hub = start()
    await hub.ready
    hub.dispose()
    await vi.waitFor(() => expect(world.engines[0].dispose).toHaveBeenCalled())
    expect(order).toEqual(['third', 'second', 'first'])
  })

  it('undoes a build that threw halfway', async () => {
    const cleanup = vi.fn()
    world.build = async ({ disposers }) => {
      disposers.push(cleanup)
      throw new Error('shader failed')
    }
    const hub = start()
    await expect(hub.ready).rejects.toThrow('shader failed')
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(world.engines[0].dispose).toHaveBeenCalledTimes(1)
    expect(container.querySelector('canvas')).toBeNull()
  })

  it('stops a build that was left, and cleans up what it had made', async () => {
    const cleanup = vi.fn()
    let carriedOn = false
    let release
    const gate = new Promise((resolve) => (release = resolve))
    world.build = async ({ disposers, isDisposed }) => {
      disposers.push(cleanup)
      await gate
      if (isDisposed()) return null
      carriedOn = true
      return { api: api() }
    }
    const hub = start()
    await vi.waitFor(() => expect(world.scenes).toHaveLength(1))
    await vi.waitFor(() => expect(world.scenes[0].enablePhysics).toHaveBeenCalled())
    hub.dispose()
    release()
    await vi.waitFor(() => expect(world.engines[0].dispose).toHaveBeenCalled())
    expect(carriedOn).toBe(false)
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(hub.state.ready).toBe(false)
  })

  it('counts each disposal once', async () => {
    const hub = start()
    await hub.ready
    const before = hub.state.disposals
    hub.dispose()
    hub.dispose()
    await vi.waitFor(() => expect(hub.state.disposals).toBe(before + 1))
  })
})
