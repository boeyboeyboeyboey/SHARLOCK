import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { createCapybaraRig, createCapybaraStatic, furStyles } from '../shared/capybara.js';
import { applyToon } from './toon.js';
import { npcs } from './npcs.js';

const SIZE = 1.2;
const UPDATE_RANGE = 25;
const FACE_RANGE = 4;
const TALK_RANGE = 2.5;
const TAU = Math.PI * 2;

// builds the npc capybaras: animated rigs on the desktop tier, static meshes elsewhere
export function buildTownsfolk({ scene, tier, reduced, look }) {
  const toon = (m) => applyToon(m, { rimGain: 1.1 });
  const folk = npcs.map((npc, index) => {
    const style = { ...furStyles[npc.style.fur], scarf: npc.style.scarf };
    let root;
    let rig = null;
    let mesh = null;
    if (tier.npcRigs) {
      rig = createCapybaraRig(scene, { name: `npc-${npc.id}`, style, size: SIZE, hat: 'cap', monocle: false, capColor: npc.style.cap, toon, reduced, idleSeed: 11 + index * 7 });
      root = new TransformNode(`npc-${npc.id}`, scene);
      rig.node.parent = root;
      for (const m of rig.meshes) m.receiveShadows = true;
      // only the torso and head cast, the limbs would triple the shadow draws
      for (const m of rig.casters) if (/-(torso|head)$/.test(m.name)) look.csm.addShadowCaster(m);
    } else {
      mesh = createCapybaraStatic(scene, { style, cap: npc.style.cap, name: `npc-${npc.id}`, toon });
      mesh.scaling.setAll(SIZE);
      mesh.receiveShadows = true;
      root = mesh;
    }
    root.position.set(npc.x, 0, npc.z);
    root.rotation.y = npc.yaw;
    return { npc, root, rig, mesh, yaw: npc.yaw, speed: 0 };
  });

  // world positions for the talk prompt and tests
  const list = () => folk.map((f) => ({ id: f.npc.id, name: f.npc.name, role: f.npc.role, kind: f.npc.kind, gameId: f.npc.gameId ?? null, x: f.npc.x, z: f.npc.z }));

  // returns the id of the npc the player can talk to: within TALK_RANGE, or a game keeper whose door ring the player stands on
  function update(dt, player, nearDoor = null) {
    const step = Math.min(dt, 0.05);
    let talk = null;
    let best = Infinity;
    for (const f of folk) {
      const dx = player.x - f.npc.x;
      const dz = player.z - f.npc.z;
      const dist = Math.hypot(dx, dz);
      const reachable = dist < TALK_RANGE || (f.npc.kind === 'game' && nearDoor === f.npc.gameId);
      if (reachable && dist < best) {
        best = dist;
        talk = f.npc.id;
      }
      if (dist > UPDATE_RANGE) continue;
      // ease the body round to face the player when close, else back to the post
      const want = dist < FACE_RANGE ? Math.atan2(dx, dz) : f.npc.yaw;
      let diff = want - f.yaw;
      diff -= TAU * Math.round(diff / TAU);
      f.yaw += diff * (reduced() ? 1 : 1 - Math.exp(-step * 6));
      f.root.rotation.y = f.yaw;
      f.rig?.update(dt, 0, 4.4, { active: false });
    }
    return talk;
  }

  return {
    list,
    meshes: folk.flatMap((f) => (f.rig ? f.rig.meshes : [f.mesh])),
    update,
    dispose() {
      for (const f of folk) {
        if (f.rig) {
          f.rig.dispose();
          f.root.dispose();
        } else f.mesh.dispose();
      }
    },
  };
}
