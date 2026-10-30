import { describe, expect, it } from 'vitest'
import { assertSafeTestDatabaseUri, databaseNameFromUri } from '../../src/config/database-uri.js'
import { validateEnvironment } from '../../src/config/env.js'

const base = {
  NODE_ENV: 'development',
  PORT: '3000',
  CLIENT_ORIGIN: 'http://localhost:5173',
  MONGO_URI: 'mongodb://127.0.0.1:27018/sharlock_dev',
  SESSION_SECRET: 'a'.repeat(64),
}

describe('environment validation', () => {
  it('uses MONGO_URI, including Atlas connections without a database path', () => {
    const uri = 'mongodb+srv://member:private@example.mongodb.net/?retryWrites=true'
    expect(validateEnvironment({ ...base, MONGO_URI: uri }).databaseUri).toBe(uri)
    expect(databaseNameFromUri(uri, 'MONGO_URI', 'sharlock_dev')).toBe('sharlock_dev')
    expect(() => validateEnvironment({ ...base, MONGO_URI: undefined })).toThrow('MONGO_URI')
  })
  it('selects the explicit test database without falling back to development', () => {
    const testUri = 'mongodb://127.0.0.1:27019/sharlock_unit_test'
    expect(
      validateEnvironment({ ...base, NODE_ENV: 'test', TEST_MONGODB_URI: testUri }).databaseUri,
    ).toBe(testUri)
    expect(() => validateEnvironment({ ...base, NODE_ENV: 'test' })).toThrow('TEST_MONGODB_URI')
  })

  it.each([
    ['SESSION_SECRET', 'replace-with-secret'],
    ['PORT', '3000.5'],
    ['PORT', '65536'],
    ['CLIENT_ORIGIN', 'http://example.com:5173'],
    ['CLIENT_ORIGIN', 'http://localhost:5173/path'],
    ['CLIENT_ORIGIN', 'http://user:password@localhost:5173'],
    ['NODE_ENV', 'unexpected'],
  ])('rejects invalid %s', (key, value) => {
    expect(() => validateEnvironment({ ...base, [key]: value })).toThrow(key)
  })
})

describe('database safety', () => {
  it.each([
    undefined,
    '',
    'https://localhost/example_test',
    'mongodb://localhost/',
    'mongodb://localhost/admin',
    'mongodb://localhost/sharlock_dev',
    'mongodb://localhost/sharlock_test?dbName=sharlock_dev',
    'mongodb://localhost/sharlock_test?DBNAME=sharlock_dev',
    'mongodb://localhost/sharlock%2F_test',
  ])('rejects an unsafe test connection: %s', (uri) => {
    expect(() => assertSafeTestDatabaseUri(uri)).toThrow()
  })

  it('compares decoded database names across host aliases and casing', () => {
    expect(() =>
      assertSafeTestDatabaseUri(
        'mongodb://localhost/shared_test',
        'mongodb://127.0.0.1/%73hared_test',
      ),
    ).toThrow('different')
    expect(() =>
      assertSafeTestDatabaseUri(
        'mongodb://localhost/shared_test',
        'mongodb://elsewhere/SHARED_TEST',
      ),
    ).toThrow('different')
  })

  it('supports authenticated SRV URIs without exposing their credentials', () => {
    expect(
      databaseNameFromUri(
        'mongodb+srv://member:private@example.mongodb.net/member_dev?retryWrites=true',
      ),
    ).toBe('member_dev')
    try {
      databaseNameFromUri('mongodb+srv://member:private@example.mongodb.net/')
      expect.unreachable()
    } catch (error) {
      expect(error.message).not.toContain('private')
      expect(error.message).not.toContain('example.mongodb.net')
    }
  })
})

describe('LLM configuration', () => {
  it('is undefined when unset and trimmed when set', () => {
    const unset = validateEnvironment(base)
    expect(unset.llmBaseUrl).toBeUndefined()
    expect(unset.llmModel).toBeUndefined()
    expect(unset.llmApiKey).toBeUndefined()
    expect(unset.llmAuthToken).toBeUndefined()

    const configured = {
      ...base,
      LLM_BASE_URL: '  http://127.0.0.1:11434  ',
      LLM_MODEL: '  llama3.2:1b  ',
      LLM_API_KEY: '  sk-example-key  ',
      LLM_AUTH_TOKEN: '  gateway-token  ',
    }
    const result = validateEnvironment(configured)
    expect(result.llmBaseUrl).toBe('http://127.0.0.1:11434')
    expect(result.llmModel).toBe('llama3.2:1b')
    expect(result.llmApiKey).toBe('sk-example-key')
    expect(result.llmAuthToken).toBe('gateway-token')
  })

  it('defaults the colleague settings and reads them when set', () => {
    const unset = validateEnvironment(base)
    expect(unset.llmColleagueBaseUrl).toBeUndefined()
    expect(unset.llmColleagueModel).toBeUndefined()
    expect(unset.llmColleagueAuthToken).toBeUndefined()
    expect(unset.llmColleagueTimeoutMs).toBe(60000)

    const result = validateEnvironment({
      ...base,
      LLM_COLLEAGUE_BASE_URL: '  http://h:8080  ',
      LLM_COLLEAGUE_MODEL: ' llama3.2:3b-fast ',
      LLM_COLLEAGUE_AUTH_TOKEN: ' tok ',
      LLM_COLLEAGUE_TIMEOUT_MS: '45000',
    })
    expect(result.llmColleagueBaseUrl).toBe('http://h:8080')
    expect(result.llmColleagueModel).toBe('llama3.2:3b-fast')
    expect(result.llmColleagueAuthToken).toBe('tok')
    expect(result.llmColleagueTimeoutMs).toBe(45000)
  })

  it('defaults the model request limit to 10 a minute and rejects bad values', () => {
    expect(validateEnvironment(base).llmRequestsPerMinute).toBe(10)
    expect(
      validateEnvironment({ ...base, LLM_REQUESTS_PER_MINUTE: ' 20 ' }).llmRequestsPerMinute,
    ).toBe(20)
    for (const value of ['0', 'abc', '601', '1.5']) {
      expect(() => validateEnvironment({ ...base, LLM_REQUESTS_PER_MINUTE: value })).toThrow(
        /LLM_REQUESTS_PER_MINUTE/,
      )
    }
  })

  it('requires the colleague base url and model together', () => {
    expect(() => validateEnvironment({ ...base, LLM_COLLEAGUE_BASE_URL: 'http://h:8080' })).toThrow(
      /must both be set or both left empty/,
    )
    expect(() => validateEnvironment({ ...base, LLM_COLLEAGUE_MODEL: 'm' })).toThrow(
      /must both be set or both left empty/,
    )
  })

  it('accepts the colleague timeout upper bound of 60000', () => {
    const result = validateEnvironment({ ...base, LLM_COLLEAGUE_TIMEOUT_MS: '60000' })
    expect(result.llmColleagueTimeoutMs).toBe(60000)
  })

  it.each(['500', 'abc', '60001', '90000', '400000'])('rejects colleague timeout %s', (value) => {
    expect(() => validateEnvironment({ ...base, LLM_COLLEAGUE_TIMEOUT_MS: value })).toThrow(
      /LLM_COLLEAGUE_TIMEOUT_MS/,
    )
  })

  it('rejects a non-http colleague base url', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        LLM_COLLEAGUE_BASE_URL: 'ftp://h:8080',
        LLM_COLLEAGUE_MODEL: 'm',
      }),
    ).toThrow(/LLM_COLLEAGUE_BASE_URL/)
  })
})
