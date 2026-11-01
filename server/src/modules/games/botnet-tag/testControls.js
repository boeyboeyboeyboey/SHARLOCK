import { Router } from 'express'

const NAME = /^[\w.-]{1,40}$/
const CLASS_ID = /^[a-f0-9]{24}$/

function infectOnly(round, zero) {
  for (const player of round.players()) {
    const isZero = player === zero
    player.infected = isZero
    player.startedInfected = isZero
    player.infectedAt = isZero ? round.startedAt : null
  }
}

// browser specs script a live round through this router; app.js mounts it only in a test process
export function createTagTestRouter(service) {
  if (process.env.NODE_ENV !== 'test') throw new Error('Botnet Tag test controls are test only.')
  const actions = {
    zero: (round, player) => infectOnly(round, player),
    clean: (round, player) =>
      infectOnly(
        round,
        round.players().find((other) => other !== player),
      ),
    gather(round, player) {
      for (const other of round.players()) {
        if (!other.infected) Object.assign(other, { x: player.x + 1, z: player.z })
      }
    },
    answer: (round, player) => ({ submission: round.answerFor(player.sid) }),
    elapse: (round, _player, ms) => void round.tick(round.startedAt + ms),
    finish: (round) => void round.tick(round.phaseEndsAt),
  }
  const router = Router()
  router.post('/control', (request, response) => {
    const { classId, username, action, ms } = request.body ?? {}
    const known = Object.hasOwn(actions, action)
    if (!known || !CLASS_ID.test(classId) || (username && !NAME.test(username))) {
      response.status(400).json({ error: { code: 'BAD_CONTROL' } })
      return
    }
    const round = service
      .inspectRounds()
      .filter((item) => String(item.cohortId) === classId)
      .at(-1)
    const player = round?.players().find((item) => item.username === username)
    if (!round || round.phase !== 'playing' || (username && !player)) {
      response.status(409).json({ error: { code: 'NO_ROUND' } })
      return
    }
    response.json(actions[action](round, player, Number(ms)) ?? {})
  })
  return router
}
