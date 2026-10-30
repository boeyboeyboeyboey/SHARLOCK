// patch-station tasks: synthetic, server-generated, answers never leave the server
const MIN_LIMIT_MS = 10000
const LIMIT_SPAN_MS = 10000

const int = (rng, n) => Math.min(n - 1, Math.floor(rng() * n))

export function shuffle(rng, list) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = int(rng, i + 1)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const limit = (rng) => MIN_LIMIT_MS + Math.floor(rng() * (LIMIT_SPAN_MS + 1))

const HEX = '0123456789abcdef'
const randomHex = (rng, length) => Array.from({ length }, () => HEX[int(rng, 16)]).join('')

const FIREWALL_RULES = [
  { port: 443, name: 'HTTPS web', verdict: 'allow' },
  { port: 53, name: 'DNS', verdict: 'allow' },
  { port: 25, name: 'SMTP mail', verdict: 'allow' },
  { port: 80, name: 'HTTP (redirects to HTTPS)', verdict: 'allow' },
  { port: 23, name: 'Telnet', verdict: 'block' },
  { port: 3389, name: 'RDP remote desktop', verdict: 'block' },
  { port: 445, name: 'SMB file share', verdict: 'block' },
  { port: 21, name: 'FTP', verdict: 'block' },
]

function firewall(rng) {
  const allow = shuffle(
    rng,
    FIREWALL_RULES.filter((rule) => rule.verdict === 'allow'),
  )
  const block = shuffle(
    rng,
    FIREWALL_RULES.filter((rule) => rule.verdict === 'block'),
  )
  const picked = shuffle(rng, [...allow.slice(0, 2), ...block.slice(0, 2)])
  return {
    kind: 'firewall',
    timeLimitMs: limit(rng),
    public: { services: picked.map(({ port, name }) => ({ port, name })) },
    answer: picked.map((rule) => rule.verdict),
  }
}

const PATCHABLE = [
  { name: 'OpenSSL', version: '1.0.1f' },
  { name: 'Apache', version: '2.4.49' },
  { name: 'Sudo', version: '1.8.25' },
  { name: 'Log4j', version: '2.14.1' },
  { name: 'Nginx', version: '1.18.0' },
  { name: 'OpenSSH', version: '7.2' },
]

function patch(rng) {
  const services = shuffle(rng, PATCHABLE).slice(0, 3)
  const ids = shuffle(rng, ['patch-a', 'patch-b', 'patch-c'])
  const patches = services.map((service, i) => ({ id: ids[i], label: `Fixes ${service.version}` }))
  return {
    kind: 'patch',
    timeLimitMs: limit(rng),
    public: { services, patches: shuffle(rng, patches) },
    answer: ids,
  }
}

const BENIGN = [
  { name: 'explorer.exe', path: 'C:\\Windows\\' },
  { name: 'svchost.exe', path: 'C:\\Windows\\System32\\' },
  { name: 'chrome.exe', path: 'C:\\Program Files\\Google\\Chrome\\' },
  { name: 'spoolsv.exe', path: 'C:\\Windows\\System32\\' },
  { name: 'notepad.exe', path: 'C:\\Windows\\System32\\' },
  { name: 'lsass.exe', path: 'C:\\Windows\\System32\\' },
]
const MALWARE = [
  { name: 'svch0st.exe', path: 'C:\\Users\\Public\\Temp\\' },
  { name: 'lsasss.exe', path: 'C:\\ProgramData\\.cache\\' },
  { name: 'expl0rer.exe', path: 'C:\\Users\\Guest\\AppData\\Local\\Temp\\' },
  { name: 'scvhost.exe', path: 'C:\\Windows\\Temp\\' },
]

function processTask(rng) {
  const bad = MALWARE[int(rng, MALWARE.length)]
  const good = shuffle(rng, BENIGN).slice(0, 4)
  const rows = [
    ...good.map((item) => ({ ...item, cpu: int(rng, 13), bad: false })),
    { ...bad, cpu: 85 + int(rng, 15), bad: true },
  ]
  const ordered = shuffle(rng, rows)
  return {
    kind: 'process',
    timeLimitMs: limit(rng),
    public: { processes: ordered.map(({ name, path, cpu }) => ({ name, path, cpu })) },
    answer: ordered.findIndex((row) => row.bad),
  }
}

function tamper(rng, hash) {
  let result = hash
  // repeated edits on one position could cancel out, so retry until it differs
  while (result === hash) {
    const chars = [...hash]
    const edits = 1 + int(rng, 2)
    for (let i = 0; i < edits; i += 1) {
      const at = int(rng, chars.length)
      chars[at] = HEX[(HEX.indexOf(chars[at]) + 1 + int(rng, 15)) % 16]
    }
    result = chars.join('')
  }
  return result
}

function hashTask(rng) {
  const published = randomHex(rng, 64)
  const names = ['harbour-tool.zip', 'harbour-tool-mirror1.zip', 'harbour-tool-mirror2.zip']
  const hashes = shuffle(rng, [published, tamper(rng, published), tamper(rng, published)])
  return {
    kind: 'hash',
    timeLimitMs: limit(rng),
    public: { published, candidates: hashes.map((hash, i) => ({ file: names[i], hash })) },
    answer: hashes.indexOf(published),
  }
}

const ORGS = [
  { org: 'Harbour Mail', local: 'harbourmail', tld: 'com' },
  { org: 'Dockside Media', local: 'docksidemedia', tld: 'org' },
  { org: 'Capybara Cloud', local: 'capybaracloud', tld: 'net' },
]
const LEGIT_USERS = ['support', 'billing', 'helpdesk', 'it-team']

function lookalike(rng, { local, tld }) {
  const variants = [
    () => (local.includes('m') ? `${local.replace('m', 'rn')}.${tld}` : null),
    () => (/[ol]/.test(local) ? `${local.replace(/o/, '0').replace(/l/, '1')}.${tld}` : null),
    () => `${local}.${tld}.account-verify.net`,
  ]
  const usable = shuffle(rng, variants)
    .map((make) => make())
    .filter(Boolean)
  return usable[0]
}

function spoof(rng) {
  const org = ORGS[int(rng, ORGS.length)]
  const users = shuffle(rng, LEGIT_USERS)
  const real = `${org.local}.${org.tld}`
  const senders = shuffle(rng, [
    { address: `${users[0]}@${real}`, bad: false },
    { address: `${users[1]}@${real}`, bad: false },
    { address: `${users[2]}@${lookalike(rng, org)}`, bad: true },
  ])
  return {
    kind: 'spoof',
    timeLimitMs: limit(rng),
    public: { org: org.org, senders: senders.map((sender) => sender.address) },
    answer: senders.findIndex((sender) => sender.bad),
  }
}

const WEAK_PASSWORDS = [
  'password123',
  'Qwerty2024',
  'sharlock1',
  'letmein!',
  'Summer2024',
  'Admin@123',
  'iloveyou99',
  'abc12345',
]
const LOWER = 'abcdefghijkmnpqrstuvwxyz'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITS = '23456789'
const SYMBOLS = '!@#$%^&*-_=+?'

function strongPassword(rng) {
  const pools = [LOWER, UPPER, DIGITS, SYMBOLS]
  const chars = Array.from({ length: 16 }, (_, i) => {
    const pool = pools[i < 4 ? i : int(rng, 4)]
    return pool[int(rng, pool.length)]
  })
  return shuffle(rng, chars).join('')
}

function account(rng) {
  const strong = strongPassword(rng)
  const options = shuffle(rng, [...shuffle(rng, WEAK_PASSWORDS).slice(0, 3), strong])
  return {
    kind: 'account',
    timeLimitMs: limit(rng),
    public: { passwords: options },
    answer: options.indexOf(strong),
  }
}

const isIndex = (value, size) => Number.isInteger(value) && value >= 0 && value < size

function checkIndex(size) {
  return (answer, submission) => isIndex(submission?.index, size) && submission.index === answer
}

function checkList(size, allowed) {
  return (answer, submission) => {
    const choices = submission?.choices
    if (!Array.isArray(choices) || choices.length !== size) return false
    if (!choices.every((choice) => allowed.includes(choice))) return false
    return choices.every((choice, i) => choice === answer[i])
  }
}

export const PUZZLES = Object.freeze({
  firewall: { generate: firewall, check: checkList(4, ['allow', 'block']) },
  patch: { generate: patch, check: checkList(3, ['patch-a', 'patch-b', 'patch-c']) },
  process: { generate: processTask, check: checkIndex(5) },
  hash: { generate: hashTask, check: checkIndex(3) },
  spoof: { generate: spoof, check: checkIndex(3) },
  account: { generate: account, check: checkIndex(4) },
})

export function generatePuzzle(kind, rng) {
  const puzzle = Object.hasOwn(PUZZLES, kind) ? PUZZLES[kind] : null
  return puzzle ? puzzle.generate(rng) : null
}

export function checkPuzzle(kind, answer, submission) {
  try {
    const puzzle = Object.hasOwn(PUZZLES, kind) ? PUZZLES[kind] : null
    return puzzle ? puzzle.check(answer, submission) === true : false
  } catch {
    return false
  }
}

// the submission shape a correct client would send, used by tests and bots
export function submissionFor(kind, answer) {
  return Array.isArray(answer) ? { choices: [...answer] } : { index: answer }
}
