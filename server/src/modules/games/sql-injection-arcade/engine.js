// bounded teaching parser for sql-2: it never runs SQL and never touches a database.
// each case builds a query string from fixed text plus the player's raw input, the string is
// tokenised under an allowlist and the resulting condition is evaluated in memory against a
// fictional table made of synthetic rows. anything outside the grammar stops with a code.

const MAX_TOKENS = 48
const MAX_LITERAL = 80
const MAX_ROWS_SHOWN = 5
const MAX_CELL = 24
const KEYWORDS = new Set([
  'SELECT',
  'FROM',
  'WHERE',
  'AND',
  'OR',
  'UNION',
  'ALL',
  'LIKE',
  'NULL',
  'SUBSTRING',
])
const PUNCTUATION = new Set(['(', ')', ',', '=', '<', '>'])

export class SqlStop extends Error {
  constructor(code, detail = '') {
    super(detail)
    this.code = code
  }
}

const syntax = (detail) => new SqlStop('SYNTAX_ERROR', detail)
const unsupported = (detail) => new SqlStop('UNSUPPORTED', detail)

export function tokenise(text) {
  const tokens = []
  let cursor = 0
  while (cursor < text.length) {
    const rest = text.slice(cursor)
    const space = /^\s+/.exec(rest)
    if (space) {
      cursor += space[0].length
      continue
    }
    // a comment drops the rest of the line, which is how an attacker removes the template's tail
    if (rest.startsWith('--') || rest[0] === '#') break
    const number = /^\d+/.exec(rest)
    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest)
    if (number) {
      if (number[0].length > 12 || /^[A-Za-z_]/.test(rest.slice(number[0].length)))
        throw unsupported('number')
      tokens.push({ t: 'num', v: Number(number[0]) })
      cursor += number[0].length
    } else if (rest[0] === "'") {
      let value = ''
      let index = 1
      for (;;) {
        if (index >= rest.length) throw syntax('unterminated string')
        if (rest[index] === "'") {
          if (rest[index + 1] !== "'") break
          value += "'"
          index += 2
        } else {
          value += rest[index]
          index += 1
        }
      }
      if (value.length > MAX_LITERAL) throw unsupported('literal')
      tokens.push({ t: 'str', v: value })
      cursor += index + 1
    } else if (word) {
      const upper = word[0].toUpperCase()
      tokens.push(
        KEYWORDS.has(upper) ? { t: 'kw', v: upper } : { t: 'id', v: word[0].toLowerCase() },
      )
      cursor += word[0].length
    } else if (PUNCTUATION.has(rest[0])) {
      tokens.push({ t: 'p', v: rest[0] })
      cursor += 1
    } else if (rest[0] === '%') throw syntax('leftover pattern')
    else throw unsupported('character')
    if (tokens.length > MAX_TOKENS) throw unsupported('length')
  }
  return tokens
}

const is = (token, type, value) => token?.t === type && (value === undefined || token.v === value)

function parseOperand(tokens, pos, allowSubstring) {
  const token = tokens[pos]
  if (is(token, 'num') || is(token, 'str')) return [{ k: 'lit', v: token.v }, pos + 1]
  if (is(token, 'kw', 'NULL')) return [{ k: 'lit', v: null }, pos + 1]
  if (is(token, 'id')) return [{ k: 'col', v: token.v }, pos + 1]
  if (is(token, 'kw', 'SUBSTRING')) {
    if (!allowSubstring) throw unsupported('function')
    const shape = [['p', '('], ['id'], ['p', ','], ['num'], ['p', ','], ['num'], ['p', ')']]
    const parts = shape.map(([type, value], offset) => {
      if (!is(tokens[pos + 1 + offset], type, value)) throw syntax('substring')
      return tokens[pos + 1 + offset]
    })
    const at = parts[3].v
    if (parts[5].v !== 1 || at < 1 || at > 64) throw unsupported('substring range')
    return [{ k: 'sub', col: parts[1].v, at }, pos + 8]
  }
  throw syntax('operand')
}

// condition := atom (AND atom)* (OR atom (AND atom)*)*, atom := operand (= | < | > | LIKE) operand
function parseCondition(tokens, start, allowSubstring) {
  const groups = [[]]
  let pos = start
  for (;;) {
    const [left, afterLeft] = parseOperand(tokens, pos, allowSubstring)
    const op = tokens[afterLeft]
    if (!(is(op, 'p') && ['=', '<', '>'].includes(op.v)) && !is(op, 'kw', 'LIKE'))
      throw syntax('comparison')
    const [right, afterRight] = parseOperand(tokens, afterLeft + 1, allowSubstring)
    groups.at(-1).push({ left, op: op.v, right })
    pos = afterRight
    if (is(tokens[pos], 'kw', 'AND')) pos += 1
    else if (is(tokens[pos], 'kw', 'OR')) {
      pos += 1
      groups.push([])
    } else return { groups, pos }
  }
}

function checkColumns(groups, columns) {
  for (const atom of groups.flat())
    for (const side of [atom.left, atom.right]) {
      const name = side.k === 'col' ? side.v : side.k === 'sub' ? side.col : null
      if (name !== null && !columns.includes(name)) throw syntax('unknown column')
    }
}

function valueOf(side, row) {
  if (side.k === 'lit') return side.v
  if (side.k === 'col') return row[side.v]
  return String(row[side.col]).slice(side.at - 1, side.at)
}

function compare(a, op, b) {
  if (a === null || b === null || a === undefined || b === undefined) return false
  if (op === 'LIKE') {
    const pattern = String(b)
      .split('%')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')
    return new RegExp(`^${pattern}$`, 'is').test(String(a))
  }
  if (typeof a === 'number' && typeof b === 'number')
    return op === '=' ? a === b : op === '<' ? a < b : a > b
  const left = String(a).toUpperCase()
  const right = String(b).toUpperCase()
  return op === '=' ? left === right : op === '<' ? left < right : left > right
}

function matches(groups, row) {
  return groups.some((group) =>
    group.every((atom) => compare(valueOf(atom.left, row), atom.op, valueOf(atom.right, row))),
  )
}

const usesSubstring = (groups) =>
  groups.flat().some((atom) => atom.left.k === 'sub' || atom.right.k === 'sub')

// indexes of the rows whose condition holds, for a tail that must be one complete condition
function runWhere(tail, rows, allowSubstring = false) {
  const tokens = tokenise(tail)
  const { groups, pos } = parseCondition(tokens, 0, allowSubstring)
  if (pos !== tokens.length) throw syntax('trailing')
  checkColumns(groups, Object.keys(rows[0]))
  return {
    matched: rows.flatMap((row, index) => (matches(groups, row) ? [index] : [])),
    sub: usesSubstring(groups),
  }
}

const quoted = (inputs) => inputs.some((value) => value.includes("'"))
const shown = (value) => String(value ?? 'NULL').slice(0, MAX_CELL)

function guard(run) {
  try {
    return run()
  } catch (error) {
    if (error instanceof SqlStop) return { code: error.code }
    throw error
  }
}

// t1 quoted logins: where user = 'u' and pass = 'p' with both fields concatenated
export function runLogin(model, inputs, kind) {
  return guard(() => {
    const [user, pass = ''] = inputs
    const rows = model.rows.map((row) => ({ [model.userCol]: row.user, [model.passCol]: row.pass }))
    const tail = `${model.userCol} = '${user}' AND ${model.passCol} = '${pass}'`
    const { matched } = runWhere(tail, rows)
    if (!matched.length) return { code: quoted(inputs) ? 'NO_MATCH' : 'NO_BREAKOUT' }
    if (!quoted(inputs)) return { code: 'NORMAL' }
    if (kind === 'login-comment' && matched[0] !== model.targetIndex)
      return { code: 'WRONG_ACCOUNT' }
    return { code: 'SUCCESS' }
  })
}

// t1 unquoted numeric field: where badge = <input>
export function runNumeric(model, inputs) {
  return guard(() => {
    const [input] = inputs
    const rows = model.rows.map((row) => ({ [model.col]: row.badge }))
    const { matched } = runWhere(`${model.col} = ${input}`, rows)
    const plain = /^\s*\d{1,12}\s*$/.test(input)
    if (!matched.length) return { code: plain ? 'NO_BREAKOUT' : 'NO_MATCH' }
    return { code: plain ? 'NORMAL' : 'SUCCESS' }
  })
}

function itemRow(items, row) {
  return items.map((item) => (item.k === 'col' ? shown(row[item.v]) : shown(item.v)))
}

// t2 union: select n columns from manifests where vessel like '%<input>%'
export function runUnion(model, inputs) {
  return guard(() => {
    const [input] = inputs
    const { manifests, target, decoy } = model
    const tokens = tokenise(`${manifests.searchCol} LIKE '%${input}%'`)
    const { groups, pos } = parseCondition(tokens, 0, false)
    checkColumns(groups, manifests.columns)
    const base = manifests.rows.filter((row) => matches(groups, row))
    const baseRows = base.map((row) => manifests.columns.map((name) => shown(row[name])))
    if (pos === tokens.length) {
      const code = quoted(inputs) ? 'WIDENED' : 'NORMAL'
      return { code, rows: baseRows.slice(0, MAX_ROWS_SHOWN) }
    }
    let cursor = pos
    if (!is(tokens[cursor], 'kw', 'UNION')) throw syntax('after condition')
    cursor += 1
    if (is(tokens[cursor], 'kw', 'ALL')) cursor += 1
    if (!is(tokens[cursor], 'kw', 'SELECT')) throw syntax('select')
    cursor += 1
    const items = []
    for (;;) {
      const [item, next] = parseOperand(tokens, cursor, false)
      items.push(item)
      cursor = next
      if (!is(tokens[cursor], 'p', ',')) break
      cursor += 1
    }
    if (!is(tokens[cursor], 'kw', 'FROM') || !is(tokens[cursor + 1], 'id')) throw syntax('from')
    const tables = new Map([manifests, target, decoy].map((table) => [table.table, table]))
    const from = tables.get(tokens[cursor + 1].v)
    if (!from) throw syntax('unknown table')
    if (cursor + 2 !== tokens.length) throw unsupported('after table')
    for (const item of items)
      if (item.k === 'col' && !from.columns.includes(item.v)) throw syntax('unknown column')
    if (items.some((item) => item.k === 'sub')) throw unsupported('function')
    if (items.length !== manifests.columns.length) return { code: 'COLUMN_MISMATCH' }
    const pulled = from.rows.map((row) => itemRow(items, row))
    const rows = [...baseRows, ...pulled].slice(0, MAX_ROWS_SHOWN)
    const fromColumns = items.some((item) => item.k === 'col')
    if (!fromColumns) return { code: 'NO_DATA', rows }
    return { code: from === target ? 'SUCCESS' : 'WRONG_TABLE', rows }
  })
}

// t2 boolean blind: where crate = '<input>' answers only in stock or not
export function runBlind(model, inputs) {
  return guard(() => {
    const [input] = inputs
    const rows = model.crates.map((crate) => ({
      [model.col]: crate,
      [model.hiddenCol]: model.hiddenValue,
    }))
    const { matched, sub } = runWhere(`${model.col} = '${input}'`, rows, true)
    return {
      code: matched.length ? 'YES' : 'NO',
      injected: quoted(inputs),
      sub,
      startsKnown: input.toUpperCase().startsWith(model.known.toUpperCase()),
    }
  })
}

// t3 second order: the stored name is concatenated into the later update
export function runChange(model, stored) {
  return guard(() => {
    const rows = [
      ...model.rows.map((row) => ({ [model.userCol]: row.user })),
      { [model.userCol]: stored },
    ]
    const { matched } = runWhere(`${model.userCol} = '${stored}'`, rows)
    const own = rows.length - 1
    if (!matched.length) return { code: 'NO_MATCH' }
    if (matched.length === 1 && matched[0] === own) return { code: 'OWN_ACCOUNT' }
    if (matched.length > 1) return { code: 'TOO_BROAD' }
    return { code: matched[0] === model.targetIndex ? 'SUCCESS' : 'WRONG_ACCOUNT' }
  })
}

export function isTaken(model, name) {
  return model.rows.some((row) => row.user.toUpperCase() === name.toUpperCase())
}
