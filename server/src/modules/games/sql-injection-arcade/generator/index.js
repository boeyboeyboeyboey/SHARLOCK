import { createRandom } from './random.js'
import {
  BADGE_SETS,
  CODE_WORDS,
  COLUMN_VALUES,
  CRATE_SETS,
  DECOY_TABLES,
  EXTRA_COLUMNS,
  MANIFEST_TABLES,
  OTHER_NAMES,
  SEARCH_COLUMNS,
  TARGET_NAMES,
  USER_TABLES,
} from './pools.js'
import { KIND_TIER, caseNumber, isRepairSlot } from '../policy.js'

export const GENERATOR_VERSION = 'sql-gen-1'

const SEED_PATTERN = /^[0-9a-f]{32}$/
const MAX_INDEX = 1000
const LOGIN_KINDS = ['login-tautology', 'login-comment', 'login-numeric']
const NEW_PASSCODE = 'Training-1234'
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXY'

const REPAIR_SETS = {
  login: {
    bind: [
      'Use a parameterised query so the username and passcode are bound values',
      'Bound values are always treated as data, so a quote can never close the string or add a condition.',
    ],
    blacklist: [
      'Reject inputs that contain OR, a quote or two dashes',
      "A blacklist is easy to get around with other spellings and breaks real names such as O'Brien; the query is still built from text.",
    ],
    privilege: [
      'Run the login query as a database account that can only read the login table',
      'Least privilege limits the damage, but the injected condition still works on the table that account can read.',
    ],
    distractor: [
      'Hide the SQL error messages from the login page',
      'Hiding errors removes a clue for the attacker but the query is still injectable.',
    ],
  },
  numeric: {
    bind: [
      'Use a parameterised query and bind the badge number as a number',
      'A bound number cannot carry extra SQL, whether or not the field has quotes.',
    ],
    blacklist: [
      'Escape single quotes in the badge field',
      'This field has no quotes around it, so escaping quotes does nothing: 0 OR 1=1 needs none.',
    ],
    privilege: [
      'Run the lookup as an account that can only read the badge table',
      'Least privilege limits the damage, but the tautology still returns every badge.',
    ],
    distractor: [
      'Make the badge field longer so the number fits',
      'Field length has nothing to do with whether input becomes code.',
    ],
  },
  union: {
    bind: [
      'Use a parameterised query and bind the search text',
      'The search text stays a value inside the LIKE pattern, so UNION is just text to look for.',
    ],
    blacklist: [
      'Block the word UNION in the search box',
      'Filters are bypassed with other spellings or other techniques, and the query would still be built from text.',
    ],
    privilege: [
      'Let the search account read only the manifests table',
      'Least privilege helps: UNION can no longer reach the login table, but the injection itself remains.',
    ],
    distractor: [
      'Show fewer columns in the results',
      'Attackers adjust the column count in their UNION; this changes nothing about the injection.',
    ],
  },
  blind: {
    bind: [
      'Use a parameterised query for the stock check',
      'With bound values there is no condition to inject, so there is nothing to answer yes or no about.',
    ],
    blacklist: [
      'Strip SUBSTRING and comment markers from the crate number',
      'Blind injection works with many other functions and operators, so a filter keeps losing.',
    ],
    privilege: [
      'Give the stock check account no access to the login table',
      'Least privilege helps by hiding the secret column, but the injectable query remains.',
    ],
    distractor: [
      'Add a short delay to every stock check',
      'A delay does not stop the yes or no answer from leaking, it only slows it.',
    ],
  },
  'second-order': {
    bind: [
      'Use a parameterised query in the password change too',
      'Data that was stored safely is still just data when it is read back; binding it keeps it from becoming code.',
    ],
    blacklist: [
      'Escape quotes when the username is first saved',
      'The insert was already safe. The flaw is the later query that trusts the stored value.',
    ],
    privilege: [
      'Run the password change as an account that can only update its own row',
      'Least privilege limits the damage, but the unsafe query is still there.',
    ],
    distractor: [
      'Block usernames longer than 40 characters',
      'The attack needs only a short name; length limits do not separate data from code.',
    ],
  },
}

const FAMILY = {
  'login-tautology': 'login',
  'login-comment': 'login',
  'login-numeric': 'numeric',
  union: 'union',
  blind: 'blind',
  'second-order': 'second-order',
}

const TITLES = {
  'login-tautology': 'Bypass the front desk',
  'login-comment': 'Walk in as a known clerk',
  'login-numeric': 'Badge scanner with no quotes',
  union: 'Smuggle rows into a search',
  blind: 'Ask the stock page a question',
  'second-order': 'The name that waits',
  repair: 'Choose the fix',
}

const HINTS = {
  'login-tautology':
    'Close the username string with a quote, add a condition that is always true, then comment out the rest.',
  'login-comment':
    'You know the username. Close its string and use a comment marker so the passcode check disappears.',
  'login-numeric':
    'There are no quotes around this field. Add the extra condition straight after the number.',
  union:
    'Close the quote, then UNION SELECT with exactly as many items as the result table has columns, from the table named in the hint, and comment out the rest.',
  blind:
    'First prove you control the query with a true and a false condition after the crate number. Then compare the first letter with SUBSTRING.',
  'second-order':
    'The registration is safe. The later update is not. Pick a name that closes the string and comments out the rest.',
}

function isValidInput(seed, index) {
  return (
    typeof seed === 'string' &&
    SEED_PATTERN.test(seed) &&
    Number.isInteger(index) &&
    index >= 0 &&
    index <= MAX_INDEX
  )
}

// difficulty ramp: cases 1-3 are tier 1, then tier 1/2 mixes, then tier 2/3 mixes
export function kindForCase(seed, number, rng) {
  if (number < 3) {
    const offset = createRandom(seed, 'plan').int(0, 2)
    return LOGIN_KINDS[(offset + number) % 3]
  }
  if (number < 7) return rng.next() < 0.4 ? rng.pick(LOGIN_KINDS) : rng.pick(['union', 'blind'])
  return rng.next() < 0.5 ? rng.pick(['union', 'blind']) : 'second-order'
}

const code = (rng) => `${rng.pick(CODE_WORDS)}-${rng.int(1000, 9999)}`

function userModel(rng, table, withTarget = true) {
  const target = rng.pick(TARGET_NAMES)
  const others = rng.shuffle(OTHER_NAMES).slice(0, 3)
  const names = rng.shuffle(withTarget ? [target, ...others] : others)
  return {
    target,
    model: {
      ...table,
      rows: names.map((user) => ({ user, pass: code(rng) })),
      targetIndex: names.indexOf(target),
    },
  }
}

function buildLogin(rng, kind) {
  const table = rng.pick(USER_TABLES)
  if (kind === 'login-numeric') {
    const set = rng.pick(BADGE_SETS)
    const rows = Array.from({ length: 4 }, (_, i) => ({ badge: 4000 + i * 137 + rng.int(0, 99) }))
    return {
      public: {
        scenario:
          'The gate scanner looks up a badge number in the customs registry. The field is a number, so the developers did not add quotes around it.',
        goal: 'Open the first file in the registry without knowing a valid badge number.',
        query: `SELECT * FROM ${set.table} WHERE ${set.col} = ‹badge›`,
        fields: [{ id: 'badge', label: 'Badge number' }],
      },
      model: { ...set, rows },
      explanation: `The badge field was inserted without quotes, so a quote was never the way in: 0 OR 1=1 turned the check into ${set.col} = 0 OR 1=1, which is true for every row.`,
    }
  }
  const { target, model } = userModel(rng, table)
  if (kind === 'login-comment') {
    const targetIndex = rng.int(1, 3)
    const rows = [...model.rows]
    const from = rows.findIndex((row) => row.user === target)
    ;[rows[from], rows[targetIndex]] = [rows[targetIndex], rows[from]]
    model.rows = rows
    model.targetIndex = targetIndex
  }
  const quotedFields = `${model.userCol} = '‹username›' AND ${model.passCol} = '‹password›'`
  const fields = [
    { id: 'username', label: 'Username' },
    { id: 'password', label: 'Passcode' },
  ]
  const query = `SELECT * FROM ${model.table} WHERE ${quotedFields}`
  if (kind === 'login-tautology')
    return {
      public: {
        scenario:
          'The customs house login page builds its query by pasting both fields into the text.',
        goal: 'Get past the login without knowing any passcode.',
        query,
        fields,
      },
      model,
      explanation:
        'A quote closed the username string, OR 1=1 made the condition always true and -- commented out the passcode check. The page builds SQL by gluing text together, so the input became code.',
    }
  return {
    public: {
      scenario: `You know the account name ${target}, but not its passcode. The login query pastes both fields into the text.`,
      goal: `Log in as ${target} without the passcode.`,
      query,
      fields,
    },
    model,
    explanation: `${target}'-- closed the username string and commented out the passcode check, so only the username decided the match. A tautology would have logged you in as the first row, not as ${target}.`,
  }
}

function buildUnion(rng) {
  const tableName = rng.pick(MANIFEST_TABLES)
  const searchCol = rng.pick(SEARCH_COLUMNS)
  const n = rng.int(2, 4)
  const extras = rng.shuffle([...SEARCH_COLUMNS.filter((c) => c !== searchCol), ...EXTRA_COLUMNS])
  const columns = [searchCol, ...extras.slice(0, n - 1)]
  const rows = Array.from({ length: 3 }, () =>
    Object.fromEntries(columns.map((name) => [name, rng.pick(COLUMN_VALUES[name])])),
  )
  const userTable = rng.pick(USER_TABLES)
  const { model: users } = userModel(rng, userTable)
  const targetColumns = [userTable.userCol, userTable.passCol]
  const targetRows = users.rows.map((row) => ({
    [userTable.userCol]: row.user,
    [userTable.passCol]: row.pass,
  }))
  const decoyBase = rng.pick(DECOY_TABLES)
  const decoy = {
    table: decoyBase.table,
    columns: decoyBase.columns,
    rows: decoyBase.values.map((values) =>
      Object.fromEntries(decoyBase.columns.map((name, i) => [name, values[i]])),
    ),
  }
  const manifests = { table: tableName, searchCol, columns, rows }
  const target = { table: userTable.table, columns: targetColumns, rows: targetRows }
  return {
    public: {
      scenario: `The ${tableName} page searches ${searchCol} with a LIKE pattern and shows ${n} columns. A debug page leaked part of the schema.`,
      goal: `Make the search page show data from the ${userTable.table} table.`,
      query: `SELECT ${columns.join(', ')} FROM ${tableName} WHERE ${searchCol} LIKE '%‹search›%'`,
      fields: [{ id: 'search', label: 'Search' }],
      resultColumns: [...columns],
      schemaHint: [
        { table: userTable.table, columns: [...targetColumns] },
        { table: decoy.table, columns: [...decoy.columns] },
      ],
    },
    model: { manifests, target, decoy },
    explanation: `A quote closed the LIKE pattern, UNION SELECT with exactly ${n} items from ${userTable.table} appended another table's rows to the result, and -- removed the leftover %'. The column count had to match the original query.`,
  }
}

function buildBlind(rng) {
  const set = rng.pick(CRATE_SETS)
  const userTable = rng.pick(USER_TABLES)
  const target = rng.pick(TARGET_NAMES)
  const known = `CR-${rng.int(1000, 9999)}`
  const crates = [known, `CR-${rng.int(1000, 4999)}`, `CR-${rng.int(5000, 9999)}`]
  const hiddenValue = code(rng)
  const first = hiddenValue[0].toUpperCase()
  const pivot = rng.pick([...LETTERS].filter((letter) => letter !== first))
  const answer = first > pivot ? 'yes' : 'no'
  return {
    public: {
      scenario: `The stock page only says yes or no. A leftover join also exposes the ${target}'s ${userTable.passCol} column to this query.`,
      goal: `Prove the page is injectable, then answer: is the first letter of the ${target}'s ${userTable.passCol} after ${pivot} in the alphabet?`,
      query: `SELECT 1 FROM ${set.table} WHERE ${set.col} = '‹crate›'`,
      fields: [{ id: 'crate', label: 'Crate number' }],
      knownCrate: known,
      question: `Is the first letter of the ${target}'s ${userTable.passCol} after ${pivot}?`,
      schemaHint: [{ table: set.table, columns: [set.col, userTable.passCol] }],
    },
    model: { col: set.col, crates, known, hiddenCol: userTable.passCol, hiddenValue },
    answer,
    explanation: `Yes and no answers leak data one fact at a time. A true and a false condition proved you controlled the query, then SUBSTRING(${userTable.passCol},1,1) compared with '${pivot}' answered the question: the first letter is ${first}, so the answer is ${answer}.`,
  }
}

function buildSecondOrder(rng) {
  const table = rng.pick(USER_TABLES)
  const { target, model } = userModel(rng, table)
  return {
    public: {
      scenario: `New staff can register a username, and it is saved safely. Later the change password feature pastes the stored name into an UPDATE. ${target} is the account you want.`,
      goal: `Change ${target}'s passcode without logging in as ${target}.`,
      query: `UPDATE ${table.table} SET ${table.passCol} = '${NEW_PASSCODE}' WHERE ${table.userCol} = '‹stored name›'`,
      fields: [{ id: 'name', label: 'Username to register' }],
    },
    model: { ...model, newPass: NEW_PASSCODE },
    explanation: `The registration escaped the quote, so storing ${target}'-- was safe. The later update pasted that stored value into its WHERE clause, so the quote and comment ran as code and the update hit ${target}. Stored data is still untrusted.`,
  }
}

function buildRepair(seed, index, rng) {
  const previous = generateCase({ seed, index: index - 1 })
  const family = FAMILY[previous.private.kind]
  const roles = rng.shuffle(['bind', 'blacklist', 'privilege', 'distractor'])
  const ids = ['a', 'b', 'c', 'd']
  const set = REPAIR_SETS[family]
  return {
    public: {
      scenario: `That case is closed. Which fix actually stops this kind of bug?`,
      goal: 'Choose the fix.',
      forKind: previous.private.kind,
      forTitle: previous.public.title,
      options: roles.map((role, position) => ({ id: ids[position], text: set[role][0] })),
    },
    model: null,
    repair: {
      correctId: ids[roles.indexOf('bind')],
      why: Object.fromEntries(roles.map((role, position) => [ids[position], set[role][1]])),
    },
    explanation: set.bind[1],
  }
}

export function generateCase({ seed, index } = {}) {
  if (!isValidInput(seed, index)) return null
  const rng = createRandom(seed, index)
  const caseId = Math.floor(rng.next() * 2176782336)
    .toString(36)
    .padStart(6, '0')
  if (isRepairSlot(index)) {
    const built = buildRepair(seed, index, rng)
    return {
      public: {
        caseId,
        index,
        number: null,
        kind: 'repair',
        tier: 0,
        title: TITLES.repair,
        resultColumns: null,
        schemaHint: null,
        knownCrate: null,
        question: null,
        query: null,
        fields: [],
        ...built.public,
      },
      private: {
        kind: 'repair',
        tier: 0,
        model: null,
        repair: built.repair,
        hint: null,
        explanation: built.explanation,
      },
    }
  }
  const number = caseNumber(index)
  const kind = kindForCase(seed, number, rng)
  const built =
    kind === 'union'
      ? buildUnion(rng)
      : kind === 'blind'
        ? buildBlind(rng)
        : kind === 'second-order'
          ? buildSecondOrder(rng)
          : buildLogin(rng, kind)
  return {
    public: {
      caseId,
      index,
      number: number + 1,
      kind,
      tier: KIND_TIER[kind],
      title: TITLES[kind],
      resultColumns: null,
      schemaHint: null,
      knownCrate: null,
      question: null,
      ...built.public,
    },
    private: {
      kind,
      tier: KIND_TIER[kind],
      model: built.model,
      answer: built.answer ?? null,
      hint: HINTS[kind],
      explanation: built.explanation,
    },
  }
}
