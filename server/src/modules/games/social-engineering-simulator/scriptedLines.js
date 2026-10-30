// scripted help desk lines: every template is filled from the call's seed, with no model call

export const MAX_HINTS = 3
export const MAX_NUDGES_PER_CALL = 3

// a missing value throws so a broken template is caught by tests, never shown as "undefined"
export function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_match, key) => {
    const value = vars[key]
    if (value === undefined || value === null) throw new Error(`missing template value ${key}`)
    return String(value)
  })
}

export function varsFor(call) {
  return {
    name: call.caller.name,
    firstName: call.caller.firstName,
    role: call.caller.role,
    department: call.caller.department,
    secret: call.secret.label,
    ticket: call.claimed.ticketRef,
    number: call.claimed.number,
    situation: call.pretext.situation,
    colleague: call.colleague.name,
    colleagueRole: call.colleague.role,
  }
}

const PRESSURE = {
  urgency: [
    'I really do not have time for this, it has to be done in the next few minutes.',
    'Every minute counts here, can we just get it done please?',
    'This is going to cost us badly if it is not sorted right now.',
  ],
  authority: [
    'This comes straight from senior management, so please do not hold it up.',
    'I would rather not have to escalate this above your head, so let us just sort it.',
    'The director asked for this personally, so it needs to happen now.',
  ],
  familiarity: [
    'Come on, we have worked together for ages, you know me.',
    'You helped me with exactly this last month, it is the same thing again.',
    'Mate, it is me. Just do the usual thing for me.',
  ],
  helpfulness: [
    'I am only trying to make your life easier here, it will take you ten seconds.',
    'I have already done most of the work, I just need that one last piece from you.',
    'You would be saving me a huge headache, I would really appreciate it.',
  ],
  fear: [
    'If this does not get fixed, there will be serious trouble for both of us.',
    'Please, I will be in real trouble if this is not done by the end of the hour.',
    'I cannot afford for this to go wrong, so I need you to act on it now.',
  ],
}

const OPENINGS = {
  urgency: 'Hi, it is {name} from {department}. {situation} My reference is {ticket}.',
  authority: 'Good afternoon, {name} here, {role} in {department}. {situation} Reference {ticket}.',
  familiarity: 'Hey, {firstName} from {department} again. {situation} It is under {ticket}.',
  helpfulness:
    'Hello, {name} in {department}. {situation} I have raised {ticket} to speed things up.',
  fear: 'Hi, {name} from {department}, and I am in a bit of a panic. {situation} Ticket {ticket}.',
}

// rng is a () => number in [0, 1) so the opening can be fixed by the call seed
export function openingLine(call, rng = Math.random) {
  const options = PRESSURE[call.tactic]
  const pressure = options[Math.floor(rng() * options.length)]
  return `${fill(OPENINGS[call.tactic], varsFor(call))} I need the ${call.secret.label}. ${pressure}`
}

export function nudgeLine(call, count) {
  const options = PRESSURE[call.tactic]
  return options[count % options.length]
}

export function classifyIntent(text) {
  const lower = String(text).toLowerCase()
  if (
    /call (you )?back|ring (you )?back|call you|phone you|number on file|extension|\bext\b/.test(
      lower,
    )
  )
    return 'callback'
  if (/ticket|reference|\bref\b|\binc-|case number/.test(lower)) return 'ticket'
  if (/proof|prove|verify|confirm|identity|badge|who are you|how do i know/.test(lower))
    return 'proof'
  if (/\b(no|cannot|can't|won't|not allowed|policy|refuse|sorry|unable)\b/.test(lower))
    return 'pushback'
  return 'generic'
}

// a genuine caller cooperates with checks, an attacker deflects them
const GENUINE_REPLIES = {
  proof: 'Of course, check the directory under {name} in {department}, that is all fine by me.',
  callback: 'Absolutely, ring me back on {number}, I will pick up.',
  ticket: 'Yes, it is {ticket}, have a look at it in the queue.',
  pushback: 'I understand you have to be careful. Take your time and check whatever you need to.',
  generic: 'Thanks for looking at this. The {secret} is what I need to finish up.',
}
const ATTACKER_REPLIES = {
  proof: 'You really do not need to verify me, I am who I said. Can we skip that part?',
  callback: 'My phone line is being repaired so a call back will not work, just stay on this line.',
  ticket: 'The ticket should be in the system by now, I do not have the details in front of me.',
  pushback: 'I do not see why that is a problem, other people have done this for me before.',
  generic: 'Right, so can you give me the {secret}? That is all I need from you.',
}

export function replyFor(call, intent, repeatCount = 0) {
  const base = (call.genuine ? GENUINE_REPLIES : ATTACKER_REPLIES)[intent]
  const line = fill(base, varsFor(call))
  return repeatCount > 0 && !call.genuine ? `${line} ${nudgeLine(call, repeatCount)}` : line
}

const DIRECTORY_FACTS = {
  genuine: '{name} is on the {department} team, I know them. They are the real thing.',
  notFound: 'I have never heard of {name} in {department}, and they are not in the directory.',
  department: 'I know {name}, but they work in a different department, not {department}.',
  leave: '{name} is on {department} but they are on leave this week, so it is odd they called.',
}
const TICKET_FACTS = {
  genuine: 'I can see {ticket} in the queue and it matches what they are asking for.',
  notFound: 'I cannot find {ticket} in the queue at all.',
  other: '{ticket} exists but somebody else raised it, not {name}.',
  closed: '{ticket} is closed and is about something unrelated.',
}

function directoryKey(call) {
  const { directory } = call.facts
  if (!directory.found) return 'notFound'
  if (directory.status.startsWith('on leave')) return 'leave'
  const where = directory.company ?? directory.department
  return where === call.caller.department ? 'genuine' : 'department'
}

function ticketKey(call) {
  const { ticket } = call.facts
  if (!ticket.found) return 'notFound'
  if (ticket.status === 'closed') return 'closed'
  return ticket.requester === call.caller.name ? 'genuine' : 'other'
}

// the colleague's factual answer from the same seed, used when the model is unavailable
export function colleagueLine(call, text) {
  const lower = String(text).toLowerCase()
  const vars = varsFor(call)
  const directoryLine = fill(DIRECTORY_FACTS[directoryKey(call)], vars)
  const ticketLine = fill(TICKET_FACTS[ticketKey(call)], vars)
  if (/ticket|reference|\bref\b|inc-|queue/.test(lower)) return ticketLine
  if (/call|number|phone|ext/.test(lower)) {
    return 'I do not have phone records. Use the call back tool on your desk, it rings the number on file.'
  }
  if (/work|department|team|know|who|staff|directory|exist/.test(lower)) return directoryLine
  return `${directoryLine} ${ticketLine}`
}

function clueFor(call, contradiction) {
  const { directory, ticket } = call.facts
  if (contradiction.tool === 'directory') {
    return directory.found
      ? 'Check the directory entry against what the caller claimed. Something does not line up.'
      : 'Look the caller up in the directory. Is there anyone by that name?'
  }
  if (contradiction.tool === 'ticket') {
    return ticket.found
      ? 'The ticket exists, but read who raised it and what it is about.'
      : 'Look up the ticket reference the caller gave you. Does it exist?'
  }
  return 'Compare the number the caller gave with the number on file for them.'
}

// hints in order: the pattern, the tool to try, then the specific clue
export function hintsFor(call) {
  if (call.genuine) {
    return [
      'Pressure alone does not make a caller fake. Busy real colleagues sound rushed too.',
      'Try the desk tools. If everything agrees, helping is the right call.',
      'Nothing about this caller disagrees with the records so far.',
    ]
  }
  return [
    `The caller leans on ${call.tactic}. Pressure to skip checks is a red flag.`,
    'Do not take their word for it. The desk tools can check what they told you.',
    clueFor(call, call.contradictions[0]),
  ]
}

const TACTIC_TELLS = {
  urgency: 'The caller pushed a tight deadline so you would skip the checks.',
  authority: 'The caller leaned on senior names and rank to discourage questions.',
  familiarity: 'The caller acted like an old friend so verifying would feel rude.',
  helpfulness: 'The caller framed it as a favour to you to make saying no feel unkind.',
  fear: 'The caller hinted at trouble for both of you to rush the decision.',
}

function contradictionText(call, item) {
  const { directory, ticket, callback } = call.facts
  if (item.tool === 'directory') {
    if (!directory.found) return `The ${directory.source} has no entry for ${call.caller.name}.`
    if (directory.status.startsWith('on leave')) {
      return `${call.caller.name} is listed as ${directory.status}.`
    }
    return `The directory places ${call.caller.name} in ${directory.company ?? directory.department}, not ${call.caller.department}.`
  }
  if (item.tool === 'ticket') {
    if (!ticket.found) return `Ticket ${ticket.ref} does not exist.`
    if (ticket.status === 'closed')
      return `Ticket ${ticket.ref} is closed and about something else.`
    return `Ticket ${ticket.ref} was raised by ${ticket.requester}, not ${call.caller.name}.`
  }
  return `The caller offered ${callback.numberOffered} but the number on file is ${callback.numberOnFile}.`
}

function tellsFor(call) {
  if (call.genuine) {
    return [
      {
        kind: 'consistent',
        text: 'The directory, the ticket and the number on file all matched what the caller said.',
      },
      {
        kind: 'tactic',
        text: 'A rushed tone is not a tell by itself. Real colleagues have deadlines too.',
      },
    ]
  }
  const tells = [{ kind: 'tactic', text: TACTIC_TELLS[call.tactic] }]
  for (const item of call.contradictions) {
    tells.push({ kind: item.tool, text: contradictionText(call, item) })
  }
  return tells
}

const ADVICE_ATTACKER =
  'A secret code is never read out on an incoming call. Verify the caller through the directory, the ticket or a call back on the number on file.'
const ADVICE_GENUINE =
  'Real requests exist too. Checking first and then helping, or calling back on the number on file, is the balanced response.'

export function debriefFor(call, { scriptedReplies = 0 } = {}) {
  return {
    genuine: call.genuine,
    headline: call.genuine
      ? `${call.caller.name} was a genuine colleague.`
      : `${call.caller.name} was not who they claimed to be.`,
    tells: tellsFor(call),
    advice: call.genuine ? ADVICE_GENUINE : ADVICE_ATTACKER,
    scriptedNote:
      scriptedReplies > 0
        ? 'Some replies were scripted while the AI was busy or unavailable.'
        : null,
  }
}
