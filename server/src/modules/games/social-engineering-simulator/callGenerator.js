// seeded help desk call generator: one private seed builds the caller, the pretext, the
// secret asked for and every desk-tool fact, so nothing depends on fixed scenario ids

export const CALLS_PER_SHIFT = 4
export const GENUINE_SHARE = 0.4
export const TACTICS = ['urgency', 'authority', 'familiarity', 'helpfulness', 'fear']

const FIRST_NAMES = [
  'Sam',
  'Priya',
  'Marcus',
  'Dana',
  'Chris',
  'Alex',
  'Jordan',
  'Mei',
  'Tariq',
  'Noor',
  'Elena',
  'Kofi',
  'Hana',
  'Luis',
  'Aisha',
  'Ben',
  'Yuki',
  'Omar',
  'Freya',
  'Ravi',
]
const LAST_NAMES = [
  'Okoye',
  'Nair',
  'Tan',
  'Wu',
  'Ho',
  'Vale',
  'Rivera',
  'Lim',
  'Hassan',
  'Brandt',
  'Costa',
  'Mensah',
  'Sato',
  'Ortiz',
  'Khan',
  'Murray',
  'Park',
  'Haddad',
  'Lindqvist',
  'Iyer',
]
const DEPARTMENTS = [
  { name: 'IT Support', roles: ['Support Technician', 'Systems Analyst', 'Service Desk Lead'] },
  { name: 'Finance', roles: ['Accounts Analyst', 'Finance Officer', 'Payroll Analyst'] },
  { name: 'People and Culture', roles: ['HR Partner', 'Recruiter', 'Benefits Coordinator'] },
  { name: 'Operations', roles: ['Operations Coordinator', 'Logistics Planner', 'Site Lead'] },
  { name: 'Marketing', roles: ['Campaign Manager', 'Designer', 'Content Lead'] },
  { name: 'Legal', roles: ['Paralegal', 'Compliance Officer', 'Contracts Manager'] },
  { name: 'Facilities', roles: ['Facilities Officer', 'Building Supervisor', 'Receptionist'] },
  { name: 'Sales', roles: ['Account Executive', 'Sales Analyst', 'Regional Manager'] },
]
const COMPANIES = [
  'Swiftline Couriers',
  'Brightwell Supplies',
  'Northgate Cabling',
  'Halden Freight',
]
const EXTERNAL_ROLES = ['Delivery driver', 'Accounts contact', 'Field engineer', 'Account manager']

// secrets are always synthetic and carry the SYNTH prefix
const PRETEXTS = [
  {
    id: 'it-reset',
    title: 'Locked out of their account',
    secret: { kind: 'reset', label: 'account reset code', prefix: 'SYNTH-RESET' },
    ticketPrefix: 'INC',
    ticketSummary: 'Account lockout',
    situation: 'I am locked out of my account and I have a deadline this afternoon.',
  },
  {
    id: 'mfa-lost',
    title: 'Lost phone, needs an MFA code',
    secret: { kind: 'mfa', label: 'MFA enrolment code', prefix: 'SYNTH-MFA' },
    ticketPrefix: 'INC',
    ticketSummary: 'MFA re-enrolment',
    situation: 'I dropped my phone and I need a new MFA enrolment code to get back into my email.',
  },
  {
    id: 'payroll-change',
    title: 'Payroll bank details change',
    secret: { kind: 'pay', label: 'payroll change code', prefix: 'SYNTH-PAY' },
    ticketPrefix: 'HR',
    ticketSummary: 'Payroll details change',
    situation: 'I need to update where my salary is paid before the payroll run closes.',
  },
  {
    id: 'courier',
    title: 'Courier at the loading dock',
    external: true,
    secret: { kind: 'door', label: 'loading dock door code', prefix: 'SYNTH-DOCK' },
    ticketPrefix: 'DEL',
    ticketSummary: 'Signed-for delivery booking',
    situation:
      'I am at the loading dock with a signed-for delivery and the keypad rejects my code.',
  },
  {
    id: 'exec-rush',
    title: 'Executive assistant in a hurry',
    secret: { kind: 'mfa', label: 'MFA code', prefix: 'SYNTH-MFA' },
    ticketPrefix: 'REQ',
    ticketSummary: 'Meeting room system access',
    situation:
      'I am calling for the director, who walks into the board meeting in minutes and cannot get into the room system.',
  },
  {
    id: 'vendor-invoice',
    title: 'Supplier changing bank details',
    external: true,
    secret: { kind: 'bank', label: 'supplier bank-change approval code', prefix: 'SYNTH-BANK' },
    ticketPrefix: 'PO',
    ticketSummary: 'Supplier invoice query',
    situation:
      'our bank has changed and I need to confirm new account details for an open invoice.',
  },
  {
    id: 'new-starter',
    title: 'New starter on day one',
    noCallback: true,
    secret: { kind: 'first', label: 'first-login code', prefix: 'SYNTH-FIRST' },
    ticketPrefix: 'ONB',
    ticketSummary: 'New starter onboarding',
    situation:
      'it is my first day and my laptop keeps asking for a first-login code that never came.',
  },
  {
    id: 'contractor-access',
    title: 'Contractor needs the server room',
    external: true,
    secret: { kind: 'door', label: 'server room door code', prefix: 'SYNTH-RACK' },
    ticketPrefix: 'WO',
    ticketSummary: 'Scheduled cabling work order',
    situation:
      'I am here for the cabling work order and the server room keypad will not let me in.',
  },
]

export const PRETEXT_IDS = PRETEXTS.map((pretext) => pretext.id)
const SEVERITY_BY_INDEX = ['obvious', 'moderate', 'moderate', 'subtle']
const CONTRADICTIONS_BY_INDEX = [2, 2, 1, 1]

// mulberry32: small, fast and fully determined by the seed
export function createRng(seed) {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (limit) => Math.floor(next() * limit)
  return {
    next,
    int,
    chance: (probability) => next() < probability,
    pick: (list) => list[int(list.length)],
    shuffle: (list) => {
      const copy = [...list]
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = int(i + 1)
        ;[copy[i], copy[j]] = [copy[j], copy[i]]
      }
      return copy
    },
  }
}

const digits = (rng, count) => Array.from({ length: count }, () => rng.int(10)).join('')

function otherThan(rng, list, current) {
  return rng.pick(list.filter((item) => item !== current))
}

// two groups of four digits keep per-call codes effectively unique
function makeCode(rng, prefix) {
  return `${prefix}-${digits(rng, 4)}-${digits(rng, 4)}`
}

function buildDirectoryFact(rng, real, severity) {
  const entry = real
  if (severity === 'obvious') return { found: false, source: entry.source }
  if (severity === 'moderate') {
    const other = otherThan(
      rng,
      DEPARTMENTS.map((d) => d.name),
      real.department,
    )
    return real.external
      ? {
          ...entry,
          company: otherThan(rng, COMPANIES, real.company),
          department: 'Visitor register',
        }
      : { ...entry, department: other }
  }
  return { ...entry, status: 'on leave until next week' }
}

function buildTicketFact(rng, ref, summary, requester, severity) {
  if (severity === 'obvious') return { found: false, ref }
  if (severity === 'moderate') {
    const other = `${otherThan(rng, FIRST_NAMES, requester.split(' ')[0])} ${rng.pick(LAST_NAMES)}`
    return { found: true, ref, requester: other, summary, status: 'open' }
  }
  return { found: true, ref, requester, summary: 'Printer queue request', status: 'closed' }
}

function swapLastTwo(number) {
  const body = number.slice(0, -2)
  const tail = number.slice(-2)
  return `${body}${tail[1]}${tail[0] === tail[1] ? '0' : tail[0]}`
}

function callbackOutcome({ callbackViable, isGenuine, contradictions }) {
  if (!callbackViable) return 'unavailable'
  if (isGenuine) return 'confirms'
  return contradictions.some((item) => item.tool === 'callback') ? 'denies' : 'unavailable'
}

// builds the private call. genuine defaults to a draw against GENUINE_SHARE
export function generateCall({ seed, index = 0, genuine } = {}) {
  const rng = createRng(seed)
  const pretext = rng.pick(PRETEXTS)
  const isGenuine = typeof genuine === 'boolean' ? genuine : rng.chance(GENUINE_SHARE)
  const tactic = rng.pick(TACTICS)
  const first = rng.pick(FIRST_NAMES)
  const last = rng.pick(LAST_NAMES)
  const name = `${first} ${last}`
  const dept = rng.pick(DEPARTMENTS)
  const company = pretext.external ? rng.pick(COMPANIES) : null
  const role = pretext.external ? rng.pick(EXTERNAL_ROLES) : rng.pick(dept.roles)
  const department = pretext.external ? company : dept.name
  const manager = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`
  const ticketRef = `${pretext.ticketPrefix}-${digits(rng, 5)}`
  const onFile = `ext ${1000 + rng.int(9000)}`
  const callbackViable = !pretext.noCallback && rng.chance(0.92)
  const secretCode = makeCode(rng, pretext.secret.prefix)
  const colleagueName = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`

  let directory = {
    found: true,
    source: pretext.external ? 'vendor register' : 'staff directory',
    name,
    role,
    department,
    company,
    external: Boolean(pretext.external),
    manager,
    status: pretext.id === 'new-starter' ? 'starts today' : 'active',
  }
  let ticket = {
    found: true,
    ref: ticketRef,
    requester: name,
    summary: pretext.ticketSummary,
    status: 'open',
  }
  let numberOnFile = callbackViable ? onFile : null
  let numberOffered = onFile
  const contradictions = []

  if (!isGenuine) {
    const eligible = ['directory', 'ticket', ...(callbackViable ? ['callback'] : [])]
    const count = Math.min(CONTRADICTIONS_BY_INDEX[index] ?? 1, eligible.length)
    const severity = SEVERITY_BY_INDEX[index] ?? 'subtle'
    for (const tool of rng.shuffle(eligible).slice(0, count)) {
      contradictions.push({ tool, severity })
      if (tool === 'directory') directory = buildDirectoryFact(rng, directory, severity)
      if (tool === 'ticket')
        ticket = buildTicketFact(rng, ticketRef, pretext.ticketSummary, name, severity)
      if (tool === 'callback') {
        numberOffered =
          severity === 'subtle' ? swapLastTwo(onFile) : `mobile 555-0${digits(rng, 3)}`
      }
    }
  }
  const callback = {
    viable: callbackViable,
    numberOnFile,
    numberOffered,
    matches: callbackViable && numberOnFile === numberOffered,
    outcome: callbackOutcome({ callbackViable, isGenuine, contradictions }),
  }

  return {
    seed,
    index,
    genuine: isGenuine,
    pretext: { id: pretext.id, title: pretext.title, situation: pretext.situation },
    tactic,
    caller: { name, firstName: first, role, department, company, external: Boolean(company) },
    secret: { ...pretext.secret, code: secretCode },
    claimed: { ticketRef, number: numberOffered },
    facts: { directory, ticket, callback },
    contradictions,
    callbackViable,
    colleague: { name: colleagueName, role: `${department} colleague` },
  }
}

// plan the genuine/attacker mix for a shift: about 40% genuine, never all one kind
export function planShift(rng) {
  const plan = Array.from({ length: CALLS_PER_SHIFT }, () => rng.chance(GENUINE_SHARE))
  if (plan.every((value) => value === plan[0])) {
    const flip = rng.int(CALLS_PER_SHIFT)
    plan[flip] = !plan[flip]
  }
  return plan
}

// what the player may see at the start of a call; never the facts or legitimacy
export function publicCallView(call) {
  return {
    index: call.index,
    pretext: call.pretext.title,
    caller: {
      displayName: call.caller.name,
      claimedRole: call.caller.role,
      claimedDepartment: call.caller.department,
    },
    asks: call.secret.label,
    secret: { label: call.secret.label, value: call.secret.code },
  }
}

// desk tools return the seeded facts and never call a model
export function runDeskTool(call, tool) {
  const { directory, ticket, callback } = call.facts
  if (tool === 'directory') {
    if (!directory.found) {
      return {
        tool,
        found: false,
        summary: `No entry for ${call.caller.name} in the ${directory.source}.`,
      }
    }
    const where = directory.company ? `${directory.company}` : directory.department
    return {
      tool,
      found: true,
      entry: {
        name: directory.name,
        role: directory.role,
        department: where,
        manager: directory.manager,
        status: directory.status,
      },
      summary: `${directory.name}, ${directory.role}, ${where}. Status: ${directory.status}. Contact: ${directory.manager}.`,
    }
  }
  if (tool === 'ticket') {
    if (!ticket.found) {
      return { tool, found: false, summary: `No ticket ${ticket.ref} exists in the queue.` }
    }
    return {
      tool,
      found: true,
      entry: {
        ref: ticket.ref,
        requester: ticket.requester,
        summary: ticket.summary,
        status: ticket.status,
      },
      summary: `${ticket.ref}: ${ticket.summary}, requested by ${ticket.requester}, ${ticket.status}.`,
    }
  }
  if (!callback.viable) {
    return {
      tool,
      found: false,
      viable: false,
      summary: `There is no number on file for ${call.caller.name}. A call back is not possible.`,
    }
  }
  const told = `The caller gave ${callback.numberOffered}. The number on file is ${callback.numberOnFile}.`
  const outcomes = {
    confirms: `You ring ${callback.numberOnFile}. ${call.caller.firstName} picks up and confirms the request.`,
    denies: `You ring ${callback.numberOnFile}. ${call.caller.firstName} says they did not call the help desk.`,
    unavailable: `You ring ${callback.numberOnFile}. It rings out to voicemail.`,
  }
  return {
    tool,
    found: true,
    viable: true,
    entry: { numberOnFile: callback.numberOnFile, numberOffered: callback.numberOffered },
    outcome: callback.outcome,
    summary: `${told} ${outcomes[callback.outcome]}`,
  }
}
