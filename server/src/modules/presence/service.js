import { randomBytes } from 'node:crypto'
import { WebSocketServer } from 'ws'
import { hasExpectedOrigin } from '../auth/csrf.js'
import { publicLook } from './look.js'
import {
  MAX_PAYLOAD_BYTES,
  PRESENCE_PATH,
  movesTooFast,
  parseClientMessage,
  roleFor,
} from './protocol.js'
import { createRoomResolver } from './rooms.js'

const STRIKE_LIMIT = 30
const STRIKE_WINDOW_MS = 10000

const REJECTIONS = Object.freeze({
  401: 'Unauthorized',
  403: 'Forbidden',
})

function reject(socket, status) {
  if (socket.writable) {
    socket.write(
      `HTTP/1.1 ${status} ${REJECTIONS[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
    )
  }
  socket.destroy()
}

export function createPresenceService(
  database,
  {
    clientOrigin,
    resolveSessionUser,
    recheckSession,
    now = Date.now,
    heartbeatMs = 30000,
    recheckMs = 60000,
    rooms = createRoomResolver(database),
  },
) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES })
  const connections = new Set()
  const roomMembers = new Map()
  let closed = false

  function send(connection, message) {
    if (connection.ws.readyState === connection.ws.OPEN) {
      connection.ws.send(JSON.stringify(message))
    }
  }

  // what a viewer may know about a peer: coordinates only when both share a mode, else just that they are online
  function stateOf(connection, viewer = connection) {
    const base = {
      type: 'state',
      sid: connection.sid,
      username: connection.username,
      avatarId: connection.avatarId,
      look: connection.look,
      role: connection.role,
      mode: connection.mode,
    }
    if (connection.mode !== viewer.mode) return { ...base, moving: false }
    if (connection.mode === '2d') {
      return { ...base, x: connection.x, y: connection.y, moving: connection.moving }
    }
    return {
      ...base,
      x: connection.x,
      z: connection.z,
      yaw: connection.yaw,
      moving: connection.moving,
    }
  }

  function broadcastState(connection) {
    for (const peer of roomMembers.get(connection.cohortId) ?? []) {
      if (peer !== connection) send(peer, stateOf(connection, peer))
    }
  }

  function broadcast(connection, message) {
    for (const peer of roomMembers.get(connection.cohortId) ?? []) {
      if (peer !== connection) send(peer, message)
    }
  }

  function sendSnapshot(connection) {
    const members = roomMembers.get(connection.cohortId) ?? new Set()
    send(connection, {
      type: 'snapshot',
      you: connection.sid,
      mode: connection.mode,
      peers: [...members]
        .filter((peer) => peer !== connection && peer.positioned)
        .map((peer) => stateOf(peer, connection)),
    })
  }

  function leaveRoom(connection) {
    if (!connection.cohortId) return
    const members = roomMembers.get(connection.cohortId)
    members?.delete(connection)
    if (members?.size === 0) roomMembers.delete(connection.cohortId)
    broadcast(connection, { type: 'leave', sid: connection.sid })
    connection.cohortId = null
  }

  function enterRoom(connection, cohortId) {
    leaveRoom(connection)
    connection.cohortId = cohortId
    if (!roomMembers.has(cohortId)) roomMembers.set(cohortId, new Set())
    sendSnapshot(connection)
    roomMembers.get(cohortId).add(connection)
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
    if (message.type === 'join') {
      if (connection.role !== 'staff') {
        strike(connection)
        return
      }
      if (!(await rooms.staffMayJoin(connection.user, message.cohortId))) {
        connection.ws.close(4403, 'class not available')
        return
      }
      if (connection.ws.readyState === connection.ws.OPEN) enterRoom(connection, message.cohortId)
      return
    }
    if (!connection.cohortId) return
    const current = now()
    if (movesTooFast(connection.lastMoveAt, current)) {
      if (current - connection.lastMoveAt < 50) strike(connection)
      return
    }
    connection.lastMoveAt = current
    const switched = connection.mode !== message.mode
    Object.assign(
      connection,
      message.mode === '2d'
        ? { mode: '2d', x: message.x, y: message.y, moving: message.moving, positioned: true }
        : {
            mode: '3d',
            x: message.x,
            z: message.z,
            yaw: message.yaw,
            moving: message.moving,
            positioned: true,
          },
    )
    // a mode switch re-announces: the mover gets a fresh snapshot of its new mode's peers
    if (switched) sendSnapshot(connection)
    broadcastState(connection)
  }

  function register(ws, session, cohortId) {
    const { user, sessionId } = session
    const connection = {
      ws,
      sid: randomBytes(9).toString('base64url'),
      user,
      userId: user.id,
      sessionId,
      username: user.username,
      avatarId: user.avatarId,
      look: publicLook(user),
      role: roleFor(user.globalRoles),
      cohortId: null,
      mode: '3d',
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      moving: false,
      positioned: false,
      lastMoveAt: null,
      strikes: 0,
      strikeWindowStart: now(),
      alive: true,
    }
    // one presence per account: the newest socket wins and leaves no ghost peer behind
    for (const older of connections) {
      if (older.userId !== connection.userId) continue
      leaveRoom(older)
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
      leaveRoom(connection)
      connections.delete(connection)
    })
    if (cohortId) enterRoom(connection, cohortId)
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
    if (closed || pathname !== PRESENCE_PATH) {
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
      const role = roleFor(session.user.globalRoles)
      const cohortId = role === 'student' ? await rooms.studentRoom(session.user.id) : null
      if (closed || socket.destroyed) {
        socket.destroy()
        return
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        if (role === 'student' && !cohortId) {
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
      connection.avatarId = session.user.avatarId
      connection.look = publicLook(session.user)
      if (connection.role === 'student') {
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

  function close() {
    closed = true
    clearInterval(heartbeat)
    clearInterval(recheckTimer)
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
    close,
  })
}
