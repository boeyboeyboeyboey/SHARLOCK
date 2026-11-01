import { appendFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

// a one-method interface; no provider, credential or paid service is assumed

export function createConsoleMailer(log = console.info) {
  return Object.freeze({
    async sendVerificationCode({ to, code, expiresInMinutes }) {
      log(
        `[mail:dev] Verification code for ${to}: ${code} (expires in ${expiresInMinutes} minutes)`,
      )
    },
  })
}

// browser tests read codes from a file; only built in a test process with an outbox path set
export function createFileMailer(outboxPath) {
  if (typeof outboxPath !== 'string' || !outboxPath) {
    throw new TypeError('An outbox path is required.')
  }
  return Object.freeze({
    async sendVerificationCode({ to, code }) {
      await mkdir(dirname(outboxPath), { recursive: true })
      await appendFile(outboxPath, `${JSON.stringify({ to, code })}\n`)
    },
  })
}

export function createMemoryMailer() {
  const outbox = []
  return Object.freeze({
    outbox,
    async sendVerificationCode(message) {
      outbox.push({ ...message, sentAt: Date.now() })
    },
    lastCodeFor(to) {
      for (let index = outbox.length - 1; index >= 0; index -= 1) {
        if (outbox[index].to === to) return outbox[index].code
      }
      return undefined
    },
  })
}
