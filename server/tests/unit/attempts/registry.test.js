import { Schema } from 'mongoose'
import { describe, expect, it } from 'vitest'
import { createAttemptRegistry } from '../../../src/modules/attempts/registry.js'

function createEntry(overrides = {}) {
  return {
    id: 'sample-game',
    rulesetVersion: '1.0.0',
    learningObjective: 'Recognize safe actions in a synthetic scenario.',
    topicTags: ['phishing', 'evidence'],
    stateSchema: new Schema(
      { phase: { type: String, required: true } },
      { strict: 'throw', _id: false },
    ),
    maxScore: 100,
    maxActions: 20,
    createState: () => ({ state: { phase: 'start' }, mode: 'standard', deadlineAt: null }),
    validateAction: () => true,
    applyAction: () => ({ state: { phase: 'done' }, score: 10, outcome: {} }),
    canComplete: () => true,
    serializePublicState: (state) => state,
    summarize: () => ({ score: 0, feedback: {}, topicOutcomes: [] }),
    ...overrides,
  }
}

describe('attempt registry', () => {
  it('normalizes immutable current and historical ruleset entries', () => {
    const current = createEntry({ competitive: true })
    const historical = createEntry({ rulesetVersion: '0.9.0', current: false })
    const registry = createAttemptRegistry([current, historical])

    expect(registry.entries).toHaveLength(2)
    expect(registry.entries[0]).toMatchObject({
      id: 'sample-game',
      rulesetVersion: '1.0.0',
      storageKey: 'sample-game@1.0.0',
      current: true,
      competitive: true,
    })
    expect(registry.entries[0].topicTags).toEqual(['phishing', 'evidence'])
    expect(Object.isFrozen(registry.entries)).toBe(true)
    expect(Object.isFrozen(registry.entries[0])).toBe(true)
    expect(Object.isFrozen(registry.entries[0].topicTags)).toBe(true)
    expect(registry.getCurrent('sample-game')).toBe(registry.entries[0])
    expect(registry.get('sample-game', '0.9.0')).toBe(registry.entries[1])
    expect(registry.get('sample-game', 'missing')).toBeUndefined()
    expect(registry.getCurrent('missing')).toBeUndefined()
  })

  it('rejects duplicate pairs and multiple current versions', () => {
    expect(() => createAttemptRegistry([createEntry(), createEntry()])).toThrow(TypeError)
    expect(() =>
      createAttemptRegistry([createEntry(), createEntry({ rulesetVersion: '2', current: true })]),
    ).toThrow(TypeError)
  })

  it.each([
    ['bad game id', { id: 'Sample Game' }],
    ['long game id', { id: 'a'.repeat(81) }],
    ['bad ruleset token', { rulesetVersion: '1/2' }],
    ['empty objective', { learningObjective: '  ' }],
    ['long objective', { learningObjective: 'x'.repeat(501) }],
    ['empty topics', { topicTags: [] }],
    ['too many topics', { topicTags: Array.from({ length: 33 }, (_, index) => `tag-${index}`) }],
    ['bad topic', { topicTags: [''] }],
    ['bad score', { maxScore: Infinity }],
    ['large score', { maxScore: 1e9 + 1 }],
    ['bad action limit', { maxActions: 0 }],
    ['large action limit', { maxActions: 256 }],
    ['bad current flag', { current: 'yes' }],
    ['bad competitive flag', { competitive: 1 }],
    ['unknown field', { unexpected: true }],
    ['missing hook', { summarize: undefined }],
  ])('rejects %s', (_label, overrides) => {
    expect(() => createAttemptRegistry([createEntry(overrides)])).toThrow(TypeError)
  })

  it('requires Mongoose state schemas with strict throw mode', () => {
    expect(() => createAttemptRegistry([createEntry({ stateSchema: { paths: {} } })])).toThrow(
      TypeError,
    )
    expect(() =>
      createAttemptRegistry([
        createEntry({ stateSchema: new Schema({ phase: String }, { strict: true, _id: false }) }),
      ]),
    ).toThrow(TypeError)
  })

  it('rejects mixed and map paths at every schema depth', () => {
    const nestedMixed = new Schema(
      { nested: new Schema({ answer: Schema.Types.Mixed }, { strict: 'throw', _id: false }) },
      { strict: 'throw', _id: false },
    )
    const arrayMixed = new Schema(
      { answers: [Schema.Types.Mixed] },
      { strict: 'throw', _id: false },
    )
    const mapPath = new Schema(
      { answers: { type: Map, of: String } },
      { strict: 'throw', _id: false },
    )
    const nestedMap = new Schema(
      {
        nested: new Schema({ answers: { type: Map, of: String } }, { strict: 'throw', _id: false }),
      },
      { strict: 'throw', _id: false },
    )

    for (const stateSchema of [nestedMixed, arrayMixed, mapPath, nestedMap]) {
      expect(() => createAttemptRegistry([createEntry({ stateSchema })])).toThrow(TypeError)
    }
  })

  it('requires JSON-compatible state paths without generated identifiers', () => {
    const generatedIdSchema = new Schema({ phase: String }, { strict: 'throw' })
    const dateSchema = new Schema({ changedAt: Date }, { strict: 'throw', _id: false })
    const nestedDateSchema = new Schema(
      { inner: new Schema({ changedAt: Date }, { strict: 'throw', _id: false }) },
      { strict: 'throw', _id: false },
    )
    for (const stateSchema of [generatedIdSchema, dateSchema, nestedDateSchema]) {
      expect(() => createAttemptRegistry([createEntry({ stateSchema })])).toThrow(TypeError)
    }
  })

  it('validates the serverRecorded flag and relaxes only the play hooks', () => {
    const base = createEntry()
    for (const hook of ['createState', 'validateAction', 'applyAction', 'canComplete']) {
      const trimmed = { ...base }
      delete trimmed[hook]
      expect(() => createAttemptRegistry([trimmed])).toThrow(TypeError)
      expect(() => createAttemptRegistry([{ ...trimmed, serverRecorded: true }])).not.toThrow()
    }
    expect(() => createAttemptRegistry([createEntry({ serverRecorded: 'yes' })])).toThrow(TypeError)
    expect(createAttemptRegistry([base]).entries[0].serverRecorded).toBe(false)
    expect(
      createAttemptRegistry([createEntry({ serverRecorded: true })]).entries[0].serverRecorded,
    ).toBe(true)
    for (const hook of ['stateSchema', 'summarize', 'serializePublicState']) {
      const trimmed = { ...base, serverRecorded: true }
      delete trimmed[hook]
      expect(() => createAttemptRegistry([trimmed])).toThrow(TypeError)
    }
    expect(() =>
      createAttemptRegistry([createEntry({ serverRecorded: true, createState: 'nope' })]),
    ).toThrow(TypeError)
  })
})
