import { randomUUID } from 'node:crypto'
import express from 'express'
import { createNewsRouter } from './modules/news/router.js'
import { createSocialEngineeringRouter } from './modules/games/social-engineering-simulator/router.js'
import { createCliDefenderRouter } from './modules/games/cli-cyber-defender/router.js'
import { createAuthRouter } from './modules/auth/router.js'
import { createCohortRouter } from './modules/cohorts/router.js'
import { createAuditRouter } from './modules/audit/router.js'
import { createAdminRouter } from './modules/admin/router.js'
import { createAttemptRouter } from './modules/attempts/router.js'
import { createAttemptService } from './modules/attempts/service.js'
import { createProductionAttemptRegistry } from './modules/attempts/production-registry.js'
import { createProgressRouter } from './modules/progress/router.js'
import { createClassResultsRouter } from './modules/class-results/router.js'
import { createLeaderboardRouter } from './modules/leaderboards/router.js'
import { createProfileRouter } from './modules/profile/router.js'
import { createRecoveryRouter } from './modules/recovery/router.js'
import { createHealthRouter } from './routes/health.js'
import { handleError, notFound } from './middleware/errors.js'

export function createApp(
  database,
  {
    auth,
    mail = {},
    admin = {},
    audit = {},
    cohorts = {},
    attempts = {},
    progress = {},
    news = {},
    socialEngineering = {},
    cliDefender = {},
  } = {},
) {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', false)
  app.use((_request, response, next) => {
    response.locals.requestId = randomUUID()
    response.set('X-Request-ID', response.locals.requestId)
    response.set('X-Content-Type-Options', 'nosniff')
    next()
  })
  app.use(express.json({ limit: '16kb' }))
  const authRuntime = createAuthRouter(database, auth, mail.mailer ? { mailer: mail.mailer } : {})
  app.use('/api/auth', authRuntime.router)
  const adminRouter = createAdminRouter(database, {
    ...admin,
    now: admin.now ?? authRuntime.now,
    clientOrigin: authRuntime.clientOrigin,
    requireSession: authRuntime.requireSession,
    requireMutation: authRuntime.requireMutation,
  })
  app.use('/api', adminRouter)
  app.use(
    '/api',
    createRecoveryRouter(database, {
      now: authRuntime.now,
      clientOrigin: authRuntime.clientOrigin,
      requireSession: authRuntime.requireSession,
      requireMutation: authRuntime.requireMutation,
      ...authRuntime.recoveryLimits,
    }),
  )
  const cohortRouter = createCohortRouter(database, {
    ...cohorts,
    now: cohorts.now ?? authRuntime.now,
    clientOrigin: authRuntime.clientOrigin,
    requireSession: authRuntime.requireSession,
    requireMutation: authRuntime.requireMutation,
  })
  app.use('/api', cohortRouter)
  const attemptRouter = createAttemptRouter(database, {
    registry: createProductionAttemptRegistry(),
    ...attempts,
    now: attempts.now ?? authRuntime.now,
    requireSession: authRuntime.requireSession,
    requireMutation: authRuntime.requireMutation,
  })
  app.use('/api', attemptRouter)
  const progressRouter = createProgressRouter(database, {
    registry: attempts.registry ?? createProductionAttemptRegistry(),
    ...progress,
    now: progress.now ?? attempts.now ?? authRuntime.now,
    requireSession: authRuntime.requireSession,
  })
  app.use('/api', progressRouter)
  const classResultsRouter = createClassResultsRouter(database, {
    registry: attempts.registry ?? createProductionAttemptRegistry(),
    requireSession: authRuntime.requireSession,
  })
  app.use('/api', classResultsRouter)
  const leaderboardRouter = createLeaderboardRouter(database, {
    registry: attempts.registry ?? createProductionAttemptRegistry(),
    requireSession: authRuntime.requireSession,
  })
  app.use('/api', leaderboardRouter)
  app.use(
    '/api',
    createProfileRouter(database, {
      requireSession: authRuntime.requireSession,
      requireMutation: authRuntime.requireMutation,
    }),
  )
  app.use(
    '/api',
    createAuditRouter(database, { ...audit, requireSession: authRuntime.requireSession }),
  )
  app.use('/api', createHealthRouter(database))
  app.use('/api', createNewsRouter(database, news))
  // one attempts service records every server-recorded game
  const recordedAttempts = createAttemptService(database, {
    registry: attempts.registry ?? createProductionAttemptRegistry(),
    now: attempts.now ?? authRuntime.now,
  })
  app.use(
    '/api',
    createSocialEngineeringRouter({
      ...socialEngineering,
      attempts: socialEngineering.attempts ?? recordedAttempts,
      requireSession: authRuntime.requireSession,
      requireMutation: authRuntime.requireMutation,
    }),
  )
  app.use(
    '/api',
    createCliDefenderRouter({
      ...cliDefender,
      attempts: cliDefender.attempts ?? recordedAttempts,
      requireSession: authRuntime.requireSession,
      requireMutation: authRuntime.requireMutation,
    }),
  )
  app.use(notFound)
  app.use(handleError)
  app.locals.disposeAuth = () => {
    adminRouter.dispose()
    cohortRouter.dispose()
    attemptRouter.dispose()
    progressRouter.dispose()
    classResultsRouter.dispose()
    leaderboardRouter.dispose()
    authRuntime.dispose()
  }
  return app
}
