import { Engine } from '@babylonjs/core/Engines/engine.js'
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js'
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js'
import { Color4 } from '@babylonjs/core/Maths/math.color.js'
import { createSpringArm } from '../../../features/hub/scenes/shared/cameraCollision.js'
import { createFollowCamera } from '../../../features/hub/scenes/shared/camera.js'
import {
  alphaBehind,
  createOrbitKeys,
  wrapAngle,
} from '../../../features/hub/scenes/shared/orbit.js'
import { GRAPHICS_TO_TIER, getTier } from '../../../features/hub/scenes/shared/quality.js'
import {
  createSampler,
  decidePerf,
  lowerTier,
  perfRecord,
  readPerf,
  realSamplingOff,
  writePerf,
} from '../../../features/hub/perfWatch.js'
import { ARENA } from './arenaData.js'
import { labelScale, nudgeLabels } from './arenaRules.js'
import { KIND_LABEL, buildArenaWorld } from './arenaWorld.js'
import { createPlayers } from './arenaPlayers.js'
import { createLabelLayer } from './labelLayer.js'
import { createLocalPlayer } from './localPlayer.js'

const TIER_TO_GRAPHICS = Object.fromEntries(
  Object.entries(GRAPHICS_TO_TIER).map(([g, t]) => [t, g]),
)
const NAME_PX = 7.2

// the 3d yard for a botnet tag round
// getState returns the socket state, send is { move, sprint }, quality the Graphics setting, wardrobe the equipped items
// unlike the hub it never falls back to the 2d town: below the low tier it just stays on low
export function createArena({
  container,
  getState,
  send = {},
  quality = 'auto',
  wardrobe = null,
  params = new URLSearchParams(),
  watch = true,
  onTier = () => {},
}) {
  const canvas = document.createElement('canvas')
  canvas.className = 'tag-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  container.append(canvas)
  const labels = createLabelLayer(container)
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  const reduced = () => motionQuery.matches

  let tier = pickTier()
  const engine = new Engine(
    canvas,
    true,
    { antialias: true, stencil: true, powerPreference: 'high-performance' },
    false,
  )
  const manualWatch = realSamplingOff()
  let inputEnabled = true
  let built = null
  let disposed = false
  let rebuilds = 0
  let lastFrame = 0
  let lastTick = performance.now()
  let clock = 0
  let sent = null
  let perf = null

  function pickTier() {
    let name = getTier(params, quality).name
    if (quality === 'auto') {
      const saved = readPerf()
      if (saved) name = lowerTier(name, saved.tier)
    }
    return getTier(params, TIER_TO_GRAPHICS[name])
  }

  const applyScale = () =>
    engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, tier.renderScale))
  const observer = new ResizeObserver(() => {
    applyScale()
    engine.resize()
  })
  observer.observe(container)

  function assemble(resume = null) {
    applyScale()
    const world = buildArenaWorld({ engine, tier, reduced })
    const { scene } = world
    scene.clearColor = new Color4(0.09, 0.1, 0.22, 1)
    const st = getState()
    const me = st.players.find((p) => p.sid === st.sid)
    const spawn = resume?.pos ?? (me ? { x: me.x, z: me.z } : ARENA.spawns[0])
    const camera = createFollowCamera({
      scene,
      canvas,
      spawn,
      alpha: resume?.alpha ?? alphaBehind(0),
      beta: resume?.beta ?? 0.95,
      radius: resume?.radius ?? 13,
      fov: 0.95,
      far: 400,
      lookY: 0.5,
      limits: { radius: [8, 22], beta: [0.6, 1.25] },
    })
    camera.fov = 0.95
    // the spring arm may pull below the zoom floor, so the floor is enforced by hand
    camera.lowerRadiusLimit = 1
    const MIN_ZOOM = 8
    const orbit = createOrbitKeys({
      camera,
      enabled: () => inputEnabled,
      onReset: () => {
        camera.alpha = alphaBehind(lastPose.yaw)
        camera.beta = 0.95
        camera.radius = 13
      },
    })
    const arm = createSpringArm({ camera, boxes: world.blockers, reduced })
    const players = createPlayers({ scene, tier, reduced, shadow: world.shadow })

    const pipeline = new DefaultRenderingPipeline('arena-grade', true, scene, [camera])
    pipeline.bloomEnabled = tier.post
    pipeline.bloomThreshold = 0.85
    pipeline.bloomWeight = tier.desktop ? 0.4 : 0.3
    pipeline.bloomKernel = tier.bloomKernel
    pipeline.bloomScale = 0.5
    pipeline.fxaaEnabled = tier.post
    pipeline.imageProcessingEnabled = true
    const ip = pipeline.imageProcessing
    ip.toneMappingEnabled = true
    ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES
    ip.exposure = 1.1
    ip.contrast = 1.1

    let local = null
    let lastPose = { x: spawn.x, z: spawn.z, yaw: 0 }
    const goal = new Vector3()
    const clip = Matrix.Identity()

    function project(anchors) {
      const w = engine.getRenderWidth()
      const h = engine.getRenderHeight()
      if (!w || !h) return []
      const viewport = camera.viewport.toGlobal(w, h)
      const toCss = canvas.clientWidth / w
      const out = []
      for (const a of anchors) {
        const p = Vector3.Project(
          new Vector3(a.x, a.y, a.z),
          clip,
          scene.getTransformMatrix(),
          viewport,
        )
        if (p.z < 0 || p.z > 1) continue
        const x = p.x * toCss
        const y = p.y * toCss
        if (x < -80 || y < -40 || x > canvas.clientWidth + 80 || y > canvas.clientHeight + 40)
          continue
        const dist = Vector3.Distance(camera.position, new Vector3(a.x, a.y, a.z))
        const scale = labelScale(dist)
        const chips = (a.isBot ? 34 : 0) + (a.infected ? 16 : 0)
        out.push({
          ...a,
          x,
          y,
          scale,
          w: (a.text.length * NAME_PX + 22 + chips) * scale,
          h: 22 * scale,
        })
      }
      return out
    }

    function layoutLabels(st, serverNow) {
      const anchors = players.anchors().map((a) => ({ ...a, kind: 'player' }))
      for (const kiosk of world.kiosks) {
        const snap = st.stations.find((s) => s.id === kiosk.station.id)
        anchors.push({
          key: kiosk.station.id,
          text: KIND_LABEL[kiosk.station.kind],
          x: kiosk.station.x,
          y: 2.7,
          z: kiosk.station.z,
          kind: 'station',
          cooling: (snap?.coolingUntil ?? 0) > serverNow,
        })
      }
      const items = project(anchors)
      const offsets = nudgeLabels(items)
      labels.update(items.map((it) => ({ ...it, y: it.y - (offsets.get(it.key) ?? 0) })))
    }

    function frame(dt) {
      arm.restore()
      if (camera.radius < MIN_ZOOM) camera.radius = MIN_ZOOM
      clock += dt
      const st = getState()
      const serverNow = Date.now() + (st.offset ?? 0)
      players.sync(st.players, st.sid, serverNow, wardrobe)
      world.setStations(st.stations, serverNow)
      const mine = players.entries.get(st.sid)
      if (!local && mine) {
        local = createLocalPlayer({
          spawn: { x: mine.x, z: mine.z },
          camera,
          reduced,
          onSprint: () => send.sprint?.(),
        })
      }
      const playing = st.phase === 'playing'
      if (local && mine) {
        local.setEnabled(inputEnabled && playing)
        const pose = local.update(dt, playing ? mine.server : null)
        lastPose = pose
        players.setLocal(mine, pose, dt)
        if (playing) sendMove(pose)
        const k = reduced() ? 1 : 1 - Math.exp(-dt * 8)
        goal.set(pose.x, 0.5, pose.z)
        Vector3.LerpToRef(camera.target, goal, k, camera.target)
      }
      players.update(dt, clock)
      world.update(clock)
      orbit.update(dt)
      arm.update(dt)
      camera.fov = canvas.clientHeight > canvas.clientWidth ? 1.25 : 0.95
      layoutLabels(st, serverNow)
    }

    // moves go out only when the spot or heading changed; the socket itself caps the rate at 20 a second
    function sendMove(pose) {
      const yaw = wrapAngle(pose.yaw)
      if (
        sent &&
        Math.hypot(pose.x - sent.x, pose.z - sent.z) < 0.02 &&
        Math.abs(wrapAngle(yaw - sent.yaw)) < 0.03
      )
        return
      if (
        send.move?.({ x: Math.round(pose.x * 100) / 100, z: Math.round(pose.z * 100) / 100, yaw })
      )
        sent = { x: pose.x, z: pose.z, yaw }
    }

    return {
      scene,
      camera,
      world,
      players,
      frame,
      local: () => local,
      arm: () => ({
        ...arm.state(),
        position: camera.position.asArray(),
        target: camera.target.asArray(),
      }),
      resume: () => ({
        pos: { x: lastPose.x, z: lastPose.z },
        alpha: camera.alpha,
        beta: camera.beta,
        radius: camera.radius,
      }),
      dispose() {
        local?.dispose()
        orbit.dispose()
        players.dispose()
        pipeline.dispose()
        world.dispose()
        scene.dispose()
      },
    }
  }

  function lowerTo(name) {
    const resume = built.resume()
    built.dispose()
    tier = getTier(params, TIER_TO_GRAPHICS[name])
    rebuilds += 1
    built = assemble(resume)
    startSampler()
    onTier(tier.name)
  }

  // same watch as the hub: median fps over a few seconds, lowering one tier per struggle; below low it stays on low
  function startSampler() {
    perf =
      watch && quality === 'auto'
        ? createSampler({
            onResult: (fps) => {
              const decision = decidePerf({ tier: tier.name, fps, explicit3d: true })
              const record = perfRecord(decision)
              if (record) writePerf(record)
              if (decision.action === 'lower') lowerTo(decision.tier)
            },
          })
        : null
  }

  built = assemble()
  startSampler()
  engine.runRenderLoop(() => {
    if (disposed) return
    const now = performance.now()
    if (tier.fpsCap && now - lastFrame < 1000 / tier.fpsCap - 3) return
    lastFrame = now
    const dt = Math.min(0.05, (now - lastTick) / 1000)
    built.frame(dt)
    built.scene.render()
    if (perf && !manualWatch)
      perf.frame(now - lastTick, !document.hidden && getState().phase === 'playing')
    lastTick = now
  })

  const api = {
    setInputEnabled(value) {
      inputEnabled = Boolean(value)
    },
    jump: () => built.local()?.jump(),
    sprint: () => built.local()?.sprint(),
    setJoystick: (x, y) => built.local()?.setJoystick(x, y),
    tier: () => tier.name,
    dispose() {
      if (disposed) return
      disposed = true
      observer.disconnect()
      engine.stopRenderLoop()
      try {
        built?.dispose()
      } catch (error) {
        console.warn('arena teardown', error)
      }
      labels.dispose()
      engine.dispose()
      canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext()
      canvas.remove()
      if (import.meta.env.DEV && window.__tag?.arena === api) delete window.__tag
    },
  }

  if (import.meta.env.DEV) {
    window.__tag = {
      arena: api,
      debug: {
        tier: () => tier.name,
        rebuilds: () => rebuilds,
        labels: () => labels.count(),
        simulateFps: (fps) => perf?.feed(fps),
        activeMeshes: () => built.scene.getActiveMeshes().length,
        players: () =>
          [...built.players.entries.values()].map((e) => ({
            sid: e.sid,
            me: e.sid === getState().sid,
            username: e.username,
            x: Math.round(e.x * 100) / 100,
            z: Math.round(e.z * 100) / 100,
            infected: e.infected,
            immune: e.immune,
            bot: e.isBot,
            rig: Boolean(e.rig),
          })),
        you: () => {
          const p = built.local()?.position()
          return p ? { x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 } : null
        },
        walkTo: (x, z) => built.local()?.walkTo(x, z),
        arm: () => built.arm(),
        scene: () => built.scene,
        camera: () => ({
          alpha: built.camera.alpha,
          beta: built.camera.beta,
          radius: built.camera.radius,
        }),
      },
    }
  }
  return api
}
