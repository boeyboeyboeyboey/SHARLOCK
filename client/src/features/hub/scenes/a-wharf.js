import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody.js';
import { PhysicsShapeBox, PhysicsShapeContainer } from '@babylonjs/core/Physics/v2/physicsShape.js';
import { PhysicsMotionType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js';
import { createFollowCamera, freeCamera } from './shared/camera.js';
import { createSpringArm } from './shared/cameraCollision.js';
import { createDoors, doorSpot } from './shared/doors.js';
import { alphaBehind, createOrbitKeys } from './shared/orbit.js';
import { createInstrumentation } from './shared/instrumentation.js';
import { createPlayer } from './shared/player.js';
import { getTier } from './shared/quality.js';
import { createPlanarMirror } from './shared/mirror.js';
import { loadIndexes, probeOptionalPlates } from './shared/assets.js';
import { parseWardrobeParam } from '../../../data/wardrobeLook.js';
import { createSharlock } from './shared/sharlock.js';
import { createWorld } from './wharf/world.js';
import { createSigns } from './wharf/signs.js';
import { buildGround } from './wharf/ground.js';
import { buildDistrict } from './wharf/district.js';
import { buildLamps, buildCargo, buildNewsstand, buildCraneTower } from './wharf/props.js';
import { buildBridge } from './wharf/bridge.js';
import { buildBackdrop } from './wharf/backdrop.js';
import { buildSkyline, plateBase } from './wharf/skyline.js';
import { buildFarBank } from './wharf/farbank.js';
import { createSky } from './wharf/sky.js';
import { createWater, waterClock } from './wharf/water.js';
import { buildBoats } from './wharf/boats.js';
import { buildLife } from './wharf/life.js';
import { buildTownsfolk } from './wharf/townsfolk.js';
import { createRemotePeers } from '../presence/remotePeers.js';
import { buildOutskirts } from './wharf/outskirts.js';
import { finds } from './wharf/finds.js';
import { nearestFind } from '../discoveries.js';
import { npcs } from './wharf/npcs.js';
import { setupLook } from './wharf/look.js';
import { applyToon } from './wharf/toon.js';
import { selectionViews } from './wharf/views.js';
import { createHubSfx } from '../audio/hubSfx.js';
import { destinations, heightAt, obstacles, paths, spawn, walkable, waterY } from './wharf/layout.js';

// pixels kept clear between the subject and the bar
const LIFT_GAP = 32;

export async function build({ engine, scene, canvas, state, notify, params, joystick, spawnAt = null, quality = 'auto', resumeAt = null, wardrobe = null }) {
  const tier = getTier(params, quality);
  state.desktop = tier.desktop;
  state.tier = tier.name;
  const reduced = () => state.reducedMotion;
  const t0 = performance.now();
  const disposers = [];

  // higher three quarter follow view from the south, looking up the main street toward the river and the sun. close on sharlock
  // for wide screens, pulled back on tall ones so the street still fits
  // coming back from a game, stand just outside that door facing the street with the camera behind
  const returnTo = destinations.find((d) => d.id === spawnAt);
  const origin = resumeAt ? { x: resumeAt.x, z: resumeAt.z, heading: 0 } : returnTo ? { ...doorSpot(returnTo, returnTo.reach + 2.3), heading: returnTo.face } : { ...spawn, heading: 0 };
  const aspect = (canvas.clientWidth || 1440) / (canvas.clientHeight || 900);
  const camera = createFollowCamera({
    scene,
    canvas,
    spawn: origin,
    alpha: -Math.PI / 2 + 0.14,
    beta: 1.24,
    radius: aspect >= 1.45 ? 16 : 16 + (1.45 - aspect) * 15,
    fov: 0.95,
    far: 1400,
    limits: { radius: [9, 38], beta: [0.85, 1.4] },
  });
  if (returnTo) camera.alpha = alphaBehind(returnTo.face);
  const indexes = loadIndexes();
  // the south plates are optional, so they are probed while the district builds
  const probing = probeOptionalPlates(indexes, plateBase);
  const look = setupLook({ scene, camera, tier });
  disposers.push(() => look.dispose());

  // static district: every surface lands in a per-material batch, merged at the end
  const signs = createSigns(scene);
  const world = createWorld(scene, { signs });
  disposers.push(() => {
    world.dispose();
    signs.texture.dispose();
  });
  const ground = buildGround({ scene, world });
  const district = buildDistrict({ world, signs });
  const backdrop = buildBackdrop({ world, signs, tier });
  const news = buildNewsstand({ world, signs, info: destinations.find((d) => d.id === 'threat-briefing'), B: district.B });
  const lamps = buildLamps({ scene, world, extraHeads: [...district.lampHeads, news.lamp], reduced });
  disposers.push(() => lamps.dispose());
  const cargo = buildCargo({ scene, world, barrels: district.crates.filter((c) => c.kind === 'barrel').map((c) => c.at) });
  buildCraneTower({ world });
  buildOutskirts({ world });
  buildBridge({ world });
  const built = world.finish();
  look.cast(built.casters);
  for (const mesh of [...ground.meshes, ...cargo.meshes]) {
    mesh.receiveShadows = true;
    look.csm.addShadowCaster(mesh);
  }
  disposers.push(() => [...built.meshes, ...ground.meshes, ...cargo.meshes].forEach((m) => m.dispose()));

  // sky, river, far skyline, boats and street life
  const sky = createSky(scene, tier.desktop ? {} : { width: 1024, height: 256 });
  disposers.push(() => sky.dispose());
  await probing;
  const skyline = await buildSkyline({ scene, indexes, tier });
  disposers.push(() => skyline.dispose());
  // river wall in front of the mid plates, hides their painted quay and the cross fades
  const farBank = buildFarBank({ scene, brick: world.textures.brickRed, tier });
  disposers.push(() => farBank.dispose());
  const boats = buildBoats({ scene, world, tier, reduced });
  disposers.push(() => boats.dispose());
  const life = buildLife({ scene, world, tier, reduced, chimneys: district.chimneys, farStacks: backdrop.smokeStacks });
  disposers.push(() => life.dispose());
  const townsfolk = buildTownsfolk({ scene, tier, reduced, look });
  disposers.push(() => townsfolk.dispose());

  // planar reflection of boats, lamps, lit windows, skyline and the bridge, desktop only
  let mirror = null;
  if (tier.mirror) {
    const reflectKeys = ['brickRed', 'brickYellow', 'stone', 'slate', 'wash', 'plank', 'windowLit', 'bridgeStone', 'bridgeWash', 'bridgePlank', 'bridgeSlate'];
    const list = [...built.meshes.filter((m) => reflectKeys.some((k) => m.name === `static-${k}`)), ...skyline.meshes, ...farBank.meshes, ...boats.reflect, ...lamps.meshes.slice(0, 1)];
    mirror = createPlanarMirror(scene, { name: 'thames-mirror', y: waterY, ratio: tier.mirrorRatio, list });
    mirror.clearColor = new Color4(0, 0, 0, 0);
    // node materials do not register their render targets, so the scene is told to refresh it every frame
    scene.customRenderTargets.push(mirror);
    disposers.push(() => {
      scene.customRenderTargets.splice(scene.customRenderTargets.indexOf(mirror), 1);
      mirror.dispose();
    });
  }
  const water = createWater(scene, { mirror });
  disposers.push(() => {
    water.material.dispose();
    water.dispose();
  });

  // colliders: one big floor plus blocks for the kiosk, crates and benches
  const colliderNode = new TransformNode('colliders', scene);
  const compound = new PhysicsShapeContainer(scene);
  const box = (x, y, z, sx, sy, sz) => compound.addChild(new PhysicsShapeBox(new Vector3(x, y, z), Quaternion.Identity(), new Vector3(sx, sy, sz), scene));
  box(0, -0.5, 10, 220, 1, 220);
  for (const r of obstacles) box((r.x0 + r.x1) / 2, 1.3, (r.z0 + r.z1) / 2, r.x1 - r.x0, 2.6, r.z1 - r.z0);
  // game keepers stand off the lanes; a small post each keeps sharlock from walking through them (wanderers carry their own moving collider)
  for (const n of npcs.filter((npc) => npc.kind === 'game')) box(n.x, 0.9, n.z, 0.8, 1.8, 0.8);
  for (const n of finds.filter((find) => find.kind === 'npc')) box(n.x, 0.9, n.z, 0.8, 1.8, 0.8);
  const colliderBody = new PhysicsBody(colliderNode, PhysicsMotionType.STATIC, false, scene);
  colliderBody.shape = compound;
  compound.material = { friction: 0.2, restitution: 0 };

  // params only carries dev overrides, so the wardrobe preview never applies in a production build
  const previewWardrobe = params.get('wardrobe') ? { ...wardrobe, ...parseWardrobeParam(params.get('wardrobe')) } : wardrobe;
  const sharlock = createSharlock(scene, { reduced, wardrobe: previewWardrobe, toon: (material) => applyToon(material, { rimGain: 1.2 }) });
  for (const mesh of sharlock.meshes) mesh.receiveShadows = true;
  for (const mesh of sharlock.casters) look.csm.addShadowCaster(mesh);
  const control = createPlayer({
    scene,
    engine,
    canvas,
    camera,
    ground: built.meshes.find((m) => m.name === 'static-cobble') ?? ground.meshes[0],
    sharlock,
    state,
    reduced,
    joystick,
    onSprint: (sprint) => {
      state.sprint = sprint;
      notify();
    },
    nav: { spawn: origin, heading: origin.heading, heightAt, walkable, paths, destinations, door: doorSpot },
  });

  // the focus point is read live so the views in selectionViews can be tuned while the hub runs
  const infos = destinations.map((d) => {
    const view = selectionViews[d.id];
    return {
      ...d,
      view,
      get focus() {
        return { x: d.x + Math.sin(d.face) * 1.5, y: view.focusY, z: d.z + Math.cos(d.face) * 1.5 };
      },
    };
  });
  const doors = createDoors({ scene, state, notify, infos, control, camera, reduced, groundY: heightAt, radiusNow: () => arm.state().desired });

  // keeps the follow camera out of the buildings. off while the enter swoop runs and once the debug camera has freed the limits
  let cameraFreed = false;
  const arm = createSpringArm({ camera, boxes: world.blockers, reduced, active: () => !cameraFreed && !doors.isEntering() });
  // the asked for radius goes back before the camera reads its inputs
  const armRestore = scene.onBeforeAnimationsObservable.add(() => arm.restore());

  // lower the player in the frame so the river and sky fill the top. a selection view brings its own shift, and the shift
  // shrinks with the spring arm so a pulled in camera does not drop the player to the bottom edge
  const frameOffset = -2.7;
  let frameNow = frameOffset;
  camera.targetScreenOffset.set(0, frameOffset);
  // raises the frame just enough that sharlock and the npc he talks to stay above the bottom bar (insetPx, set by the shell)
  let insetPx = 0;
  let lift = 0;
  const screenY = (x, y, z) => {
    const m = scene.getTransformMatrix().m;
    const w = x * m[3] + y * m[7] + z * m[11] + m[15];
    return ((1 - (x * m[1] + y * m[5] + z * m[9] + m[13]) / w) / 2) * canvas.clientHeight;
  };
  const liftFor = (dt, at) => {
    const height = canvas.clientHeight;
    let want = 0;
    if (insetPx > 0 && height > 0 && state.mode === 'explore') {
      const feet = control.position();
      let low = screenY(at.x, feet.y, at.z);
      const npc = state.nearNpc ? townsfolk.list().find((n) => n.id === state.nearNpc) : null;
      if (npc) low = Math.max(low, screenY(npc.x, feet.y, npc.z));
      // metres of view offset per pixel at the distance of the subject
      const perPx = (2 * camera.radius * Math.tan(camera.fov / 2)) / height;
      want = Math.max(0, lift + (low - (height - insetPx - LIFT_GAP)) * perPx);
    }
    return reduced() ? want : lift + (want - lift) * (1 - Math.exp(-dt * 6));
  };
  const peers = createRemotePeers({ scene, camera, engine, canvas, tier, reduced, look, getPlayer: () => state.player });
  disposers.push(() => peers.dispose());
  const metrics = createInstrumentation({ scene, state });
  const sfx = createHubSfx({ spots: lamps.spots });
  disposers.push(() => sfx.dispose());
  let sfxAt = null;
  const windowLit = world.materials.windowLit;
  const start = performance.now();
  // the minimap reads this by reference on a timer, so nothing is allocated per frame
  state.player = { x: origin.x, z: origin.z, heading: origin.heading };
  const frame = scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 1 / 20);
    const t = (performance.now() - start) / 1000;
    if (!state.paused) {
      control.update(dt);
      if (!reduced()) waterClock.time = t;
    }
    const at = control.position();
    state.player.x = at.x;
    state.player.z = at.z;
    state.player.heading = control.heading();
    if (sfxAt && dt > 0) {
      // speed from the position change, capped so a teleport does not read as a sprint
      const pace = Math.min(Math.hypot(at.x - sfxAt.x, at.z - sfxAt.z) / dt, 14);
      sfx.update(dt, { x: at.x, z: at.z, speed: pace, grounded: !control.airborne(), paused: state.paused });
    }
    sfxAt = { x: at.x, z: at.z };
    doors.update(dt, t);
    arm.update(dt);
    const armed = arm.state();
    const framed = doors.framedId() && control.isHeld() ? selectionViews[doors.framedId()].shift : frameOffset;
    frameNow = reduced() ? framed : frameNow + (framed - frameNow) * (1 - Math.exp(-dt * 5));
    lift = liftFor(dt, at);
    camera.targetScreenOffset.y = (armed.active && armed.desired > 0 ? (frameNow * armed.effective) / armed.desired : frameNow) + lift;
    orbit.update(dt);
    // lit windows warm up as the sun sets, lamps come on one by one
    const warm = reduced() ? 1 : Math.min(1, t / 24);
    windowLit.emissiveColor.set(0.5 + 0.5 * warm, 0.42 + 0.55 * warm, 0.36 + 0.55 * warm);
    lamps.update(t, dt);
    boats.update(dt);
    life.update(dt);
    peers.update(dt);
    const talk = townsfolk.update(dt, state.player, state.nearDoor, inputPaused ? state.nearNpc : null);
    if (talk !== state.nearNpc) {
      state.nearNpc = talk;
      notify();
    }
    const find = nearestFind(state.player)?.id ?? null;
    if (find !== state.nearFind) {
      state.nearFind = find;
      notify();
    }
  });

  state.look = { mirror: Boolean(mirror), lamps: lamps.count, boats: true, tier: tier.name };
  state.buildMs = Math.round(performance.now() - t0);
  // an outside overlay can freeze walking and orbiting; coming back from a door must not undo that
  let inputPaused = false;
  const applyInput = () => {
    control.setEnabled(!inputPaused && !doors.isEntering());
    if (inputPaused) camera.detachControl();
    else camera.attachControl(canvas, true);
  };
  // swing the camera back behind sharlock, or back to the selection view while a building is selected
  const resetCamera = () => {
    if (inputPaused || doors.isEntering() || state.mode !== 'explore') return;
    if (state.selected) {
      doors.refocus();
      return;
    }
    const p = control.position();
    control
      .flyTo({ target: new Vector3(p.x, p.y + 0.4, p.z), alpha: alphaBehind(control.heading()) }, 0.6)
      .then(() => {
        if (!state.selected && !doors.isEntering()) control.releaseCamera();
      });
  };
  const orbit = createOrbitKeys({ camera, enabled: () => !inputPaused && !doors.isEntering(), onReset: resetCamera });
  return {
    api: {
      select: doors.select,
      setBottomInset: (px) => {
        insetPx = Math.max(0, px || 0);
      },
      resetCamera,
      enter: (id) => {
        // a small happy hop as the swoop starts
        if (state.mode !== 'entering' && state.mode !== 'panel') control.hop();
        return doors.enter(id);
      },
      back: async () => {
        const done = await doors.back();
        if (inputPaused) applyInput();
        return done;
      },
      setPeers: peers.set,
      peerLabels: peers.labels,
      setInputPaused: (value) => {
        inputPaused = Boolean(value);
        applyInput();
      },
      debug: {
        scene,
        sharlockLook: () => JSON.parse(JSON.stringify(sharlock.look)),
        teleport: (x, z) => control.teleport(x, z),
        position: () => control.position(),
        jump: () => control.jump(),
        sprint: () => control.sprint(),
        sprintState: () => control.sprintState(),
        airborne: () => control.airborne(),
        doors: () => infos.map((i) => ({ id: i.id, ...doorSpot(i, i.reach) })),
        camera: (alpha, beta, radius, tx, ty, tz, fov) => {
          control.releaseCamera();
          cameraFreed = true;
          freeCamera(camera, alpha, beta, radius, tx === undefined ? null : [tx, ty, tz]);
          if (fov) camera.fov = fov;
          control.flyTo({}, 0.001);
        },
        springArm: () => arm.state(),
        views: selectionViews,
        frameShift: () => camera.targetScreenOffset.y,
        blockers: () => world.blockers.length,
        cameraState: () => ({ target: camera.target.asArray(), alpha: camera.alpha, beta: camera.beta, radius: camera.radius }),
        walkTo: (x, z) => control.walkTo([[x, z]], { cancelHold: true }),
        clickAt: (cx, cy) => {
          const opts = { clientX: cx, clientY: cy, pointerId: 1, pointerType: 'mouse', bubbles: true, isPrimary: true };
          canvas.dispatchEvent(new PointerEvent('pointerdown', opts));
          canvas.dispatchEvent(new PointerEvent('pointerup', opts));
        },
        sharlockStats: () => ({ triangles: control.player.rig?.triangles() ?? 0, meshes: control.player.rig?.drawCalls() ?? 0 }),
        lampsLit: () => lamps.litFraction(),
        npcs: () => townsfolk.list(),
        peers: peers.list,
        finds: () => finds.map(({ id, kind, name, x, z }) => ({ id, kind, name, x, z })),
        freezeNpcs: (value) => townsfolk.setFrozen(value),
        cab: () => life.cabAt(),
        worker: (i) => life.workerAt(i),
        sunClock: () => (performance.now() - start) / 1000,
      },
    },
    dispose() {
      scene.onBeforeRenderObservable.remove(frame);
      scene.onBeforeAnimationsObservable.remove(armRestore);
      metrics.dispose();
      orbit.dispose();
      doors.dispose();
      control.dispose();
      camera.detachControl();
      colliderBody.dispose();
      for (const fn of disposers.reverse()) fn();
    },
  };
}
