import { initializeNewsStorage } from './modules/news/models.js'
import { createNewsStore } from './modules/news/store.js'
import { createGameAdapters } from './modules/games/social-engineering-simulator/llmConfig.js'
import { createSocialEngineeringService } from './modules/games/social-engineering-simulator/service.js'
import { createShiftService } from './modules/games/social-engineering-simulator/shiftService.js'
import { createTokenBucket } from './modules/games/social-engineering-simulator/limiter.js'
import { initializeAuthStorage } from './modules/auth/storage.js'
import { createFileMailer } from './modules/auth/mailer.js'
import { initializeCohortStorage } from './modules/cohorts/storage.js'
import { initializeAuditStorage } from './modules/audit/storage.js'
import { initializeRecoveryStorage } from './modules/recovery/storage.js'
import { initializeAttemptStorage } from './modules/attempts/storage.js'
import { createProductionAttemptRegistry } from './modules/attempts/production-registry.js'
import { BOTNET_TAG_PATH } from './modules/games/botnet-tag/protocol.js'
import { createApp } from './app.js'
import { loadEnvironment } from './config/env.js'
import { connectDatabase } from './config/database.js'

const E2E_ATTEMPT_LIMITS = Object.freeze({
  startUser: 1000,
  startIp: 10000,
  actionUser: 5000,
  actionIp: 20000,
  readUser: 5000,
  readIp: 20000,
})

let database
let server
let app
let newsCleanup
let shuttingDown = false

async function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  clearInterval(newsCleanup)
  const timeout = setTimeout(() => process.exit(1), 5000).unref()
  app?.locals.presence?.close()
  app?.locals.botnetTag?.close()
  if (server) await new Promise((resolve) => server.close(resolve))
  await app?.locals.disposeAuth?.()
  if (database) await database.close()
  clearTimeout(timeout)
}

try {
  const config = loadEnvironment()
  try {
    database = await connectDatabase(
      config.nodeEnv === 'test' ? config.databaseUri : process.env.MONGO_URI,
    )
  } catch {
    throw new Error('MongoDB connection failed. Check MONGO_URI and database network access.')
  }
  try {
    await initializeNewsStorage(database)
  } catch {
    throw new Error('News storage could not initialize. Check database access and restart.')
  }
  try {
    await initializeAuthStorage(database)
  } catch {
    throw new Error('Auth storage could not initialize. Check database access and restart.')
  }
  try {
    await initializeCohortStorage(database)
  } catch {
    throw new Error('Class storage could not initialize. Check database access and restart.')
  }
  try {
    await initializeAuditStorage(database)
  } catch {
    throw new Error('Audit storage could not initialize. Check database access and restart.')
  }
  try {
    await initializeRecoveryStorage(database)
  } catch {
    throw new Error('Activation storage could not initialize. Check database access and restart.')
  }
  try {
    await initializeAttemptStorage(database, createProductionAttemptRegistry())
  } catch {
    throw new Error(
      'Saved activity storage could not initialize. Check database access and restart.',
    )
  }
  const newsStore = createNewsStore(database)
  newsCleanup = setInterval(
    () =>
      newsStore.cleanup().catch(() => {
        console.error('News expiry cleanup will retry.')
      }),
    60000,
  ).unref()
  // two adapters with fixed roles. the attacker is Gemini only: it needs
  // LLM_API_KEY, and LLM_MODEL without LLM_API_KEY leaves it unconfigured.
  // legacy LLM_BASE_URL / LLM_AUTH_TOKEN are ignored by the game. the colleague
  // is Ollama only and is configured only when LLM_COLLEAGUE_BASE_URL is set,
  // otherwise the game keeps the one-click verify. an unconfigured adapter
  // reports configured:false, so the simulator endpoints fail gracefully
  // instead of the server refusing to start
  const { attacker, colleague } = createGameAdapters(config)
  // sign-up codes are printed by the console mailer; only browser tests swap in a file mailer
  const testOutbox = config.nodeEnv === 'test' ? process.env.TEST_MAIL_OUTBOX : undefined
  app = createApp(database, {
    auth: {
      nodeEnv: config.nodeEnv,
      clientOrigin: config.clientOrigin,
      sessionSecret: config.sessionSecret,
    },
    ...(testOutbox && { mail: { mailer: createFileMailer(testOutbox) } }),
    news: {
      apiKey: config.nodeEnv === 'test' ? undefined : config.guardianApiKey,
      store: newsStore,
    },
    socialEngineering: {
      service: createSocialEngineeringService({ adapter: attacker, verifierAdapter: colleague }),
      shift: createShiftService({
        adapter: attacker,
        colleagueAdapter: colleague,
        limiter: createTokenBucket({ perMinute: config.llmRequestsPerMinute }),
      }),
    },
    // every browser test shares one loopback address, so only the e2e server lifts attempt limits
    ...(config.nodeEnv === 'test' && { attempts: { limits: E2E_ATTEMPT_LIMITS } }),
  })
  server = app.listen(config.port, '127.0.0.1')
  server.on('upgrade', (request, socket, head) => {
    const service =
      request.url?.split('?')[0] === BOTNET_TAG_PATH ? app.locals.botnetTag : app.locals.presence
    service.handleUpgrade(request, socket, head)
  })
  server.on('listening', () =>
    console.log(`SHARLOCK API ready at http://localhost:${config.port}/api/health`),
  )
  server.on('error', async () => {
    console.error('API could not listen. Check whether PORT is already in use.')
    await shutdown()
    process.exitCode = 1
  })
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, shutdown)
} catch (error) {
  // startup errors contain only fixed guidance, never connection details
  console.error(error.message)
  await shutdown()
  process.exitCode = 1
}
