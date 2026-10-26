import { api } from '../../services/api.js'
import { writeAttempt } from '../../features/attempts/api.js'

const BASE = '/games/cli-cyber-defender/runs'

export const MAX_COMMAND_LENGTH = 120

export const COMMAND_TEMPLATES = [
  {
    id: 'block-ip',
    template: 'block ip ',
    label: 'block ip',
    hint: 'Block an outside address',
  },
  {
    id: 'disable-user',
    template: 'disable user ',
    label: 'disable user',
    hint: 'Lock a compromised account',
  },
  {
    id: 'isolate-host',
    template: 'isolate host ',
    label: 'isolate host',
    hint: 'Cut an infected machine off the network',
  },
]

// demo-only incidents that never appear in a real shift, so the loop teaches without spoiling
export const DEMO_SCENES = [
  {
    alert: 'Brute force on vpn-gw from 192.0.2.99',
    command: 'block ip 192.0.2.99',
    result: 'Contained +100',
  },
  {
    alert: 'Phished account demo-07 signs in from abroad',
    command: 'disable user demo-07',
    result: 'Contained +200',
  },
  {
    alert: 'Host demo-pc beacons to a known C2 server',
    command: 'isolate host demo-pc',
    result: 'Contained +300',
  },
]

export const LOCAL_COMMANDS = ['help', 'clear', 'history']

export function startRun(mode, context, signal) {
  return writeAttempt(BASE, { mode, context }, signal)
}

export function fetchRun(runId, signal) {
  return api.get(`${BASE}/${runId}`, { signal }).then(({ data }) => data)
}

export function requestHint(runId, incidentId, signal) {
  return writeAttempt(`${BASE}/${runId}/hint`, { incidentId }, signal)
}

export function pauseRun(runId, signal) {
  return writeAttempt(`${BASE}/${runId}/pause`, {}, signal)
}

export function resumeRun(runId, signal) {
  return writeAttempt(`${BASE}/${runId}/resume`, {}, signal)
}

export function submitCommand(runId, body, signal) {
  return writeAttempt(`${BASE}/${runId}/commands`, body, signal)
}

export function completeRun(runId, actionId, signal) {
  return writeAttempt(`${BASE}/${runId}/complete`, { actionId }, signal)
}

export function createActionId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `a-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  )
}

export function errorCode(error) {
  return error?.response?.data?.error?.code ?? null
}

export function errorMessage(error, fallback) {
  if (error?.response?.status === 401) return 'Your session ended. Sign in again to play.'
  const message = error?.response?.data?.error?.message
  return typeof message === 'string' && message ? message : fallback
}
