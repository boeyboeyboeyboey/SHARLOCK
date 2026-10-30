import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody.js';
import { PhysicsShapeBox } from '@babylonjs/core/Physics/v2/physicsShape.js';
import { PhysicsMotionType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js';
import { createCapybaraRig, createCapybaraStatic, furStyles } from '../shared/capybara.js';
import { applyToon } from './toon.js';
import { npcs } from './npcs.js';
import { finds } from './finds.js';
import { WALK_SPEED, createPatrol, holdsStill, stepPatrol } from './patrol.js';

const SIZE = 1.2;
const UPDATE_RANGE = 25;
const FACE_RANGE = 4;
const TALK_RANGE = 2.5;
// a walking wanderer only stops and turns this close to the player
const STOP_RANGE = 1.5;
const TAU = Math.PI * 2;

// builds the npc capybaras: animated rigs on the desktop tier, static meshes elsewhere
export function buildTownsfolk({ scene, tier, reduced, look }) {
  const toon = (m) => applyToon(m, { rimGain: 1.1 });
  // the hidden discovery npcs stand still and face the player like the rest, but are never offered as a talk target
  // the low tier keeps only the original wanderers
  const wanderers = tier.wanderers ?? Infinity;
  let kept = 0;
  const cast = npcs.filter((npc) => npc.kind !== 'wanderer' || (kept++ < wanderers));
  const roster = [...cast, ...finds.filter((find) => find.kind === 'npc').map((find) => ({ ...find, kind: 'hidden' }))];
  const folk = roster.map((npc, index) => {
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
    const folk = { npc, root, rig, mesh, yaw: npc.yaw, want: npc.yaw, x: npc.x, z: npc.z, patrol: null, body: null, node: null };
    if (npc.kind === 'wanderer' && npc.route) {
      folk.patrol = createPatrol(npc.route);
      // a wanderer's collider is its own animated body so it follows the walk; game keepers stay in the static compound
      folk.node = new TransformNode(`npc-collider-${npc.id}`, scene);
      folk.node.position.set(npc.x, 0, npc.z);
      folk.body = new PhysicsBody(folk.node, PhysicsMotionType.ANIMATED, false, scene);
      folk.body.disablePreStep = true;
      folk.body.shape = new PhysicsShapeBox(new Vector3(0, 0.9, 0), Quaternion.Identity(), new Vector3(0.8, 1.8, 0.8), scene);
    }
    return folk;
  });
  const target = new Vector3();
  const noTurn = Quaternion.Identity();
  let frozen = false;

  // world positions for the talk prompt and tests
  const list = () => folk.filter((f) => f.npc.kind !== 'hidden').map((f) => ({ id: f.npc.id, name: f.npc.name, role: f.npc.role, kind: f.npc.kind, gameId: f.npc.gameId ?? null, x: f.x, z: f.z }));

  // returns the id of the npc the player can talk to: within TALK_RANGE, or a game keeper whose door ring the player stands on
  // talkId is the npc in an open talk, who stands still and faces the player
  function update(dt, player, nearDoor = null, talkId = null) {
    const step = Math.min(dt, 0.05);
    const calm = reduced();
    let talk = null;
    let best = Infinity;
    for (const f of folk) {
      const dx = player.x - f.x;
      const dz = player.z - f.z;
      const dist = Math.hypot(dx, dz);
      const reachable = f.npc.kind !== 'hidden' && (dist < TALK_RANGE || (f.npc.kind === 'game' && nearDoor === f.npc.gameId));
      if (reachable && dist < best) {
        best = dist;
        talk = f.npc.id;
      }
      if (dist > UPDATE_RANGE) continue;
      let walking = false;
      if (f.patrol && !holdsStill({ frozen, calm, dist, range: UPDATE_RANGE, near: STOP_RANGE, talking: talkId === f.npc.id })) {
        stepPatrol(f.patrol, f.npc.route, f.npc.pause, step);
        walking = f.patrol.moving;
        if (walking) {
          f.x = f.patrol.x;
          f.z = f.patrol.z;
          f.want = f.patrol.heading;
          f.root.position.x = f.x;
          f.root.position.z = f.z;
          f.node.position.x = f.x;
          f.node.position.z = f.z;
          target.set(f.x, 0, f.z);
          f.body.setTargetTransform(target, noTurn);
        }
      }
      // ease the body round to face the player when close, else along the walk or back to the post
      const faces = f.patrol ? dist < STOP_RANGE : dist < FACE_RANGE;
      const want = faces || talkId === f.npc.id ? Math.atan2(dx, dz) : f.want;
      let diff = want - f.yaw;
      diff -= TAU * Math.round(diff / TAU);
      f.yaw += diff * (calm ? 1 : 1 - Math.exp(-step * 6));
      f.root.rotation.y = f.yaw;
      f.rig?.update(dt, walking ? WALK_SPEED : 0, 2.4, { active: walking });
    }
    return talk;
  }

  return {
    list,
    meshes: folk.flatMap((f) => (f.rig ? f.rig.meshes : [f.mesh])),
    update,
    setFrozen(value) {
      frozen = Boolean(value);
    },
    dispose() {
      for (const f of folk) {
        f.body?.dispose();
        f.node?.dispose();
        if (f.rig) {
          f.rig.dispose();
          f.root.dispose();
        } else f.mesh.dispose();
      }
    },
  };
}
