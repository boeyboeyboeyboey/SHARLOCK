import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'dotenv'
import { assertSafeTestDatabaseUri, databaseNameFromUri } from './database-uri.js'

export const environmentPath = fileURLToPath(new URL('../../.env', import.meta.url))
export const rootEnvironmentPath = fileURLToPath(new URL('../../../.env', import.meta.url))

export function readEnvironmentFile(path = environmentPath) {
  try {
    return parse(readFileSync(path))
  } catch (error) {
    if (error.code === 'ENOENT') return {}
    throw new Error('Unable to read the server environment file.', { cause: error })
  }
}

export function validateEnvironment(env) {
  const nodeEnv = env.NODE_ENV || 'development'
  if (!['development', 'test'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development or test for this localhost scaffold.')
  }

  const port = Number(env.PORT || 3000)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('PORT must be an integer between 1024 and 65535.')
  }

  const clientOrigin = env.CLIENT_ORIGIN || 'http://localhost:5173'
  try {
    const origin = new URL(clientOrigin)
    if (
      origin.protocol !== 'http:' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) ||
      origin.origin !== clientOrigin ||
      origin.username ||
      origin.password
    )
      throw new Error()
  } catch {
    throw new Error(
      'CLIENT_ORIGIN must be an exact HTTP loopback origin, for example http://localhost:5173.',
    )
  }

  if (!/^[a-fA-F0-9]{64,}$/.test(env.SESSION_SECRET || '')) {
    throw new Error(
      'SESSION_SECRET must contain at least 64 random hexadecimal characters. Run pnpm setup:env.',
    )
  }

  const databaseUri =
    nodeEnv === 'test'
      ? assertSafeTestDatabaseUri(env.TEST_MONGODB_URI, env.MONGO_URI)
      : env.MONGO_URI
  databaseNameFromUri(
    databaseUri,
    'MONGO_URI',
    nodeEnv === 'development' ? 'sharlock_dev' : undefined,
  )

  // the real-colleague chat runs on its own ollama server, separate from the attacker
  const llmColleagueBaseUrl = env.LLM_COLLEAGUE_BASE_URL?.trim() || undefined
  const llmColleagueModel = env.LLM_COLLEAGUE_MODEL?.trim() || undefined
  if (Boolean(llmColleagueBaseUrl) !== Boolean(llmColleagueModel)) {
    throw new Error(
      'LLM_COLLEAGUE_BASE_URL and LLM_COLLEAGUE_MODEL must both be set or both left empty.',
    )
  }
  if (llmColleagueBaseUrl) {
    try {
      if (!['http:', 'https:'].includes(new URL(llmColleagueBaseUrl).protocol)) throw new Error()
    } catch {
      throw new Error('LLM_COLLEAGUE_BASE_URL must be an http or https URL.')
    }
  }
  // capped at 60000 because the browser stops waiting for the colleague at 65000
  const llmColleagueTimeoutMs = Number(env.LLM_COLLEAGUE_TIMEOUT_MS?.trim() || 60000)
  if (
    !Number.isInteger(llmColleagueTimeoutMs) ||
    llmColleagueTimeoutMs < 1000 ||
    llmColleagueTimeoutMs > 60000
  ) {
    throw new Error('LLM_COLLEAGUE_TIMEOUT_MS must be an integer between 1000 and 60000.')
  }

  // model requests per minute across all players, so a free tier key is never exhausted
  const llmRequestsPerMinute = Number(env.LLM_REQUESTS_PER_MINUTE?.trim() || 10)
  if (
    !Number.isInteger(llmRequestsPerMinute) ||
    llmRequestsPerMinute < 1 ||
    llmRequestsPerMinute > 600
  ) {
    throw new Error('LLM_REQUESTS_PER_MINUTE must be an integer between 1 and 600.')
  }

  return Object.freeze({
    nodeEnv,
    port,
    clientOrigin,
    databaseUri,
    sessionSecret: env.SESSION_SECRET,
    guardianApiKey: env.GUARDIAN_API_KEY?.trim() || undefined,
    llmBaseUrl: env.LLM_BASE_URL?.trim() || undefined,
    llmModel: env.LLM_MODEL?.trim() || undefined,
    llmApiKey: env.LLM_API_KEY?.trim() || undefined,
    llmAuthToken: env.LLM_AUTH_TOKEN?.trim() || undefined,
    llmColleagueBaseUrl,
    llmColleagueModel,
    llmColleagueAuthToken: env.LLM_COLLEAGUE_AUTH_TOKEN?.trim() || undefined,
    llmColleagueTimeoutMs,
    llmRequestsPerMinute,
  })
}

export function loadEnvironment() {
  // shell values take precedence over root settings and server defaults
  const fileValues = { ...readEnvironmentFile(), ...readEnvironmentFile(rootEnvironmentPath) }
  for (const [key, value] of Object.entries(fileValues)) {
    if (process.env[key] === undefined) process.env[key] = value
  }
  return validateEnvironment(process.env)
}
