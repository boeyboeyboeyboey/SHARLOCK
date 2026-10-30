import { roomBudget } from './renderMode.js'
import { ndcToCss, rectFromCorners } from './heroRect.js'
import { roomFor } from './rooms/index.js'

// counted across instances so tests can prove an interior was disposed
let mounts = 0
let disposals = 0

// starts a babylon engine on the canvas for one room; renderMode is 'loop' or 'single'
// returns { state, ready, dispose }; state carries drawCalls and frames for tests
export function createInterior({
  canvas,
  roomId,
  tier,
  renderMode,
  onFailed = () => {},
  onPerf = null,
  onHero = null,
}) {
  const state = {
    ready: false,
    drawCalls: 0,
    frames: 0,
    engine: null,
    room: roomId,
    running: false,
  }
  let disposed = false
  let torn = false
  let engine = null
  let scene = null
  let room = null
  let observer = null
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  const reduced = () => motionQuery.matches || renderMode === 'single'

  async function start() {
    const entry = roomFor(roomId)
    if (!entry) throw new Error(`no interior for ${roomId}`)
    const [{ Engine }, { Scene }, { Vector3 }, { FreeCamera }, { SceneInstrumentation }, build] =
      await Promise.all([
        import('@babylonjs/core/Engines/engine.js'),
        import('@babylonjs/core/scene.js'),
        import('@babylonjs/core/Maths/math.vector.js'),
        import('@babylonjs/core/Cameras/freeCamera.js'),
        import('@babylonjs/core/Instrumentation/sceneInstrumentation.js'),
        entry.load(),
      ])
    if (disposed) return
    engine = new Engine(
      canvas,
      tier.name !== 'low',
      { stencil: false, powerPreference: 'high-performance' },
      false,
    )
    const applyScale = () =>
      engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, tier.renderScale))
    applyScale()
    scene = new Scene(engine)
    scene.skipPointerMovePicking = true
    room = build({ scene, engine, tier, budget: roomBudget(tier.name), reduced })
    // a hero room pins the camera to the hero view and never drifts, so the panel stays on its prop
    const hero = entry.hero ?? null
    const view = hero ? hero.camera : room.camera
    const [cx, cy, cz] = view.pos
    const target = new Vector3(...view.target)
    const camera = new FreeCamera('interior-camera', new Vector3(cx, cy, cz), scene)
    camera.setTarget(target)
    camera.fov = view.fov
    camera.minZ = 0.1
    camera.maxZ = 40
    camera.inputs.clear()
    const [driftX, driftY, period] = hero ? [0, 0, 1] : room.camera.drift
    let heroDirty = Boolean(hero && onHero)
    const corners = hero ? hero.corners.map((c) => new Vector3(...c)) : []
    // projects the prop corners with the transform of the frame just drawn
    const reportHero = () => {
      heroDirty = false
      const stage = { width: canvas.clientWidth, height: canvas.clientHeight }
      if (!stage.width || !stage.height) return
      const matrix = scene.getTransformMatrix()
      const points = corners.map((c) => {
        const p = Vector3.TransformCoordinates(c, matrix)
        return ndcToCss([p.x, p.y], stage)
      })
      onHero(rectFromCorners(points, stage))
    }
    const instrumentation = new SceneInstrumentation(scene)
    let time = 0
    let lastTick = performance.now()
    const frame = () => {
      const now = performance.now()
      const dt = Math.min((now - lastTick) / 1000, 0.05)
      lastTick = now
      time += dt
      // drift is frozen by reduced motion and in single frame mode
      const k = reduced() ? 0 : (Math.PI * 2) / period
      camera.position.x = cx + Math.sin(time * k) * driftX
      camera.position.y = cy + Math.sin(time * k * 1.7 + 1) * driftY
      camera.setTarget(target)
      room.update(dt, time)
      scene.render()
      state.frames += 1
      state.drawCalls = Math.round(instrumentation.drawCallsCounter.current)
      state.activeMeshes = scene.getActiveMeshes().length
      if (heroDirty) reportHero()
      onPerf?.(dt * 1000)
    }
    observer = new ResizeObserver(() => {
      applyScale()
      engine.resize()
      heroDirty = Boolean(hero && onHero)
      // a stopped loop draws nothing new, so a resize repaints once
      if (!state.running && !disposed) frame()
    })
    observer.observe(canvas.parentElement ?? canvas)
    frame()
    // the draw call counter fills in after a first full frame
    if (renderMode === 'single') frame()
    if (renderMode === 'loop') {
      state.running = true
      engine.runRenderLoop(frame)
    }
    state.engine = 'webgl2'
    mounts += 1
    state.ready = true
  }

  function teardown() {
    if (torn) return
    torn = true
    observer?.disconnect()
    engine?.stopRenderLoop()
    state.running = false
    try {
      room?.dispose()
    } catch (error) {
      console.warn('interior teardown', error)
    }
    scene?.dispose()
    engine?.dispose()
    canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext()
    state.ready = false
    disposals += 1
  }

  const ready = start().catch((error) => {
    if (!disposed) {
      console.error('interior failed to start', error)
      onFailed(error)
    }
    disposed = true
    teardown()
  })

  if (import.meta.env.DEV) {
    window.__interior = {
      state,
      get mounts() {
        return mounts
      },
      get disposals() {
        return disposals
      },
    }
  }

  return {
    state,
    ready,
    dispose() {
      disposed = true
      ready.then(teardown, teardown)
    },
  }
}
