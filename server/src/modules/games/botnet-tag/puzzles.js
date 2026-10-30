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

const pick = (rng, list) => list[int(rng, list.length)]
const cap = (word) => word[0].toUpperCase() + word.slice(1)

const SERVICES = {
  443: 'HTTPS web',
  80: 'HTTP (redirects to HTTPS)',
  22: 'SSH remote shell',
  23: 'Telnet',
  21: 'FTP',
  3389: 'RDP remote desktop',
  445: 'SMB file share',
  139: 'NetBIOS sessions',
  5900: 'VNC screen sharing',
  6379: 'Redis cache',
  27017: 'MongoDB',
  9200: 'Elasticsearch API',
  11211: 'Memcached',
  25: 'SMTP mail relay',
  587: 'SMTP submission',
  993: 'IMAPS mailbox',
  3306: 'MySQL',
  5432: 'PostgreSQL',
}
const RISKY = [23, 21, 3389, 445, 139, 5900, 6379, 27017, 9200, 11211]

// ssh is allowed only on the admin vpn variant of each role
const ROLES = [
  { id: 'web', title: 'Web server', allow: [443, 80], skip: [], extraBlock: [25, 587, 3306] },
  {
    id: 'mail',
    title: 'Mail server',
    allow: [25, 587, 993],
    skip: [443, 27017, 6379],
    extraBlock: [80, 3306],
  },
  {
    id: 'database',
    title: 'Database host',
    allow: [5432, 3306],
    skip: [27017, 6379],
    extraBlock: [80, 443, 25, 587],
  },
]

function firewall(rng) {
  const role = pick(rng, ROLES)
  const vpn = rng() < 0.5
  const allowPorts = vpn ? [...role.allow, 22] : role.allow
  const blockPorts = [
    ...RISKY.filter((port) => !role.skip.includes(port)),
    ...role.extraBlock,
    ...(vpn ? [] : [22]),
  ]
  const rows = 4 + int(rng, 2)
  const allowCount = Math.min(allowPorts.length, 2 + int(rng, 2), rows - 1)
  const picked = shuffle(rng, [
    ...shuffle(rng, allowPorts)
      .slice(0, allowCount)
      .map((port) => ({ port, verdict: 'allow' })),
    ...shuffle(rng, blockPorts)
      .slice(0, rows - allowCount)
      .map((port) => ({ port, verdict: 'block' })),
  ])
  return {
    kind: 'firewall',
    timeLimitMs: limit(rng),
    public: {
      role: vpn ? `${role.title} (admin VPN)` : role.title,
      services: picked.map(({ port }) => ({ port, name: SERVICES[port] })),
    },
    answer: picked.map((rule) => rule.verdict),
    meta: { role: role.id, vpn },
  }
}

const VENDORS = [
  'Harbour',
  'Dockside',
  'Capybara',
  'Tidal',
  'Lantern',
  'Anchor',
  'Beacon',
  'Mariner',
]
const PRODUCTS = [
  'Gate',
  'Mail',
  'Vault',
  'Proxy',
  'Sync',
  'Relay',
  'Portal',
  'Auth',
  'Cache',
  'Core',
]

const versionText = (v) => v.join('.')
function versionAtMost(a, b) {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] < b[i]
  return true
}

// a patch covers an install when the product matches and the version is in its range
export function patchCovers(patchInfo, install) {
  if (patchInfo.product !== install.name) return false
  return patchInfo.upto
    ? versionAtMost(install.version, patchInfo.fixed)
    : versionText(install.version) === versionText(patchInfo.fixed)
}

function patch(rng) {
  const names = shuffle(
    rng,
    VENDORS.flatMap((vendor) => PRODUCTS.map((product) => `${vendor} ${product}`)),
  )
  const installs = names.slice(0, 3).map((name) => ({
    name,
    version: [1 + int(rng, 6), int(rng, 10), 1 + int(rng, 40)],
  }))
  const infos = installs.map((install) => {
    const upto = rng() < 0.5
    // an "and below" patch targets a build at or above the installed one
    const fixed = upto
      ? [install.version[0], install.version[1], install.version[2] + int(rng, 4)]
      : install.version
    return { product: install.name, upto, fixed, role: 'match' }
  })
  const decoys = []
  const decoyCount = 1 + int(rng, 2)
  for (let i = 0; i < decoyCount; i += 1) {
    if (i === 0 && rng() < 0.6) {
      // same product but the range stops short of the installed version
      const target = pick(rng, installs)
      const upto = rng() < 0.5
      const fixed = upto
        ? [target.version[0], target.version[1], Math.max(0, target.version[2] - 1 - int(rng, 3))]
        : [target.version[0], target.version[1] + 1, target.version[2]]
      decoys.push({ product: target.name, upto, fixed, role: 'decoy' })
    } else {
      decoys.push({
        product: names[3 + i],
        upto: rng() < 0.5,
        fixed: [1 + int(rng, 6), int(rng, 10), 1 + int(rng, 40)],
        role: 'decoy',
      })
    }
  }
  const all = shuffle(rng, [...infos, ...decoys])
  const ids = ['patch-a', 'patch-b', 'patch-c', 'patch-d', 'patch-e']
  const entries = all.map((info, i) => ({ ...info, id: ids[i] }))
  const label = (info) =>
    `${info.product}: fixes ${versionText(info.fixed)}${info.upto ? ' and below' : ''}`
  return {
    kind: 'patch',
    timeLimitMs: limit(rng),
    public: {
      services: installs.map(({ name, version }) => ({ name, version: versionText(version) })),
      patches: entries.map((entry) => ({ id: entry.id, label: label(entry) })),
    },
    answer: installs.map((install) => entries.find((entry) => patchCovers(entry, install)).id),
    meta: { decoys: decoys.length, entries },
  }
}

const PROCESS_OS = {
  windows: {
    legit: [
      ['explorer.exe', 'C:\\Windows\\'],
      ['svchost.exe', 'C:\\Windows\\System32\\'],
      ['lsass.exe', 'C:\\Windows\\System32\\'],
      ['spoolsv.exe', 'C:\\Windows\\System32\\'],
      ['notepad.exe', 'C:\\Windows\\System32\\'],
      ['winlogon.exe', 'C:\\Windows\\System32\\'],
      ['csrss.exe', 'C:\\Windows\\System32\\'],
      ['services.exe', 'C:\\Windows\\System32\\'],
      ['dwm.exe', 'C:\\Windows\\System32\\'],
      ['taskhostw.exe', 'C:\\Windows\\System32\\'],
      ['RuntimeBroker.exe', 'C:\\Windows\\System32\\'],
      ['chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\'],
      ['firefox.exe', 'C:\\Program Files\\Mozilla Firefox\\'],
      ['OneDrive.exe', 'C:\\Program Files\\Microsoft OneDrive\\'],
    ],
    suspicious: (rng, user, dir) => [
      `C:\\Users\\${user}\\AppData\\Local\\Temp\\`,
      `C:\\Users\\${user}\\Downloads\\`,
      `C:\\Users\\${user}\\AppData\\Roaming\\${dir}\\`,
      'C:\\Windows\\Temp\\',
      `C:\\ProgramData\\.${dir}\\`,
    ],
  },
  linux: {
    legit: [
      ['systemd', '/usr/lib/systemd/'],
      ['sshd', '/usr/sbin/'],
      ['cron', '/usr/sbin/'],
      ['nginx', '/usr/sbin/'],
      ['rsyslogd', '/usr/sbin/'],
      ['dbus-daemon', '/usr/bin/'],
      ['NetworkManager', '/usr/sbin/'],
      ['containerd', '/usr/bin/'],
      ['python3', '/usr/bin/'],
      ['bash', '/usr/bin/'],
      ['postgres', '/usr/lib/postgresql/16/bin/'],
      ['snapd', '/usr/lib/snapd/'],
    ],
    suspicious: (rng, user, dir) => [
      '/tmp/',
      `/tmp/.${dir}/`,
      '/var/tmp/',
      '/dev/shm/',
      `/home/${user}/Downloads/`,
    ],
  },
  macos: {
    legit: [
      ['launchd', '/sbin/'],
      ['WindowServer', '/System/Library/PrivateFrameworks/SkyLight.framework/Resources/'],
      ['Finder', '/System/Library/CoreServices/Finder.app/Contents/MacOS/'],
      ['Dock', '/System/Library/CoreServices/Dock.app/Contents/MacOS/'],
      ['Spotlight', '/System/Library/CoreServices/Spotlight.app/Contents/MacOS/'],
      ['Safari', '/Applications/Safari.app/Contents/MacOS/'],
      ['mDNSResponder', '/usr/sbin/'],
      ['cfprefsd', '/usr/sbin/'],
      ['distnoted', '/usr/sbin/'],
      ['sshd', '/usr/sbin/'],
      ['trustd', '/usr/libexec/'],
    ],
    suspicious: (rng, user, dir) => [
      '/private/tmp/',
      `/Users/${user}/Downloads/`,
      `/Users/${user}/Library/${dir}/`,
      `/Users/Shared/.${dir}/`,
    ],
  },
}
const OS_NAMES = Object.keys(PROCESS_OS)
const KNOWN_PROCESS_NAMES = new Set(
  Object.values(PROCESS_OS).flatMap((os) => os.legit.map(([name]) => name)),
)
const SUSPICIOUS_PATH =
  /\\Temp\\|\\Downloads\\|\\AppData\\|\\ProgramData\\|^\/tmp\/|^\/var\/tmp\/|^\/private\/tmp\/|^\/dev\/shm\/|\/Downloads\/|^\/Users\/[^/]+\/Library\/|^\/Users\/Shared\/|^\/home\/[^/]+\/\./
const USERS = ['alex', 'sam', 'guest', 'jordan', 'kai', 'robin', 'taylor']
const SLUG_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'

// a row is malicious when its name is unknown or its path is a temp or user-writable folder
export function looksMalicious(row) {
  return !KNOWN_PROCESS_NAMES.has(row.name) || SUSPICIOUS_PATH.test(row.path)
}

function splitName(name) {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
}

function nameMutations(rng, name) {
  const [base, ext] = splitName(name)
  const swap = () => {
    const spots = [...base.slice(1)].map((_, i) => i + 1).filter((i) => base[i] !== base[i - 1])
    if (!spots.length) return null
    const at = pick(rng, spots)
    return base.slice(0, at - 1) + base[at] + base[at - 1] + base.slice(at + 1) + ext
  }
  const replaceOne = (pattern, text) => {
    const hits = [...base].map((ch, i) => (pattern.test(ch) ? i : -1)).filter((i) => i >= 0)
    if (!hits.length) return null
    const at = pick(rng, hits)
    return base.slice(0, at) + text + base.slice(at + 1) + ext
  }
  const extras = ext ? ['.scr', '.com', '.bat', '.pif'] : ['.sh', '.bin', '.elf']
  return [
    () => replaceOne(/[oO]/, '0'),
    () => replaceOne(/l/, '1'),
    () => replaceOne(/m/, 'rn'),
    () => {
      const at = int(rng, base.length)
      return base.slice(0, at + 1) + base[at] + base.slice(at + 1) + ext
    },
    () => base + pick(rng, extras),
    swap,
  ]
    .map((make) => ({ make, order: rng() }))
    .sort((a, b) => a.order - b.order)
    .map(({ make }) => make())
    .filter((candidate) => candidate && !KNOWN_PROCESS_NAMES.has(candidate))
}

const slug = (rng) =>
  Array.from({ length: 6 + int(rng, 3) }, () => pick(rng, [...SLUG_CHARS])).join('')

function processTask(rng) {
  const osName = pick(rng, OS_NAMES)
  const os = PROCESS_OS[osName]
  const chosen = shuffle(rng, os.legit).slice(0, 5)
  const [victim, ...rest] = chosen
  const user = pick(rng, USERS)
  const dirs = os.suspicious(rng, user, slug(rng))
  const roll = rng()
  const mutated = nameMutations(rng, victim[0])[0]
  let bad
  let technique
  if (roll < 0.5) {
    bad = { name: mutated, path: pick(rng, dirs) }
    technique = 'mutated-name-temp-path'
  } else if (roll < 0.75) {
    bad = { name: victim[0], path: pick(rng, dirs) }
    technique = 'real-name-temp-path'
  } else {
    bad = { name: mutated, path: victim[1] }
    technique = 'mutated-name-real-path'
  }
  const rows = [
    ...rest.slice(0, 4).map(([name, path]) => ({
      name,
      path,
      cpu: int(rng, 40),
      mem: 20 + int(rng, 700),
      bad: false,
    })),
    { ...bad, cpu: 5 + int(rng, 94), mem: 20 + int(rng, 900), bad: true },
  ]
  const ordered = shuffle(rng, rows)
  return {
    kind: 'process',
    timeLimitMs: limit(rng),
    public: {
      processes: ordered.map(({ name, path, cpu, mem }) => ({ name, path, cpu, mem })),
    },
    answer: ordered.findIndex((row) => row.bad),
    meta: { os: osName, technique },
  }
}

function tamper(rng, hash, taken) {
  let result = hash
  // retry until the edits leave a distinct string
  while (result === hash || taken.includes(result)) {
    const chars = [...hash]
    const edits = 1 + int(rng, 3)
    for (let i = 0; i < edits; i += 1) {
      const at = int(rng, chars.length)
      chars[at] = HEX[(HEX.indexOf(chars[at]) + 1 + int(rng, 15)) % 16]
    }
    result = chars.join('')
  }
  return result
}

const HASH_FILES = [
  'harbour-tool',
  'dockside-installer',
  'capybara-agent',
  'lantern-updater',
  'tidal-cli',
  'beacon-setup',
]
const HASH_EXT = ['zip', 'tar.gz', 'msi', 'dmg', 'iso']

function hashTask(rng) {
  const published = randomHex(rng, 64)
  const decoyA = tamper(rng, published, [])
  const decoyB = tamper(rng, published, [decoyA])
  const hashes = shuffle(rng, [published, decoyA, decoyB])
  const base = pick(rng, HASH_FILES)
  const ext = pick(rng, HASH_EXT)
  const names = [`${base}.${ext}`, `${base}-mirror1.${ext}`, `${base}-mirror2.${ext}`]
  const group = rng() < 0.4 ? pick(rng, [4, 8]) : 0
  const show = (hash) => (group ? hash.match(new RegExp(`.{${group}}`, 'g')).join(' ') : hash)
  return {
    kind: 'hash',
    timeLimitMs: limit(rng),
    public: {
      published: show(published),
      candidates: hashes.map((hash, i) => ({ file: names[i], hash: show(hash) })),
    },
    answer: hashes.indexOf(published),
    meta: { grouped: group },
  }
}

const ORG_FIRST = [
  'harbour',
  'dockside',
  'capybara',
  'lantern',
  'tidal',
  'anchor',
  'beacon',
  'mariner',
  'copper',
  'willow',
]
const ORG_SECOND = ['mail', 'media', 'cloud', 'bank', 'pay', 'books', 'labs', 'travel', 'health']
const TLDS = ['com', 'org', 'net', 'io', 'co']
const EVIL_HOSTS = ['account-verify.net', 'secure-login.co', 'id-check.info', 'signin-help.xyz']
const LEGIT_USERS = ['support', 'billing', 'helpdesk', 'it-team', 'noreply', 'accounts']
const LEGIT_SUBS = ['mail', 'support', 'news', 'accounts']

function spoofDomain(rng, first, second, tld) {
  const local = first + second
  const real = `${local}.${tld}`
  const makers = {
    homoglyph: () => {
      const swapped = local.replace(/o/, '0').replace(/l/, '1')
      return swapped === local ? null : `${swapped}.${tld}`
    },
    rn: () => (local.includes('m') ? `${local.replace('m', 'rn')}.${tld}` : null),
    hyphen: () => `${first}-${second}.${tld}`,
    tld: () =>
      `${local}.${pick(
        rng,
        TLDS.filter((t) => t !== tld),
      )}`,
    subdomain: () => `${real}.${pick(rng, EVIL_HOSTS)}`,
    extra: () => {
      const at = int(rng, local.length)
      return `${local.slice(0, at + 1)}${local[at]}${local.slice(at + 1)}.${tld}`
    },
  }
  const options = shuffle(rng, Object.keys(makers))
  for (const technique of options) {
    const domain = makers[technique]()
    if (domain && domain !== real) return { technique, domain }
  }
  return { technique: 'subdomain', domain: `${real}.${EVIL_HOSTS[0]}` }
}

function spoof(rng) {
  const first = pick(rng, ORG_FIRST)
  const second = pick(rng, ORG_SECOND)
  const tld = pick(rng, TLDS)
  const real = `${first}${second}.${tld}`
  const total = 3 + int(rng, 2)
  const users = shuffle(rng, LEGIT_USERS)
  const subs = shuffle(rng, LEGIT_SUBS)
  const legit = []
  for (let i = 0; i < total - 1; i += 1) {
    const host = i > 0 && rng() < 0.5 ? `${subs[i]}.${real}` : real
    legit.push({ address: `${users[i]}@${host}`, bad: false })
  }
  const { technique, domain } = spoofDomain(rng, first, second, tld)
  const senders = shuffle(rng, [...legit, { address: `${users[total]}@${domain}`, bad: true }])
  return {
    kind: 'spoof',
    timeLimitMs: limit(rng),
    public: {
      org: `${cap(first)} ${cap(second)}`,
      senders: senders.map((sender) => sender.address),
    },
    answer: senders.findIndex((sender) => sender.bad),
    meta: { technique, real },
  }
}

const COMMON_WORDS = [
  'password',
  'summer',
  'winter',
  'dragon',
  'monkey',
  'football',
  'welcome',
  'sunshine',
  'letmein',
  'admin',
  'iloveyou',
  'princess',
  'master',
  'shadow',
  'login',
  'qwerty',
  'harbour',
  'sharlock',
]
const WALKS = ['qwerty', 'asdfgh', 'zxcvbn', '1qaz2wsx', 'qazwsx', 'asdfghjkl', '123456', '1q2w3e']
const PASS_WORDS = [
  'lantern',
  'orchid',
  'granite',
  'velvet',
  'copper',
  'meadow',
  'falcon',
  'harvest',
  'pebble',
  'thistle',
  'saffron',
  'quartz',
  'ember',
  'walnut',
  'glacier',
  'marble',
  'willow',
  'compass',
  'biscuit',
  'tundra',
]
const LEET = { a: '@', e: '3', i: '1', o: '0', s: '$' }
const LOWER = 'abcdefghijkmnpqrstuvwxyz'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITS = '23456789'
const SYMBOLS = '!@#$%^&*-_=+?'
const UNLEET = { '@': 'a', 3: 'e', 1: 'i', 0: 'o', $: 's', 5: 's', 4: 'a' }

// deterministic strength score: length and variety, minus common patterns
export function scorePassword(password) {
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length
  let score = Math.min(password.length, 24) * 4 + classes * 6
  const plain = [...password.toLowerCase()].map((ch) => UNLEET[ch] ?? ch).join('')
  if (password.length < 16 && COMMON_WORDS.some((word) => plain.includes(word))) score -= 30
  if (WALKS.some((walk) => plain.includes(walk))) score -= 30
  if (/(?:19|20)\d\d/.test(password)) score -= 15
  if (/(\d)\1\1|(?:012|123|234|345|456|567|678|789)/.test(password)) score -= 10
  if (/(.)\1\1/.test(password)) score -= 10
  return score
}

function randomFrom(rng, pools, length) {
  const chars = Array.from({ length }, (_, i) => {
    const pool = pools[i < pools.length ? i : int(rng, pools.length)]
    return pool[int(rng, pool.length)]
  })
  return shuffle(rng, chars).join('')
}

const WEAK_MAKERS = {
  'word-year': (rng) => {
    const word = pick(rng, COMMON_WORDS)
    return `${cap(word)}${pick(rng, ['19', '20'])}${10 + int(rng, 15)}${rng() < 0.5 ? '!' : ''}`
  },
  'leet-word': (rng) => {
    const word = pick(rng, COMMON_WORDS)
    const leet = [...word].map((ch) => (LEET[ch] && rng() < 0.7 ? LEET[ch] : ch)).join('')
    return `${cap(leet)}${rng() < 0.5 ? int(rng, 100) : ''}`
  },
  'keyboard-walk': (rng) => `${pick(rng, WALKS)}${rng() < 0.5 ? int(rng, 100) : '!'}`,
  'short-random': (rng) => randomFrom(rng, [LOWER, UPPER, DIGITS, SYMBOLS], 8 + int(rng, 3)),
}
const STRONG_MAKERS = {
  passphrase: (rng) => {
    const words = shuffle(rng, PASS_WORDS).slice(0, 4)
    const sep = pick(rng, ['-', '.', '_', ' '])
    return words.join(sep) + (rng() < 0.5 ? `${sep}${10 + int(rng, 90)}` : '')
  },
  'long-random': (rng) => randomFrom(rng, [LOWER, UPPER, DIGITS, SYMBOLS], 16 + int(rng, 5)),
}
const MIN_MARGIN = 15

function account(rng) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const strongKind = pick(rng, Object.keys(STRONG_MAKERS))
    const strong = STRONG_MAKERS[strongKind](rng)
    const kinds = shuffle(rng, Object.keys(WEAK_MAKERS)).slice(0, 3)
    const weak = kinds.map((kind) => WEAK_MAKERS[kind](rng))
    const best = Math.max(...weak.map(scorePassword))
    const unique = new Set([strong, ...weak]).size === 4
    if (!unique || scorePassword(strong) < best + MIN_MARGIN) continue
    const options = shuffle(rng, [strong, ...weak])
    return {
      kind: 'account',
      timeLimitMs: limit(rng),
      public: { passwords: options },
      answer: options.indexOf(strong),
      meta: { strong: strongKind, weak: kinds },
    }
  }
  // fixed fallback that always has a wide margin
  const options = ['password123', 'Qwerty2024', 'letmein!', 'ember-quartz-willow-tundra-42']
  return {
    kind: 'account',
    timeLimitMs: limit(rng),
    public: { passwords: options },
    answer: 3,
    meta: { strong: 'passphrase', weak: ['fallback'] },
  }
}

const isIndex = (value, size) => Number.isInteger(value) && value >= 0 && value < size

function checkIndex(size) {
  return (answer, submission) => isIndex(submission?.index, size) && submission.index === answer
}

function checkList(allowed) {
  return (answer, submission) => {
    const choices = submission?.choices
    if (!Array.isArray(choices) || choices.length !== answer.length) return false
    if (!choices.every((choice) => allowed.includes(choice))) return false
    return choices.every((choice, i) => choice === answer[i])
  }
}

export const PUZZLES = Object.freeze({
  firewall: { generate: firewall, check: checkList(['allow', 'block']) },
  patch: {
    generate: patch,
    check: checkList(['patch-a', 'patch-b', 'patch-c', 'patch-d', 'patch-e']),
  },
  process: { generate: processTask, check: checkIndex(5) },
  hash: { generate: hashTask, check: checkIndex(3) },
  spoof: { generate: spoof, check: checkIndex(4) },
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
