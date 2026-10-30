import { randomBytes } from 'node:crypto'
import { WebSocketServer } from 'ws'
import { hasExpectedOrigin } from '../../auth/csrf.js'
import { roleFor } from '../../presence/protocol.js'
import { createRoomResolver } from '../../presence/rooms.js'
import { createRound } from './rounds.js'
import { MAX_PLAYERS } from './rules.js'
import { GAME_ID } from './ruleset.js'
import { BOTNET_TAG_PATH, MAX_PAYLOAD_BYTES, allowMessage, parseClientMessage } from './protocol.js'

const STRIKE_LIMIT = 30
const STRIKE_WINDOW_MS = 10000
const LOBBY_SNAPSHOT_MS = 500

const REJECTIONS = Object.freeze({ 401: 'Unauthorized', 403: 'Forbidden' })

function reject(socket, status) {
  if (socket.writable) {
    socket.write(
      `HTTP/1.1 ${status} ${REJECTIONS[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
    )
  }
  socket.destroy()
}

export function createBotnetTagService(
  database,
  {
    clientOrigin,
    resolveSessionUser,
    recheckSession,
    attempts,
    now = Date.now,
    rng = Math.random,
    tickMs = 1000 / 15,
    heartbeatMs = 30000,
    recheckMs = 60000,
    rooms = createRoomResolver(database),
  },
) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES })
  const connections = new Set()
  // cohortId -> Map(roundId -> entry); an entry owns one round, its members and its tick timer
  const classes = new Map()
  let closed = false

  function send(connection, message) {
    if (connection.ws.readyState === connection.ws.OPEN) {
      connection.ws.send(JSON.stringify(message))
    }
  }

  function sendSnapshot(connection) {
    const { entry } = connection
    if (!entry) return
    send(connection, {
      type: 'snapshot',
      sid: connection.sid,
      ...entry.round.snapshot(connection.sid, now()),
    })
    connection.lastSnapshotAt = now()
  }

  // wall clock start of the round, valid for a real or an injected clock
  const wallStart = (round) => new Date(Date.now() - (now() - round.startedAt))

  // saves one practice attempt per human non-staff player, once per round
  async function saveResults(entry, members, results) {
    const startedAt = wallStart(entry.round)
    await Promise.all(
      members.map(async (connection) => {
        const result = results.find((item) => item.sid === connection.sid)
        if (!result || result.isBot || connection.isStaff) return
        let saved
        try {
          const attempt = await attempts.recordCompletedAttempt(
            { id: connection.userId },
            GAME_ID,
            {
              context: { kind: 'cohort', cohortId: entry.cohortId },
              mode: 'practice',
              startedAt,
              resultKey: `${entry.round.id}-${connection.sid}`,
              state: {
                outcome: result.outcome,
                sideWon: result.sideWon,
                survivalSeconds: result.survivalSeconds,
                patches: result.patches,
                tags: result.tags,
                startedInfected: result.startedInfected,
                cleanAtEnd: result.cleanAtEnd,
              },
            },
          )
          saved = { saved: true, score: attempt.score, maxScore: attempt.maxScore }
        } catch {
          saved = { saved: false }
        }
        send(connection, { type: 'saved', ...saved })
      }),
    )
  }

  // reacts to a phase change after any action or tick: results go out and are saved once
  function afterChange(entry) {
    const { round } = entry
    const events = round.drainEvents()
    if (events.length > 0)
      for (const member of entry.members) send(member, { type: 'events', events })
    if (round.phase === 'results') {
      if (!entry.resultsSent) {
        entry.resultsSent = true
        const members = [...entry.members]
        const results = round.results()
        for (const member of members) {
          send(member, { type: 'results', sideWon: round.sideWon, results })
        }
        entry.savePending = saveResults(entry, members, results).catch(() => {})
      }
    } else entry.resultsSent = false
  }

  function broadcastSnapshots(entry) {
    const at = now()
    const playing = entry.round.phase === 'playing'
    for (const member of entry.members) {
      if (playing || at - member.lastSnapshotAt >= LOBBY_SNAPSHOT_MS) sendSnapshot(member)
    }
  }

  function tickEntry(entry) {
    entry.round.tick(now())
    afterChange(entry)
    broadcastSnapshots(entry)
  }

  function createEntry(cohortId) {
    const id = `r-${randomBytes(6).toString('hex')}`
    const entry = {
      cohortId,
      round: createRound({ id, cohortId, now: now(), rng, withBots: true }),
      members: new Set(),
      resultsSent: false,
      savePending: null,
      timer: null,
    }
    entry.timer = setInterval(() => tickEntry(entry), tickMs)
    entry.timer.unref?.()
    if (!classes.has(cohortId)) classes.set(cohortId, new Map())
    classes.get(cohortId).set(id, entry)
    return entry
  }

  function dropEntry(entry) {
    clearInterval(entry.timer)
    const byClass = classes.get(entry.cohortId)
    byClass?.delete(entry.round.id)
    if (byClass?.size === 0) classes.delete(entry.cohortId)
  }

  function playerInfo(connection) {
    return {
      sid: connection.sid,
      username: connection.username,
      avatarId: connection.avatarId,
      isStaff: connection.isStaff,
    }
  }

  // puts the socket in an open lobby round of its class, or starts a new one
  function placeInRound(connection) {
    const open = [...(classes.get(connection.cohortId)?.values() ?? [])].filter(
      (entry) => entry.round.phase === 'lobby',
    )
    for (const entry of open) {
      if (entry.round.size >= MAX_PLAYERS && !entry.round.players().some((p) => p.isBot)) continue
      if (entry.round.join(playerInfo(connection), now()).ok) {
        attach(connection, entry)
        return
      }
    }
    const entry = createEntry(connection.cohortId)
    entry.round.join(playerInfo(connection), now())
    attach(connection, entry)
  }

  function attach(connection, entry) {
    connection.entry = entry
    entry.members.add(connection)
    afterChange(entry)
    // everyone in the lobby sees the newcomer at once
    for (const member of entry.members) sendSnapshot(member)
  }

  function leaveRound(connection) {
    const { entry } = connection
    if (!entry) return
    connection.entry = null
    entry.members.delete(connection)
    entry.round.leave(connection.sid, now())
    if (entry.members.size === 0) dropEntry(entry)
    else afterChange(entry)
  }

  function strike(connection) {
    const current = now()
    if (current - connection.strikeWindowStart > STRIKE_WINDOW_MS) {
      connection.strikeWindowStart = current
      connection.strikes = 0
    }
    connection.strikes += 1
    if (connection.strikes >= STRIKE_LIMIT) connection.ws.close(4408, 'too many bad messages')
  }

  async function handleMessage(connection, raw) {
    const message = parseClientMessage(raw)
    if (!message) {
      strike(connection)
      return
    }
    if (!allowMessage(connection.counters, message.type, now())) {
      strike(connection)
      return
    }
    if (message.type === 'join') {
      if (!connection.isStaff || connection.cohortId) {
        strike(connection)
        return
      }
      if (!(await rooms.staffMayJoin(connection.user, message.cohortId))) {
        connection.ws.close(4403, 'class not available')
        return
      }
      if (connection.ws.readyState !== connection.ws.OPEN || connection.cohortId) return
      connection.cohortId = message.cohortId
      placeInRound(connection)
      return
    }
    const { entry } = connection
    if (!entry) return
    const { round } = entry
    const at = now()
    switch (message.type) {
      case 'ready':
        round.setReady(connection.sid, message.ready, at)
        break
      case 'move':
        round.move(connection.sid, message, at)
        break
      case 'sprint':
        round.sprint(connection.sid, at)
        break
      case 'tag':
        round.tag(connection.sid, message.target, at)
        break
      case 'station':
        round.stationStart(connection.sid, message.id, at)
        break
      case 'submit':
        round.stationSubmit(connection.sid, message.submission, at)
        break
      case 'leave':
        leaveRound(connection)
        connection.ws.close(1000, 'left')
        return
    }
    afterChange(entry)
    if (message.type === 'ready') for (const member of entry.members) sendSnapshot(member)
    else if (message.type === 'station' || message.type === 'submit') sendSnapshot(connection)
  }

  function register(ws, session, cohortId) {
    const { user, sessionId } = session
    const role = roleFor(user.globalRoles)
    const connection = {
      ws,
      sid: randomBytes(9).toString('hex'),
      user,
      userId: user.id,
      sessionId,
      username: user.username,
      avatarId: user.avatarId,
      isStaff: role === 'staff',
      cohortId: null,
      entry: null,
      counters: new Map(),
      lastSnapshotAt: 0,
      strikes: 0,
      strikeWindowStart: now(),
      alive: true,
    }
    // one game socket per account: the newest wins
    for (const older of connections) {
      if (older.userId !== connection.userId) continue
      leaveRound(older)
      older.ws.close(4409, 'superseded')
    }
    connections.add(connection)
    ws.on('pong', () => {
      connection.alive = true
    })
    ws.on('message', (raw) => {
      handleMessage(connection, raw).catch(() => ws.close(1011, 'error'))
    })
    ws.on('error', () => ws.terminate())
    ws.on('close', () => {
      leaveRound(connection)
      connections.delete(connection)
    })
    if (cohortId) {
      connection.cohortId = cohortId
      placeInRound(connection)
    }
  }

  async function handleUpgrade(request, socket, head) {
    socket.on('error', () => socket.destroy())
    let pathname
    try {
      pathname = new URL(request.url, 'http://localhost').pathname
    } catch {
      socket.destroy()
      return
    }
    if (closed || pathname !== BOTNET_TAG_PATH) {
      socket.destroy()
      return
    }
    if (!hasExpectedOrigin(request.headers, clientOrigin)) {
      reject(socket, 403)
      return
    }
    try {
      const session = await resolveSessionUser(request)
      if (!session) {
        reject(socket, 401)
        return
      }
      const isStudent = roleFor(session.user.globalRoles) === 'student'
      const cohortId = isStudent ? await rooms.studentRoom(session.user.id) : null
      if (closed || socket.destroyed) {
        socket.destroy()
        return
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        if (isStudent && !cohortId) {
          ws.close(4403, 'no active class')
          return
        }
        register(ws, session, cohortId)
      })
    } catch {
      reject(socket, 401)
    }
  }

  // closes sockets whose session, account or class access no longer holds
  async function recheck(connection) {
    try {
      const session = await recheckSession(connection.sessionId)
      if (!session) {
        connection.ws.close(4401, 'signed out')
        return
      }
      connection.user = session.user
      connection.username = session.user.username
      if (!connection.isStaff) {
        if ((await rooms.studentRoom(connection.userId)) !== connection.cohortId) {
          connection.ws.close(4403, 'class changed')
        }
      } else if (
        connection.cohortId &&
        !(await rooms.staffMayJoin(connection.user, connection.cohortId))
      ) {
        connection.ws.close(4403, 'class not available')
      }
    } catch {
      connection.ws.close(1011, 'error')
    }
  }

  const refresh = () => Promise.all([...connections].map(recheck))

  function closeWhere(predicate, code, reason) {
    for (const connection of connections) {
      if (predicate(connection)) connection.ws.close(code, reason)
    }
  }

  const heartbeat = setInterval(() => {
    for (const connection of connections) {
      if (!connection.alive) {
        connection.ws.terminate()
        continue
      }
      connection.alive = false
      connection.ws.ping()
    }
  }, heartbeatMs).unref()
  const recheckTimer = setInterval(() => void refresh(), recheckMs).unref()

  const allEntries = () => [...classes.values()].flatMap((byClass) => [...byClass.values()])

  function close() {
    closed = true
    clearInterval(heartbeat)
    clearInterval(recheckTimer)
    for (const entry of allEntries()) clearInterval(entry.timer)
    for (const connection of connections) connection.ws.terminate()
    wss.close()
  }

  return Object.freeze({
    handleUpgrade,
    refresh,
    disconnectSession: (sessionId, reason) =>
      closeWhere(
        (entry) => entry.sessionId === sessionId,
        4401,
        reason === 'replaced' ? 'replaced' : 'signed out',
      ),
    disconnectUser: (userId) => closeWhere((entry) => entry.userId === userId, 4401, 'signed out'),
    connectionCount: () => connections.size,
    roundCount: () => allEntries().length,
    // tests only: advances every round once, and exposes live rounds and pending saves
    tickAll: () => allEntries().forEach(tickEntry),
    inspectRounds: () => allEntries().map((entry) => entry.round),
    settleSaves: () => Promise.all(allEntries().map((entry) => entry.savePending)),
    close,
  })
}
