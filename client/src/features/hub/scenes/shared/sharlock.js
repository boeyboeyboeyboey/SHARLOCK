import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { rigOptionsFor } from '../../../../data/wardrobeLook.js';
import { createCapybaraRig } from './capybara.js';

// code built detective capybara (deerstalker, monocle, knitted scarf), +z is forward, feet at y 0
export function createSharlock(scene, { reduced = () => false, toon = () => {}, wardrobe = null } = {}) {
  const root = new TransformNode('sharlock', scene);
  const rig = createCapybaraRig(scene, { name: 'sharlock', size: 1.55, reduced, toon, ...rigOptionsFor(wardrobe) });
  rig.node.parent = root;
  return { root, look: rigOptionsFor(wardrobe), rig, meshes: rig.meshes, casters: rig.casters };
}
