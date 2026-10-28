import { PhysicsCharacterController, CharacterSupportedState } from '@babylonjs/core/Physics/v2/characterController.js';
import '@babylonjs/core/Culling/ray.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { nearestAlpha } from './orbit.js';
import { LOOK_RANGE, lookYawTo } from './idle.js';
import { createJump, JUMP_SPEED } from './jump.js';
const capsule = { height: 1, radius: 0.3 };
const speed = 7.2;
const gravity = new Vector3(0, -9.81, 0);
const down = new Vector3(0, -1, 0);

const ease = (t) => t * t * (3 - 2 * t);

// graph over the lane polylines, used to auto-walk along them
function pathGraph(paths) {
  const nodes = [];
  const link = new Map();
  const find = (p) => {
    let i = nodes.findIndex((n) => Math.hypot(n[0] - p[0], n[1] - p[1]) < 0.01);
    if (i < 0) {
      nodes.push(p);
      i = nodes.length - 1;
      link.set(i, new Set());
    }
    return i;
  };
  for (const line of paths) {
    for (let i = 0; i < line.length - 1; i += 1) {
      const a = find(line[i]);
      const b = find(line[i + 1]);
      link.get(a).add(b);
      link.get(b).add(a);
    }
  }
  return { nodes, link };
}

// nav: { spawn, heightAt(x, z), walkable(x, z), paths, destinations, door(dest) } supplied by the scene
export function createPlayer({ scene, canvas, camera, ground, sharlock, reduced, nav, joystick: pad = {} }) {
  const { destinations, door, heightAt, paths, spawn, walkable } = nav;
  const graph = pathGraph(paths);
  const controller = new PhysicsCharacterController(
    new Vector3(spawn.x, heightAt(spawn.x, spawn.z) + capsule.height / 2 + 0.1, spawn.z),
    { capsuleHeight: capsule.height, capsuleRadius: capsule.radius },
    scene,
  );
  controller.maxSlopeCosine = Math.cos((50 * Math.PI) / 180);
  controller.keepDistance = 0.04;
  controller.maxStepHeight = 0.3;

  const player = { root: sharlock.root, visual: sharlock.visual, rig: sharlock.rig ?? null, animate: null, animated: false };
  const keys = new Set();
  const joystick = { x: 0, y: 0 };
  let route = [];
  let enabled = true;
  let heading = nav.heading ?? 0;
  let flight = null;
  let hold = false;
  let stallTime = 0;
  let stalled = false;
  let lastPos = new Vector3();
  let walkBlend = 0;
  const jump = createJump();
  // last supported height, so the follow camera does not bob with a jump
  let groundY = controller.getPosition().y;
  let curSpeed = 0;
  const lastDir = { x: 0, z: 1 };

  const pos = () => controller.getPosition();
  const feet = () => ({ x: pos().x, z: pos().z });

  const onKey = (event, isDown) => {
    if (event.code === 'Space') {
      if (!isDown || event.repeat) return;
      // buttons and links keep space for their own activation
      if (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT|BUTTON|A|SUMMARY)$/.test(event.target.tagName)) return;
      if (enabled) {
        event.preventDefault();
        jump.request();
      }
      return;
    }
    const map = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
    const key = map[event.code];
    if (!key) return;
    if (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
    if (isDown) {
      keys.add(key);
      if (enabled) event.preventDefault();
    } else {
      keys.delete(key);
    }
  };
  const down1 = (event) => onKey(event, true);
  const up1 = (event) => onKey(event, false);
  const blur = () => keys.clear();
  window.addEventListener('keydown', down1);
  window.addEventListener('keyup', up1);
  window.addEventListener('blur', blur);

  // click or tap to walk; ignores drags that rotate the camera
  let press = null;
  const onDown = (event) => {
    press = { x: event.clientX, y: event.clientY, t: performance.now() };
  };
  const onUp = (event) => {
    if (!press || !enabled) return;
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    const quick = performance.now() - press.t < 450;
    press = null;
    if (moved > 8 || !quick) return;
    const rect = canvas.getBoundingClientRect();
    const px = ((event.clientX - rect.left) * canvas.width) / rect.width;
    const py = ((event.clientY - rect.top) * canvas.height) / rect.height;
    const hit = scene.pick(px, py, (mesh) => mesh === ground, false, camera);
    if (hit?.hit && hit.pickedPoint) {
      const { x, z } = hit.pickedPoint;
      if (walkable(x, z)) walkTo([[x, z]], { cancelHold: true });
    }
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);

  const joyEl = pad.el ?? null;
  const knob = pad.knob ?? null;
  let joyId = null;
  const joyMove = (event) => {
    if (event.pointerId !== joyId) return;
    const rect = joyEl.getBoundingClientRect();
    const radius = rect.width / 2 - 14;
    let dx = event.clientX - (rect.left + rect.width / 2);
    let dy = event.clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > radius) {
      dx = (dx / len) * radius;
      dy = (dy / len) * radius;
    }
    joystick.x = dx / radius;
    joystick.y = -dy / radius;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const joyDown = (event) => {
    joyId = event.pointerId;
    joyEl.setPointerCapture(event.pointerId);
    joyMove(event);
    event.preventDefault();
  };
  const joyUp = (event) => {
    if (event.pointerId !== joyId) return;
    joyId = null;
    joystick.x = 0;
    joystick.y = 0;
    knob.style.transform = 'translate(0, 0)';
  };
  const jumpEl = pad.jump ?? null;
  const jumpTap = (event) => {
    event.preventDefault();
    if (enabled) jump.request();
  };
  // keyboard and screen reader activation arrive as a click with no pointer
  const jumpKey = (event) => {
    if (event.detail === 0 && enabled) jump.request();
  };
  jumpEl?.addEventListener('pointerdown', jumpTap);
  jumpEl?.addEventListener('click', jumpKey);
  joyEl?.addEventListener('pointerdown', joyDown);
  joyEl?.addEventListener('pointermove', joyMove);
  joyEl?.addEventListener('pointerup', joyUp);
  joyEl?.addEventListener('pointercancel', joyUp);

  // bumped by every new walk, so a caller can tell its route was replaced
  let routeSerial = 0;
  function walkTo(points, { cancelHold = false } = {}) {
    route = points.map(([x, z]) => ({ x, z }));
    routeSerial += 1;
    stallTime = 0;
    stalled = false;
    if (cancelHold) hold = false;
  }

  // route along the paths, then straight to the door
  function routeToDoor(id) {
    const dest = destinations.find((d) => d.id === id);
    const target = door(dest);
    const { nodes, link } = graph;
    // lane ends can sit inside a prop's collider, so only walkable nodes can start or end a route
    const usable = nodes.map((n, i) => i).filter((i) => walkable(nodes[i][0], nodes[i][1]));
    const nearest = (x, z) => (usable.length ? usable : nodes.map((n, i) => i)).reduce((best, i) => (Math.hypot(nodes[i][0] - x, nodes[i][1] - z) < Math.hypot(nodes[best][0] - x, nodes[best][1] - z) ? i : best));
    const here = pos();
    const start = nearest(here.x, here.z);
    const goal = nearest(target.x, target.z);
    const dist = new Map([[start, 0]]);
    const prev = new Map();
    const open = new Set([start]);
    while (open.size) {
      let current = null;
      for (const n of open) if (current === null || dist.get(n) < dist.get(current)) current = n;
      open.delete(current);
      for (const next of link.get(current)) {
        const d = dist.get(current) + Math.hypot(nodes[current][0] - nodes[next][0], nodes[current][1] - nodes[next][1]);
        if (!dist.has(next) || d < dist.get(next)) {
          dist.set(next, d);
          prev.set(next, current);
          open.add(next);
        }
      }
    }
    const chain = [];
    for (let n = goal; n !== undefined; n = prev.get(n)) chain.unshift(nodes[n]);
    walkTo([...chain, [target.x, target.z]]);
  }

  function flyTo(to, seconds = 0.9) {
    hold = true;
    const from = { target: camera.target.clone(), alpha: camera.alpha, beta: camera.beta, radius: camera.radius };
    const end = {
      target: to.target ?? from.target,
      // alpha rotates the short way, whatever turn count it has piled up
      alpha: to.alpha === undefined ? from.alpha : nearestAlpha(from.alpha, to.alpha),
      beta: to.beta ?? from.beta,
      radius: to.radius ?? from.radius,
    };
    if (reduced()) {
      camera.target.copyFrom(end.target);
      camera.alpha = end.alpha;
      camera.beta = end.beta;
      camera.radius = end.radius;
      flight = null;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      flight = { t: 0, seconds, from, end, resolve };
    });
  }

  function releaseCamera() {
    hold = false;
    flight = null;
  }

  const lookAt = new Vector3();
  function update(dt) {
    const p = pos();
    // movement intent: keyboard and joystick win over routes
    let ix = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0) + joystick.x;
    let iy = (keys.has('f') ? 1 : 0) - (keys.has('b') ? 1 : 0) + joystick.y;
    const manual = enabled && (Math.abs(ix) > 0.05 || Math.abs(iy) > 0.05);
    let dx = 0;
    let dz = 0;
    // the last route point brakes early so doors are never overshot
    let arriveCap = Infinity;
    if (manual) {
      route = [];
      hold = false;
      stalled = false;
      const len = Math.hypot(ix, iy);
      if (len > 1) {
        ix /= len;
        iy /= len;
      }
      const fx = camera.target.x - camera.position.x;
      const fz = camera.target.z - camera.position.z;
      const fl = Math.hypot(fx, fz) || 1;
      const forward = { x: fx / fl, z: fz / fl };
      dx = forward.x * iy + forward.z * ix;
      dz = forward.z * iy - forward.x * ix;
    } else if (route.length && enabled) {
      const target = route[0];
      const vx = target.x - p.x;
      const vz = target.z - p.z;
      const dist = Math.hypot(vx, vz);
      if (route.length === 1) arriveCap = Math.max(1.6, dist * 9);
      if (dist < (route.length === 1 ? 0.25 : 0.7)) {
        route.shift();
        if (!route.length) hold = false;
      } else {
        dx = vx / dist;
        dz = vz / dist;
      }
    }

    // keep inside the walkable area, sliding along its edge
    if (dx || dz) {
      const step = speed * Math.max(dt, 0.016) * 3;
      if (!walkable(p.x + dx * step, p.z + dz * step)) {
        if (walkable(p.x + dx * step, p.z)) dz = 0;
        else if (walkable(p.x, p.z + dz * step)) dx = 0;
        else {
          dx = 0;
          dz = 0;
        }
      }
    }

    // turn toward the travel direction first and slow down while the body is still swinging round, so it never slides sideways
    const moving = dx !== 0 || dz !== 0;
    let diff = 0;
    if (moving) {
      diff = Math.atan2(dx, dz) - heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
    }
    const aligned = moving ? 0.45 + 0.55 * Math.max(0, Math.cos(diff)) : 1;

    const support = controller.checkSupport(dt, down);
    const supported = support.supportedState === CharacterSupportedState.SUPPORTED;
    const v = controller.getVelocity();
    // snappy ramp up, firmer ramp down, along the last travel direction
    const mag = Math.hypot(dx, dz);
    if (mag > 0.001) {
      lastDir.x = dx / mag;
      lastDir.z = dz / mag;
    }
    const wanted = moving ? Math.min(mag * speed * aligned, arriveCap) : 0;
    const rate = (wanted > curSpeed ? 60 : 150) * dt;
    curSpeed += Math.max(-rate, Math.min(rate, wanted - curSpeed));
    const air = jump.step(dt, { supported, calm: reduced(), enabled });
    const vy = air.launch ? JUMP_SPEED : air.grounded ? -0.6 : v.y + gravity.y * dt;
    const out = new Vector3(lastDir.x * curSpeed, vy, lastDir.z * curSpeed);
    controller.setVelocity(out);
    controller.integrate(dt, support, gravity);

    // stop a route that makes no headway (obstacle)
    const np = pos();
    if (route.length && !manual) {
      const progress = Math.hypot(np.x - lastPos.x, np.z - lastPos.z);
      stallTime = progress < speed * dt * 0.12 ? stallTime + dt : 0;
      if (stallTime > 0.45) {
        // keep the camera hold and let the caller keep its pick, so Enter still works
        route = [];
        stallTime = 0;
        stalled = true;
      }
    }
    lastPos = np.clone();
    if (air.grounded) groundY = np.y;

    // the capsule rests 0.1 m above the floor, so the visual drops to stand on it (a little less, the toes dip while striding)
    player.root.position.set(np.x, np.y - capsule.height / 2 - 0.08, np.z);
    const before = heading;
    if (moving) heading += diff * (1 - Math.exp(-dt * 10));
    player.root.rotation.y = heading;
    walkBlend += ((moving ? 1 : 0) - walkBlend) * Math.min(1, dt * 10);
    // the nearest door within reach of a glance, only worth working out while standing still
    let look = null;
    if (player.rig && !moving) {
      let best = LOOK_RANGE;
      for (const d of destinations) {
        const gap = Math.hypot(d.x - np.x, d.z - np.z);
        if (gap < best) {
          best = gap;
          look = lookYawTo(np.x, np.z, heading, d.x, d.z);
        }
      }
    }
    if (player.rig) player.rig.update(dt, curSpeed, speed, { turn: dt > 0 ? (heading - before) / dt : 0, lead: moving ? diff : 0, active: moving || manual || air.active, look, jump: air });
    else if (player.animated) player.animate(walkBlend * speed, speed);
    else {
      const t = performance.now() / 1000;
      player.visual.position.y = moving ? Math.abs(Math.sin(t * 11)) * 0.08 : 0;
      player.visual.rotation.z = moving ? Math.sin(t * 11) * 0.06 : 0;
      const breathe = 1 + Math.sin(t * 2.2) * 0.012 * (1 - walkBlend);
      player.visual.scaling.y = breathe;
    }

    // camera: tween when flying, otherwise follow
    if (flight) {
      flight.t += dt;
      const k = ease(Math.min(1, flight.t / flight.seconds));
      Vector3.LerpToRef(flight.from.target, flight.end.target, k, lookAt);
      camera.target.copyFrom(lookAt);
      camera.alpha = flight.from.alpha + (flight.end.alpha - flight.from.alpha) * k;
      camera.beta = flight.from.beta + (flight.end.beta - flight.from.beta) * k;
      camera.radius = flight.from.radius + (flight.end.radius - flight.from.radius) * k;
      if (flight.t >= flight.seconds) {
        flight.resolve();
        flight = null;
      }
    } else if (!hold) {
      const goal = lookAt.set(np.x, groundY + 0.4, np.z);
      if (reduced()) camera.target.copyFrom(goal);
      else Vector3.LerpToRef(camera.target, goal, 1 - Math.exp(-dt * 6), camera.target);
    }
  }

  return {
    player,
    controller,
    update,
    walkTo,
    routeToDoor,
    flyTo,
    releaseCamera,
    heading: () => heading,
    isHeld: () => hold,
    cancelRoute: () => {
      route = [];
    },
    setEnabled: (value) => {
      enabled = value;
      if (!value) {
        route = [];
        keys.clear();
      }
    },
    position: () => ({ x: pos().x, z: pos().z, y: pos().y - capsule.height / 2 }),
    feet,
    isWalking: () => route.length > 0,
    wasStalled: () => stalled,
    jump: () => {
      if (enabled) jump.request();
    },
    hop: () => jump.hop(),
    airborne: () => jump.isAirborne(),
    routeSerial: () => routeSerial,
    teleport(x, z) {
      controller.setPosition(new Vector3(x, heightAt(x, z) + capsule.height / 2 + 0.1, z));
      controller.setVelocity(new Vector3(0, 0, 0));
      curSpeed = 0;
      route = [];
      groundY = heightAt(x, z) + capsule.height / 2 + 0.1;
      camera.target.set(x, heightAt(x, z) + 0.4, z);
    },
    dispose() {
      window.removeEventListener('keydown', down1);
      window.removeEventListener('keyup', up1);
      window.removeEventListener('blur', blur);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      jumpEl?.removeEventListener('pointerdown', jumpTap);
      jumpEl?.removeEventListener('click', jumpKey);
      joyEl?.removeEventListener('pointerdown', joyDown);
      joyEl?.removeEventListener('pointermove', joyMove);
      joyEl?.removeEventListener('pointerup', joyUp);
      joyEl?.removeEventListener('pointercancel', joyUp);
      controller.dispose();
    },
  };
}
