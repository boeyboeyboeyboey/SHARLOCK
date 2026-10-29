import { GRAPHICS_TO_TIER } from './scenes/shared/quality.js'

// the hud swaps its glass for opaque panels on the low tier, picked by the user or stepped down to
export function isSolidHud({ quality = 'auto', watchedTier = null, deviceTier = null } = {}) {
  const tier = quality === 'auto' ? (watchedTier ?? deviceTier) : GRAPHICS_TO_TIER[quality]
  return tier === 'low'
}
