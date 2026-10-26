import { Schema } from 'mongoose'
import { MAX_DOCUMENT_BYTES, MAX_PUBLIC_JSON_BYTES, MAX_RECEIPTS } from './policy.js'
import { createAttemptRegistry } from './registry.js'

const uuidPattern = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/
const rulesetPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const gameIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const knownRulesetStorageKeys = Symbol('knownRulesetStorageKeys')

const contextSchema = new Schema(
  {
    kind: {
      type: String,
      enum: ['personal', 'cohort'],
      required: true,
      immutable: true,
      validate: {
        validator(value) {
          if (value === 'personal') return this.cohortId === null
          if (value === 'cohort') return this.cohortId != null
          return false
        },
        message: 'Attempt context is invalid.',
      },
    },
    cohortId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
      validate: {
        validator(value) {
          if (this.kind === 'personal') return value === null
          if (this.kind === 'cohort') return value != null
          return false
        },
        message: 'Attempt context is invalid.',
      },
    },
  },
  { _id: false, id: false, strict: 'throw' },
)

const topicOutcomeSchema = new Schema(
  {
    topic: { type: String, required: true, minlength: 1, maxlength: 120 },
    achieved: { type: Boolean, required: true },
    feedbackCode: { type: String, required: true, maxlength: 120 },
  },
  { _id: false, id: false, strict: 'throw' },
)

const processedActionSchema = new Schema(
  {
    actionId: { type: String, required: true, match: uuidPattern },
    requestHash: { type: String, required: true, match: /^[a-f\d]{64}$/ },
    outcomeJson: {
      type: String,
      required: true,
      validate: boundedJsonString,
    },
  },
  { _id: false, id: false, strict: 'throw' },
)

export function attemptModel(database, registry = createAttemptRegistry()) {
  if (!database || typeof database.model !== 'function' || !database.models) {
    throw new TypeError('A Mongoose database connection is required.')
  }
  if (!registry || !Array.isArray(registry.entries)) {
    throw new TypeError('An attempt registry is required.')
  }

  let model = database.models.GameAttempt
  if (!model) {
    const schema = createBaseSchema(registry)
    model = database.model('GameAttempt', schema, 'game_attempts')
  }
  if (model.schema.options.discriminatorKey !== 'rulesetKey') {
    throw new TypeError('The GameAttempt model has an incompatible discriminator key.')
  }

  const allowedKeys = model.schema[knownRulesetStorageKeys]
  if (!(allowedKeys instanceof Set))
    throw new TypeError('The GameAttempt model schema is incompatible.')
  for (const entry of registry.entries) {
    allowedKeys.add(entry.storageKey)
    attachRulesetModel(model, entry)
  }
  return model
}

export function getRulesetModel(database, registry, entry) {
  const registeredEntry = registry?.get?.(entry?.id, entry?.rulesetVersion)
  if (!registeredEntry) throw new TypeError('The attempt ruleset is not registered.')
  const baseModel = attemptModel(database, registry)
  const discriminatorName = `GameAttempt:${registeredEntry.storageKey}`
  const model = baseModel.discriminators?.[discriminatorName]
  if (!model) throw new TypeError('The attempt ruleset model is unavailable.')
  return model
}

function createBaseSchema(registry) {
  const allowedKeys = new Set(registry.entries.map((entry) => entry.storageKey))
  const schema = new Schema(
    {
      playerId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        immutable: true,
      },
      gameId: {
        type: String,
        required: true,
        immutable: true,
        maxlength: 80,
        match: gameIdPattern,
      },
      rulesetVersion: {
        type: String,
        required: true,
        immutable: true,
        maxlength: 64,
        match: rulesetPattern,
      },
      rulesetKey: {
        type: String,
        required: true,
        immutable: true,
        validate: {
          validator(value) {
            return allowedKeys.has(value)
          },
          message: 'Attempt ruleset is invalid.',
        },
      },
      context: { type: contextSchema, required: true, immutable: true },
      mode: { type: String, enum: ['standard', 'practice'], required: true, immutable: true },
      competitiveEligible: { type: Boolean, required: true, immutable: true },
      status: {
        type: String,
        enum: ['active', 'completed', 'abandoned'],
        default: 'active',
        required: true,
      },
      startedAt: { type: Date, required: true, immutable: true },
      deadlineAt: {
        type: Date,
        default: null,
        immutable: true,
        validate: {
          validator(value) {
            return value === null || (value instanceof Date && value >= this.startedAt)
          },
          message: 'Attempt deadline is invalid.',
        },
      },
      completedAt: { type: Date, default: null },
      revision: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
        max: Number.MAX_SAFE_INTEGER - 1,
        validate: Number.isSafeInteger,
      },
      score: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
        validate: {
          validator(value) {
            if (!Number.isFinite(value) || value < 0) return false
            return typeof this.maxScore !== 'number' || value <= this.maxScore
          },
          message: 'Attempt score is invalid.',
        },
      },
      maxScore: {
        type: Number,
        required: true,
        immutable: true,
        min: Number.MIN_VALUE,
        max: 1e9,
        validate: Number.isFinite,
      },
      topicOutcomes: {
        type: [topicOutcomeSchema],
        default: [],
        validate: {
          validator(value) {
            return Array.isArray(value) && value.length <= 64
          },
          message: 'Attempt topic outcomes are invalid.',
        },
      },
      feedbackJson: { type: String, default: null, validate: nullableBoundedJsonString },
      finalSnapshotJson: { type: String, default: null, validate: nullableBoundedJsonString },
      processedActions: {
        type: [processedActionSchema],
        default: [],
        validate: {
          validator(value) {
            return Array.isArray(value) && value.length <= MAX_RECEIPTS
          },
          message: 'Attempt action history is invalid.',
        },
      },
    },
    {
      timestamps: true,
      versionKey: false,
      discriminatorKey: 'rulesetKey',
      strict: 'throw',
      autoIndex: false,
      autoCreate: false,
      minimize: false,
    },
  )
  schema[knownRulesetStorageKeys] = allowedKeys
  schema.index({ playerId: 1, gameId: 1, startedAt: -1 })
  schema.index({ 'context.cohortId': 1, gameId: 1, rulesetVersion: 1, status: 1 })
  schema.index({ 'context.cohortId': 1, status: 1, completedAt: -1 })
  return schema
}

function attachRulesetModel(baseModel, entry) {
  const discriminatorName = `GameAttempt:${entry.storageKey}`
  if (baseModel.discriminators?.[discriminatorName]) return
  const discriminatorSchema = new Schema(
    { state: { type: entry.stateSchema.clone(), required: true } },
    {
      strict: 'throw',
      versionKey: false,
      autoIndex: false,
      autoCreate: false,
    },
  )
  const rulesetModel = baseModel.discriminator(
    discriminatorName,
    discriminatorSchema,
    entry.storageKey,
  )
  rulesetModel.schema
    .path('gameId')
    .validate((value) => value === entry.id, 'Attempt game id does not match its ruleset.')
  rulesetModel.schema
    .path('rulesetVersion')
    .validate(
      (value) => value === entry.rulesetVersion,
      'Attempt ruleset version does not match its registry entry.',
    )
}

function boundedJsonString(value) {
  return (
    typeof value === 'string' &&
    Buffer.byteLength(value, 'utf8') <= MAX_PUBLIC_JSON_BYTES &&
    Buffer.byteLength(value, 'utf8') <= MAX_DOCUMENT_BYTES
  )
}

function nullableBoundedJsonString(value) {
  return value === null || boundedJsonString(value)
}
