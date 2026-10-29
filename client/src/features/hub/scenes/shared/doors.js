import { Constants } from '@babylonjs/core/Engines/constants.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';

// ground point just outside a door; face is the yaw of the facade normal
export const doorSpot = (info, reach = info.reach) => ({ x: info.x + Math.sin(info.face) * reach, z: info.z + Math.cos(info.face) * reach });

export function ringTexture(scene) {
  const texture = new DynamicTexture('door-ring', 256, scene, true);
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, 256, 256);
  const fill = ctx.createRadialGradient(128, 128, 0, 128, 128, 120);
  fill.addColorStop(0, 'rgba(255,255,255,0.22)');
  fill.addColorStop(0.75, 'rgba(255,255,255,0.1)');
  fill.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = 9;
  ctx.shadowColor = 'rgba(255,255,255,0.9)';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(128, 128, 98, 0, Math.PI * 2);
  ctx.stroke();
  texture.update();
  texture.hasAlpha = true;
  return texture;
}

// door triggers and the select / enter / back flow shared by every walkable scene
// infos: [{ id, title, accent, x, z, face, reach, focus?: { x, y, z }, view?: { radius, beta, alphaOffset } }]
export function createDoors({ scene, state, notify, infos, control, camera, reduced, radiusNow = () => camera.radius, groundY = () => 0, onGlow = null, ringRadius = 1.05, ringMaterial = null }) {
  const infoOf = (id) => infos.find((i) => i.id === id);
  const glow = new Map(infos.map((i) => [i.id, 0]));

  const discs = infos.map((info) => {
    const spot = doorSpot(info, info.reach);
    const disc = CreateDisc(`marker-${info.id}`, { radius: ringRadius, tessellation: 40 }, scene);
    disc.rotation.x = Math.PI / 2;
    disc.position.set(spot.x, groundY(spot.x, spot.z) + 0.05, spot.z);
    return { id: info.id, mesh: disc, accent: Color3.FromHexString(info.accent) };
  });
  const perDisc = discs[0].mesh.getTotalVertices();
  const ringColors = new Float32Array(discs.length * perDisc * 4);
  discs.forEach((d, i) => {
    for (let v = 0; v < perDisc; v += 1) ringColors.set([d.accent.r, d.accent.g, d.accent.b, 0.4], (i * perDisc + v) * 4);
    d.mesh.setVerticesData(VertexBuffer.ColorKind, ringColors.slice(i * perDisc * 4, (i + 1) * perDisc * 4));
  });
  const ringMesh = Mesh.MergeMeshes(discs.map((d) => d.mesh), true, true, undefined, false, false);
  ringMesh.name = 'door-rings';
  ringMesh.hasVertexAlpha = true;
  ringMesh.isPickable = false;
  ringMesh.setVerticesData(VertexBuffer.ColorKind, ringColors, true);
  // custom materials may read a second uv set
  ringMesh.setVerticesData(VertexBuffer.UV2Kind, new Float32Array(ringMesh.getTotalVertices() * 2));
  let ownMaterial = null;
  if (!ringMaterial) {
    ownMaterial = new StandardMaterial('door-rings-mat', scene);
    ownMaterial.disableLighting = true;
    ownMaterial.emissiveTexture = ringTexture(scene);
    ownMaterial.opacityTexture = ownMaterial.emissiveTexture;
    ownMaterial.backFaceCulling = false;
    ownMaterial.alphaMode = Constants.ALPHA_ADD;
    ownMaterial.fogEnabled = false;
  }
  ringMesh.material = ringMaterial ?? ownMaterial;
  ringMesh.useVertexColors = true;
  ringMesh.alphaIndex = 50;

  let entering = false;
  // false until the first update has noted which ring, if any, the player starts on
  let primed = false;
  // the door a menu or map pick is walking the player to, so leaving another ring on the way is not a deselect
  let headingTo = null;
  let headingRoute = 0;
  let ringDirty = false;
  let saved = { alpha: camera.alpha, beta: camera.beta, radius: camera.radius };
  // the normal follow view, which a deselect settles back into
  const home = { alpha: camera.alpha, beta: camera.beta, radius: camera.radius };
  // the building whose selection view the camera is flying to or holding
  let framed = null;
  // the enter swoop goes closer than the follow view allows; the limit comes back once the camera has left the door
  let followLowerRadius = null;

  const frameView = (info) => {
    framed = info.id;
    // flyTo turns the short way; the offset leans the view off the street axis so a backdrop shows behind the facade
    const alpha = Math.PI / 2 - info.face + (info.view?.alphaOffset ?? 0);
    const focus = info.focus ?? { x: info.x, y: 1.6, z: info.z };
    return control.flyTo({ target: new Vector3(focus.x, focus.y, focus.z), radius: info.view?.radius ?? 14, beta: info.view?.beta ?? 1.0, alpha }, 1.0);
  };

  const select = (id) => {
    // the enter swoop owns the camera, so a list or minimap pick during it is ignored
    if (entering) return;
    state.selected = id;
    headingTo = id && id !== state.nearDoor ? id : null;
    notify();
    if (!id) {
      framed = null;
      // stop where the player stands and ease the camera back to the follow view
      control.cancelRoute();
      const p = control.position();
      control.flyTo({ target: new Vector3(p.x, p.y + 0.4, p.z), ...home }, 0.7).then(() => {
        if (!state.selected && !entering) control.releaseCamera();
      });
      return;
    }
    // already on that door's ring: walking a route would carry the player off it and drop the pick
    if (id === state.nearDoor) control.cancelRoute();
    else {
      control.routeToDoor(id);
      headingRoute = control.routeSerial();
    }
    // face the shopfront from the open side
    frameView(infoOf(id));
  };

  // flies back to the selection view after the player has turned the camera away
  const refocus = () => (state.selected && infoOf(state.selected) ? frameView(infoOf(state.selected)) : Promise.resolve());

  const enter = async (id = state.selected) => {
    if (!id || entering) return false;
    const info = infoOf(id);
    entering = true;
    control.setEnabled(false);
    saved = { alpha: camera.alpha, beta: camera.beta, radius: radiusNow() };
    followLowerRadius ??= camera.lowerRadiusLimit;
    camera.lowerRadiusLimit = 1;
    state.mode = 'entering';
    notify();
    const spot = doorSpot(info, Math.max(1.2, info.reach - 1.2));
    await control.flyTo({ target: new Vector3(spot.x, (info.focus?.y ?? 1.6) - 0.3, spot.z), radius: 4.2, beta: 1.25 }, 0.7);
    state.panelFor = id;
    state.mode = 'panel';
    notify();
    return true;
  };

  const back = async () => {
    if (!entering) return false;
    state.mode = 'returning';
    notify();
    const p = control.position();
    await control.flyTo({ target: new Vector3(p.x, p.y + 0.4, p.z), ...saved }, 0.6);
    if (followLowerRadius !== null) camera.lowerRadiusLimit = followLowerRadius;
    followLowerRadius = null;
    control.releaseCamera();
    control.setEnabled(true);
    entering = false;
    state.panelFor = null;
    // leaving a building clears its selection; the player stays on the ring without reselecting it
    state.selected = null;
    framed = null;
    state.mode = 'explore';
    notify();
    return true;
  };

  // walking onto a door ring selects that building, glow eases toward the selected or nearby door
  function update(dt, t) {
    const p = control.position();
    let near = null;
    for (const info of infos) {
      const spot = doorSpot(info, info.reach);
      if (Math.hypot(spot.x - p.x, spot.z - p.z) < 2.1) near = info.id;
    }
    if (!primed) {
      // coming back from a game puts the player on that door's ring, which must not count as walking onto it
      primed = true;
      state.nearDoor = near;
    } else if (near !== state.nearDoor) {
      const left = state.nearDoor;
      state.nearDoor = near;
      if (near && near === headingTo) headingTo = null;
      // one source of truth: walking onto a door selects it, unless an auto-walk is heading elsewhere
      if (!entering && near && (!control.isWalking() || near === state.selected)) state.selected = near;
      // walking off the selected door's ring deselects it; an auto-walk passing over other rings does not
      if (!entering && !near && left && left === state.selected && headingTo !== left) {
        if (control.isHeld()) select(null);
        else {
          state.selected = null;
          framed = null;
        }
      }
      notify();
    }
    // steering away (keys, joystick or a click elsewhere) before reaching the picked door drops the pick
    if (!entering && headingTo && headingTo === state.selected && state.nearDoor !== headingTo && !control.wasStalled() && (!control.isWalking() || control.routeSerial() !== headingRoute)) {
      headingTo = null;
      if (control.isHeld()) select(null);
      else {
        state.selected = null;
        framed = null;
        notify();
      }
    }
    infos.forEach((info, i) => {
      const active = info.id === state.selected || info.id === state.nearDoor;
      const previous = glow.get(info.id);
      const value = previous + ((active ? 1 : 0) - previous) * Math.min(1, dt * 8);
      glow.set(info.id, value);
      const pulse = reduced() ? 0.9 : 0.85 + 0.15 * Math.sin(t * 4 + i);
      const alpha = 0.4 + 0.55 * value * pulse;
      if (Math.abs(value - previous) > 1e-4 || value > 0.01) {
        for (let v = 0; v < perDisc; v += 1) ringColors[(i * perDisc + v) * 4 + 3] = alpha;
        ringDirty = true;
      }
      onGlow?.(info.id, value, t);
    });
    if (ringDirty) {
      ringMesh.updateVerticesData(VertexBuffer.ColorKind, ringColors);
      ringDirty = false;
    }
  }

  return {
    select,
    enter,
    back,
    update,
    infoOf,
    refocus,
    framedId: () => framed,
    isEntering: () => entering,
    dispose() {
      ownMaterial?.emissiveTexture?.dispose();
      ownMaterial?.dispose();
      ringMesh.dispose();
    },
  };
}
