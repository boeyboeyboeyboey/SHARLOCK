import { getDeviceCheck } from '../../deviceCheck.js';

// one place that decides how heavy a scene may be
// counts are barges, moored boats, workers, gulls; smoke rates are particles per second, 0 for none
// npcRigs: animated rigs for the townsfolk, otherwise static meshes
// backdrop is the scenery south and west of the district: full builds every row, lite the nearest two
const TIERS = {
  desktop: { name: 'desktop', desktop: true, mirror: true, mirrorRatio: 0.5, shadowSize: 1536, cascades: 2, post: true, bloomKernel: 64, crowd: 1, renderScale: 1.5, fpsCap: 0, barges: 3, moored: 6, workers: 8, gulls: 9, npcRigs: true, chimneySmoke: 30, funnelSmoke: 18, backdrop: 'full', backdropSmoke: 14 },
  compact: { name: 'compact', desktop: false, mirror: false, mirrorRatio: 0.35, shadowSize: 1024, cascades: 2, post: true, bloomKernel: 32, crowd: 0.5, renderScale: 1.5, fpsCap: 0, barges: 2, moored: 3, workers: 4, gulls: 5, npcRigs: false, chimneySmoke: 12, funnelSmoke: 8, backdrop: 'full', backdropSmoke: 0 },
  // no mirror, no shadows, tone mapping only, rendered at 0.75 scale and capped at 30 fps
  low: { name: 'low', desktop: false, mirror: false, mirrorRatio: 0.35, shadowSize: 0, cascades: 0, post: false, bloomKernel: 0, crowd: 0.25, renderScale: 0.75, fpsCap: 30, barges: 1, moored: 2, workers: 2, gulls: 3, npcRigs: false, chimneySmoke: 0, funnelSmoke: 6, backdrop: 'lite', backdropSmoke: 0 },
};

export const GRAPHICS_TO_TIER = { high: 'desktop', medium: 'compact', low: 'low' };

// setting is the user's Graphics choice: auto, high, medium or low
export function getTier(params = new URLSearchParams(), setting = 'auto') {
  const forced = params.get('tier');
  let name = GRAPHICS_TO_TIER[setting];
  if (forced) name = TIERS[forced] ? forced : 'compact';
  name ??= getDeviceCheck().tier;
  // ?mirror=0 switches the planar reflection off for comparison runs, ?mirror=1 forces it on for compact
  const mirrorParam = params.get('mirror');
  const tier = { ...TIERS[name] };
  if (name === 'desktop' && mirrorParam === '0') tier.mirror = false;
  if (name === 'compact' && mirrorParam === '1') tier.mirror = true;
  return tier;
}
