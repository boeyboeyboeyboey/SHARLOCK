import { ProfileError } from '../profile/policy.js'
import { WARDROBE_ITEM_IDS_BY_SLOT, WARDROBE_SLOTS } from './catalog.js'

function validationError(fieldErrors) {
  return new ProfileError(
    'VALIDATION_ERROR',
    'Check the highlighted fields and try again.',
    400,
    fieldErrors,
  )
}

export function parseWardrobeInput(slot, input) {
  const fieldErrors = Object.create(null)
  const validSlot = typeof slot === 'string' && WARDROBE_SLOTS.includes(slot)
  if (!validSlot) fieldErrors.slot = 'Choose a wardrobe slot.'

  const prototype = input && typeof input === 'object' ? Object.getPrototypeOf(input) : null
  const isRecord =
    input !== null &&
    typeof input === 'object' &&
    !Array.isArray(input) &&
    (prototype === Object.prototype || prototype === null)
  if (!isRecord) {
    fieldErrors._ = 'Must be a JSON object.'
  } else {
    const keys = Reflect.ownKeys(input)
    if (keys.length !== 1 || keys[0] !== 'itemId') fieldErrors._ = 'Only itemId is allowed.'
    else if (typeof input.itemId !== 'string') fieldErrors.itemId = 'Must be a string.'
    else if (validSlot && !WARDROBE_ITEM_IDS_BY_SLOT[slot].includes(input.itemId)) {
      fieldErrors.itemId = 'Choose an item that belongs to this slot.'
    }
  }

  if (Object.keys(fieldErrors).length > 0) throw validationError(fieldErrors)
  return { slot, itemId: input.itemId }
}
