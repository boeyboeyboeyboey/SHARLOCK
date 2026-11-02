import { createConnection, Schema, Types } from 'mongoose'
import { afterEach, describe, expect, it } from 'vitest'
import { attemptModel } from '../../../src/modules/attempts/model.js'
import { createAttemptRegistry } from '../../../src/modules/attempts/registry.js'

const databases = []

function createFixture() {
  const database = createConnection()
  databases.push(database)
  const stateSchema = new Schema(
    { phase: { type: String, required: true }, count: { type: Number, default: 0 } },
    { strict: 'throw', _id: false },
  )
  const entry = {
    id: 'sample-game',
    rulesetVersion: '1.0.0',
    learningObjective: 'Practice safe decisions.',
    topicTags: ['training'],
    stateSchema,
    maxScore: 100,
    maxActions: 20,
    createState: () => ({ state: { phase: 'start' }, mode: 'standard', deadlineAt: null }),
    validateAction: () => true,
    applyAction: () => ({ state: { phase: 'done' }, score: 10, outcome: {} }),
    canComplete: () => true,
    serializePublicState: (state) => state,
    summarize: () => ({ score: 0, feedback: {}, topicOutcomes: [] }),
  }
  const registry = createAttemptRegistry([entry])
  const BaseAttempt = attemptModel(database, registry)
  const RulesetAttempt = BaseAttempt.discriminators[`GameAttempt:${registry.entries[0].storageKey}`]
  return { database, registry, BaseAttempt, RulesetAttempt }
}

function createAttempt(Model, overrides = {}) {
  const entry = {
    playerId: new Types.ObjectId(),
    gameId: 'sample-game',
    rulesetVersion: '1.0.0',
    rulesetKey: 'sample-game@1.0.0',
    context: { kind: 'personal', cohortId: null },
    mode: 'practice',
    competitiveEligible: false,
    status: 'active',
    startedAt: new Date('2026-10-15T00:00:00.000Z'),
    deadlineAt: null,
    completedAt: null,
    revision: 0,
    score: 0,
    maxScore: 100,
    topicOutcomes: [],
    feedbackJson: null,
    finalSnapshotJson: null,
    processedActions: [],
    state: { phase: 'start', count: 0 },
    ...overrides,
  }
  return new Model(entry)
}

afterEach(() => {
  while (databases.length > 0) databases.pop().destroy()
})

describe('attempt data models', () => {
  it('binds one strict base collection with bounded indexes and discriminator state', () => {
    const { BaseAttempt, RulesetAttempt, registry } = createFixture()
    expect(BaseAttempt.collection.collectionName).toBe('game_attempts')
    expect(BaseAttempt.schema.options).toMatchObject({
      timestamps: true,
      versionKey: false,
      discriminatorKey: 'rulesetKey',
      strict: 'throw',
      autoIndex: false,
      autoCreate: false,
    })
    expect(BaseAttempt.schema.path('state')).toBeUndefined()
    expect(RulesetAttempt.schema.path('state').schema.options.strict).toBe('throw')
    expect(BaseAttempt.schema.indexes()).toContainEqual([
      { playerId: 1, gameId: 1, startedAt: -1 },
      {},
    ])
    expect(BaseAttempt.schema.indexes()).toContainEqual([
      { 'context.cohortId': 1, gameId: 1, rulesetVersion: 1, status: 1 },
      {},
    ])
    expect(Object.keys(BaseAttempt.discriminators)).toContain(
      `GameAttempt:${registry.entries[0].storageKey}`,
    )
  })

  it('validates immutable context, bounded numeric fields, outcomes and receipts', async () => {
    const { RulesetAttempt } = createFixture()
    const valid = createAttempt(RulesetAttempt)
    await expect(valid.validate()).resolves.toBeUndefined()
    expect(RulesetAttempt.schema.path('playerId').options.immutable).toBe(true)
    expect(RulesetAttempt.schema.path('context').options.immutable).toBe(true)
    expect(RulesetAttempt.schema.path('rulesetVersion').options.immutable).toBe(true)

    const invalidContext = await createAttempt(RulesetAttempt, {
      context: { kind: 'personal', cohortId: new Types.ObjectId() },
    })
      .validate()
      .catch((error) => error)
    expect(invalidContext.name).toBe('ValidationError')
    expect(Object.keys(invalidContext.errors)).not.toHaveLength(0)
    await expect(
      createAttempt(RulesetAttempt, { revision: Number.MAX_SAFE_INTEGER }).validate(),
    ).rejects.toHaveProperty('errors.revision')
    await expect(createAttempt(RulesetAttempt, { score: 1001 }).validate()).rejects.toHaveProperty(
      'errors.score',
    )
    await expect(
      createAttempt(RulesetAttempt, {
        topicOutcomes: Array.from({ length: 65 }, () => ({
          topic: 'x',
          achieved: true,
          feedbackCode: 'ok',
        })),
      }).validate(),
    ).rejects.toHaveProperty('errors.topicOutcomes')
    await expect(
      createAttempt(RulesetAttempt, {
        processedActions: Array.from({ length: 257 }, () => ({
          actionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          requestHash: 'a'.repeat(64),
          outcomeJson: '{}',
        })),
      }).validate(),
    ).rejects.toHaveProperty('errors.processedActions')
    await expect(
      createAttempt(RulesetAttempt, { feedbackJson: 'x'.repeat(131073) }).validate(),
    ).rejects.toHaveProperty('errors.feedbackJson')
  })

  it('reports unknown attempt and state fields as validation errors', () => {
    const { RulesetAttempt } = createFixture()
    expect(() => createAttempt(RulesetAttempt, { answerKey: 'private' })).toThrow()
    const invalidState = createAttempt(RulesetAttempt, {
      state: { phase: 'start', secret: 'private' },
    })
    return expect(invalidState.validate()).rejects.toHaveProperty('errors.state')
  })

  it('keeps state on base hydration and discriminator CAS update casting', async () => {
    const { BaseAttempt, RulesetAttempt } = createFixture()
    const id = new Types.ObjectId()
    const hydrated = BaseAttempt.hydrate({
      _id: id,
      rulesetKey: 'sample-game@1.0.0',
      playerId: new Types.ObjectId(),
      gameId: 'sample-game',
      rulesetVersion: '1.0.0',
      context: { kind: 'personal', cohortId: null },
      mode: 'practice',
      competitiveEligible: false,
      status: 'active',
      startedAt: new Date('2026-10-15T00:00:00.000Z'),
      deadlineAt: null,
      revision: 0,
      score: 0,
      maxScore: 100,
      state: { phase: 'start', count: 2 },
      processedActions: [],
      topicOutcomes: [],
    })
    expect(hydrated.state.toObject()).toMatchObject({ phase: 'start', count: 2 })

    const query = RulesetAttempt.findOneAndUpdate(
      { _id: id, revision: 0 },
      { $set: { state: { phase: 'next', count: 3 }, score: 10, revision: 1 } },
      { runValidators: true },
    )
    const castedUpdate = query._castUpdate(query.getUpdate())
    await expect(
      query.validate(castedUpdate, query._optionsForExec(), false),
    ).resolves.toBeUndefined()
    expect(castedUpdate.$set.state.phase).toBe('next')

    const invalidQuery = RulesetAttempt.findOneAndUpdate(
      { _id: id, revision: 0 },
      { $set: { state: { phase: 'next', secret: 'private' } } },
    )
    expect(() => invalidQuery._castUpdate(invalidQuery.getUpdate())).toThrow()
  })
})
