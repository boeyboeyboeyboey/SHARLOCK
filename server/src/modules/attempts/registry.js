import { Schema } from 'mongoose'

const allowedEntryFields = new Set([
  'id',
  'rulesetVersion',
  'learningObjective',
  'topicTags',
  'stateSchema',
  'maxScore',
  'maxActions',
  'current',
  'competitive',
  'serverRecorded',
  'createState',
  'validateAction',
  'applyAction',
  'canComplete',
  'serializePublicState',
  'summarize',
])
const kebabPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const rulesetPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const playHooks = ['createState', 'validateAction', 'applyAction', 'canComplete']
const alwaysRequiredHooks = ['serializePublicState', 'summarize']

export function createAttemptRegistry(entries = []) {
  const normalizedEntries = readDenseArray(
    entries,
    'Attempt registry entries must be an array.',
  ).map(normalizeEntry)
  const pairs = new Set()
  const currentGames = new Set()
  for (const entry of normalizedEntries) {
    if (pairs.has(entry.storageKey)) throw new TypeError('Attempt registry entries must be unique.')
    pairs.add(entry.storageKey)
    if (entry.current) {
      if (currentGames.has(entry.id)) throw new TypeError('Each game may have one current ruleset.')
      currentGames.add(entry.id)
    }
  }
  const frozenEntries = Object.freeze(normalizedEntries)
  const byPair = new Map(frozenEntries.map((entry) => [entry.storageKey, entry]))
  const byCurrentGame = new Map(
    frozenEntries.filter((entry) => entry.current).map((entry) => [entry.id, entry]),
  )
  return Object.freeze({
    entries: frozenEntries,
    getCurrent(gameId) {
      return byCurrentGame.get(gameId)
    },
    get(gameId, rulesetVersion) {
      return byPair.get(`${gameId}@${rulesetVersion}`)
    },
  })
}

function normalizeEntry(entry) {
  if (!isPlainRecord(entry)) throw new TypeError('Attempt registry entry must be a plain object.')
  const keys = Reflect.ownKeys(entry)
  if (keys.some((key) => typeof key !== 'string' || !allowedEntryFields.has(key))) {
    throw new TypeError('Attempt registry entry contains an unknown field.')
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(entry, key)
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError('Attempt registry entry fields must be data properties.')
    }
  }

  if (
    typeof entry.id !== 'string' ||
    entry.id.length > 80 ||
    !kebabPattern.test(entry.id) ||
    typeof entry.rulesetVersion !== 'string' ||
    !rulesetPattern.test(entry.rulesetVersion) ||
    typeof entry.learningObjective !== 'string' ||
    entry.learningObjective.trim().length === 0 ||
    entry.learningObjective.length > 500 ||
    !Array.isArray(entry.topicTags) ||
    entry.topicTags.length < 1 ||
    entry.topicTags.length > 32 ||
    !Number.isFinite(entry.maxScore) ||
    entry.maxScore <= 0 ||
    entry.maxScore > 1e9 ||
    !Number.isInteger(entry.maxActions) ||
    entry.maxActions < 1 ||
    entry.maxActions > 255
  ) {
    throw new TypeError('Attempt registry entry is invalid.')
  }
  const topicTags = readDenseArray(entry.topicTags, 'Attempt topic tags are invalid.')
  if (
    !topicTags.every((tag) => typeof tag === 'string' && tag.trim().length > 0 && tag.length <= 80)
  ) {
    throw new TypeError('Attempt topic tags are invalid.')
  }
  if (Object.hasOwn(entry, 'current') && typeof entry.current !== 'boolean') {
    throw new TypeError('Attempt registry current flag is invalid.')
  }
  if (Object.hasOwn(entry, 'competitive') && typeof entry.competitive !== 'boolean') {
    throw new TypeError('Attempt registry competitive flag is invalid.')
  }
  if (Object.hasOwn(entry, 'serverRecorded') && typeof entry.serverRecorded !== 'boolean') {
    throw new TypeError('Attempt registry serverRecorded flag is invalid.')
  }
  const serverRecorded = entry.serverRecorded === true
  for (const hook of alwaysRequiredHooks) {
    if (typeof entry[hook] !== 'function') throw new TypeError('Attempt registry hook is missing.')
  }
  // server-recorded games run their live state elsewhere, so play hooks are optional but typed
  for (const hook of playHooks) {
    const present = Object.hasOwn(entry, hook) && entry[hook] !== undefined
    if (present ? typeof entry[hook] !== 'function' : !serverRecorded) {
      throw new TypeError('Attempt registry hook is missing.')
    }
  }
  assertStrictStateSchema(entry.stateSchema)

  Object.freeze(topicTags)
  return Object.freeze({
    id: entry.id,
    rulesetVersion: entry.rulesetVersion,
    learningObjective: entry.learningObjective,
    topicTags,
    stateSchema: entry.stateSchema,
    maxScore: entry.maxScore,
    maxActions: entry.maxActions,
    current: Object.hasOwn(entry, 'current') ? entry.current : true,
    competitive: Object.hasOwn(entry, 'competitive') ? entry.competitive : false,
    serverRecorded,
    storageKey: `${entry.id}@${entry.rulesetVersion}`,
    createState: entry.createState,
    validateAction: entry.validateAction,
    applyAction: entry.applyAction,
    canComplete: entry.canComplete,
    serializePublicState: entry.serializePublicState,
    summarize: entry.summarize,
  })
}

function assertStrictStateSchema(stateSchema) {
  if (!(stateSchema instanceof Schema))
    throw new TypeError('Attempt state must use a Mongoose schema.')
  const visited = new Set()
  const schemas = [stateSchema]
  while (schemas.length > 0) {
    const schema = schemas.pop()
    if (visited.has(schema)) continue
    visited.add(schema)
    if (schema.options.strict !== 'throw') {
      throw new TypeError('Attempt state schemas must use strict throw mode.')
    }
    if (schema.options._id !== false) {
      throw new TypeError('Attempt state schemas must disable generated identifiers.')
    }
    if (Object.hasOwn(schema.paths, '_id')) {
      throw new TypeError('Attempt state schemas cannot declare identifiers.')
    }
    for (const schemaType of Object.values(schema.paths)) inspectSchemaType(schemaType)
    for (const child of schema.childSchemas) {
      if (child.schema instanceof Schema) schemas.push(child.schema)
    }
  }

  function inspectSchemaType(schemaType) {
    if (
      schemaType.instance === 'Mixed' ||
      schemaType.instance === 'Map' ||
      schemaType.$isSchemaMap
    ) {
      throw new TypeError('Attempt state cannot use mixed or map paths.')
    }
    if (
      !['String', 'Number', 'Boolean', 'Array', 'Embedded', 'DocumentArrayElement'].includes(
        schemaType.instance,
      )
    ) {
      throw new TypeError('Attempt state must use JSON-compatible schema paths.')
    }
    if (schemaType.schema instanceof Schema) schemas.push(schemaType.schema)
    if (schemaType.embeddedSchemaType) inspectSchemaType(schemaType.embeddedSchemaType)
    if (schemaType.$__schemaType) inspectSchemaType(schemaType.$__schemaType)
  }
}

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function readDenseArray(value, message) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new TypeError(message)
  }
  const keys = Reflect.ownKeys(value)
  if (keys.length !== value.length + 1) throw new TypeError(message)
  const items = []
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError(message)
    }
    items.push(descriptor.value)
  }
  if (keys.some((key) => key !== 'length' && !isArrayIndex(key, value.length))) {
    throw new TypeError(message)
  }
  return items
}

function isArrayIndex(key, length) {
  if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key)) return false
  const index = Number(key)
  return Number.isSafeInteger(index) && index < length
}
