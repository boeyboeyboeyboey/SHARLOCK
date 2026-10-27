// manual live rehearsal for the social-engineering simulator backend
// drives the real service against the configured llms (root .env or server/.env), no http,
// no mongo, nothing persisted. run from the repo root:
//   node tests/soc-live-session.mjs [--scenario <id>]
//
// the bad actor is gemini (LLM_API_KEY). the colleague is the ollama endpoint
// (LLM_COLLEAGUE_BASE_URL); without it the round has no colleague to ask
//
// in the chat: type a message to reply to the requester. commands:
//   /ask <text>  message the real colleague (the independent check)
//   /verify      end the round by verifying independently
//   /refuse      end the round by refusing
//   /share       end the round by sharing the code
//   /quit        exit without scoring

import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { createGameAdapters } from '../server/src/modules/games/social-engineering-simulator/llmConfig.js'
import { createSocialEngineeringService } from '../server/src/modules/games/social-engineering-simulator/service.js'
import { SCENARIOS } from '../server/src/modules/games/social-engineering-simulator/scenarios.js'

// minimal .env reader so the harness needs no dotenv dependency; later files do not
// override earlier ones, and values are never printed
async function loadEnv(...relativePaths) {
  const out = {}
  for (const relativePath of relativePaths) {
    let text
    try {
      text = await readFile(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
    } catch {
      continue
    }
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq)
      if (!(key in out)) out[key] = trimmed.slice(eq + 1).trim()
    }
  }
  return out
}

function banner(text) {
  console.log(`\n${'─'.repeat(60)}\n${text}\n${'─'.repeat(60)}`)
}

// forces the scenario through the service's injectable random: the first draw picks the
// legitimate or attack group, the second the position inside it
function randomFor(id) {
  const scenario = SCENARIOS.find((item) => item.id === id)
  if (!scenario) {
    console.error(
      `unknown scenario "${id}". choose one of: ${SCENARIOS.map((s) => s.id).join(', ')}`,
    )
    process.exit(1)
  }
  const group = SCENARIOS.filter(
    (item) => Boolean(item.legitimate) === Boolean(scenario.legitimate),
  )
  const draws = [scenario.legitimate ? 0 : 0.999, (group.indexOf(scenario) + 0.5) / group.length]
  return () => draws.shift() ?? Math.random()
}

async function main() {
  const flag = process.argv.indexOf('--scenario')
  const forced = flag === -1 ? null : process.argv[flag + 1]
  const env = await loadEnv('../.env', '../server/.env')
  const { attacker, colleague } = createGameAdapters({
    llmApiKey: env.LLM_API_KEY || undefined,
    llmModel: env.LLM_MODEL || undefined,
    llmColleagueBaseUrl: env.LLM_COLLEAGUE_BASE_URL || undefined,
    llmColleagueModel: env.LLM_COLLEAGUE_MODEL || undefined,
    llmColleagueAuthToken: env.LLM_COLLEAGUE_AUTH_TOKEN || undefined,
    llmColleagueTimeoutMs: Number(env.LLM_COLLEAGUE_TIMEOUT_MS) || 60000,
  })

  console.log(`attacker: ${attacker.mode ?? 'none'} configured=${attacker.configured}`)
  console.log(
    `colleague: ${colleague?.mode ?? 'none'} configured=${Boolean(colleague?.configured)}`,
  )
  if (!attacker.configured) {
    console.error('\nno attacker configured. set LLM_API_KEY and LLM_MODEL in .env, then rerun.')
    process.exitCode = 1
    return
  }

  const service = createSocialEngineeringService({
    adapter: attacker,
    verifierAdapter: colleague,
    ...(forced && { random: randomFor(forced) }),
  })
  const session = service.startSession()

  banner(`persona: ${session.persona.displayName} (${session.persona.id})`)
  console.log(`objective: ${session.brief.objective}`)
  console.log(`turn budget: ${session.brief.turnBudget}`)
  console.log(`\nrequester: ${session.openingMessage}`)

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  let closed = false
  rl.on('close', () => {
    closed = true
  })

  try {
    while (!closed) {
      let answer
      try {
        answer = await rl.question('\nyou> ')
      } catch {
        // readline closed (eof / ctrl-d) while awaiting input
        break
      }
      const input = answer.trim()
      if (!input) continue

      if (input === '/quit') {
        console.log('exited without scoring')
        return
      }
      if (input.startsWith('/ask ')) {
        try {
          const turn = await service.sendVerifierMessage(session.sessionId, input.slice(5))
          console.log(`\ncolleague: ${turn.reply ?? JSON.stringify(turn)}`)
        } catch (error) {
          console.log(`\ncolleague failed: ${error.code ?? error.name} - ${error.message}`)
        }
        continue
      }
      const decision =
        input === '/verify'
          ? 'verify-independently'
          : input === '/refuse'
            ? 'refuse'
            : input === '/share'
              ? 'share-code'
              : null
      if (decision) {
        const result = service.complete(session.sessionId, decision)
        banner(`outcome: ${result.outcome} — score ${result.score}/${result.maxScore}`)
        for (const item of result.breakdown) {
          console.log(`  ${item.points}/${item.max}  ${item.label}`)
        }
        // the debrief fields differ between attack and legitimate scenarios, so print every one
        for (const [key, value] of Object.entries(result.debrief)) {
          if (value) console.log(`\n${key}: ${Array.isArray(value) ? value.join('; ') : value}`)
        }
        console.log(`\nsaved: ${result.saved}`)
        return
      }

      let turn
      try {
        turn = await service.sendMessage(session.sessionId, input)
      } catch (error) {
        // keep the session alive on a transient upstream hiccup so you can retry
        console.log(`\nturn failed: ${error.code ?? error.name} - ${error.message}`)
        console.log('  the session is still open — type your message again to retry')
        continue
      }
      if (turn.leaked) {
        console.log(
          '\n** you revealed the code — round ended (compromised). run a decision to score. **',
        )
        console.log('  type /share to score the leak, or /quit to exit')
        continue
      }
      console.log(`\nrequester: ${turn.reply}`)
      console.log(`(turn ${turn.turnsUsed}/${turn.turnBudget})`)
      if (turn.ended) {
        console.log('\n** turn budget reached — end with /verify, /refuse, or /share **')
      }
    }
  } finally {
    rl.close()
  }
}

main().catch((error) => {
  console.error(`\nlive session failed: ${error.code ?? error.name} - ${error.message}`)
  process.exitCode = 1
})
