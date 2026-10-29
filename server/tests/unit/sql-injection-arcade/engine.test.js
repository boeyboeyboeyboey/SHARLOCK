import { describe, expect, it } from 'vitest'
import {
  isTaken,
  runBlind,
  runChange,
  runLogin,
  runNumeric,
  runUnion,
  tokenise,
} from '../../../src/modules/games/sql-injection-arcade/engine.js'

const users = {
  userCol: 'username',
  passCol: 'passcode',
  rows: [
    { user: 'admin', pass: 'Tide-1111' },
    { user: 'clerk', pass: 'Keel-2222' },
    { user: 'harbourmaster', pass: 'Buoy-3333' },
  ],
  targetIndex: 1,
}
const union = {
  manifests: {
    table: 'manifests',
    searchCol: 'vessel',
    columns: ['vessel', 'cargo'],
    rows: [{ vessel: 'Sea Heron', cargo: 'tea' }],
  },
  target: {
    table: 'officers',
    columns: ['username', 'passcode'],
    rows: [{ username: 'clerk', passcode: 'Keel-2222' }],
  },
  decoy: {
    table: 'berths',
    columns: ['berth_no', 'tug'],
    rows: [{ berth_no: 'B4', tug: 'Otter' }],
  },
}
const blind = {
  col: 'crate',
  crates: ['CR-1000', 'CR-2000'],
  known: 'CR-1000',
  hiddenCol: 'passcode',
  hiddenValue: 'Tide-1234',
}
const code = (result) => result.code

describe('tokeniser', () => {
  it('stops at comments, keeps doubled quotes and ignores dashes inside strings', () => {
    expect(tokenise("a = 'it''s' -- rest").map((t) => t.v)).toEqual(['a', '=', "it's"])
    expect(tokenise("a = 'x--y' # rest")).toHaveLength(3)
  })
  it('rejects stacked statements, odd characters, long numbers and too many tokens', () => {
    expect(() => tokenise('a = 1; b')).toThrow()
    expect(() => tokenise('a = 1234567890123')).toThrow()
    expect(() => tokenise('a = 1x')).toThrow()
    expect(() => tokenise(Array(60).fill('1').join(' '))).toThrow()
    expect(() => tokenise("a = 'open")).toThrow()
  })
})

describe('t1 login variants', () => {
  it.each([
    ["' OR 1=1 --", 'x', 'SUCCESS'],
    ["' or 'yes'='yes' #", 'x', 'SUCCESS'],
    ['x', "' OR 'a'='a", 'SUCCESS'],
    ["' OR 1=2 --", '', 'NO_MATCH'],
    ['guest', 'pw', 'NO_BREAKOUT'],
    ["'", '', 'SYNTAX_ERROR'],
    ["' OR 1=1;", '', 'UNSUPPORTED'],
    ["' OR 1=1 UNION SELECT 1 --", '', 'SYNTAX_ERROR'],
    ['x'.repeat(2), "' OR " + '1=1 OR '.repeat(10) + '1=1--', 'UNSUPPORTED'],
  ])('tautology %j %j is %s', (user, pass, expected) =>
    expect(code(runLogin(users, [user, pass], 'login-tautology'))).toBe(expected),
  )
  it('comment cut-off needs the named account, with either comment marker', () => {
    expect(code(runLogin(users, ["clerk'--", ''], 'login-comment'))).toBe('SUCCESS')
    expect(code(runLogin(users, ["clerk' #", ''], 'login-comment'))).toBe('SUCCESS')
    expect(code(runLogin(users, ["' OR 1=1--", ''], 'login-comment'))).toBe('WRONG_ACCOUNT')
    expect(code(runLogin(users, ["nobody'--", ''], 'login-comment'))).toBe('NO_MATCH')
  })
  it('numeric field breaks out without any quote', () => {
    const model = { col: 'badge', rows: [{ badge: 4001 }, { badge: 4002 }] }
    expect(code(runNumeric(model, ['0 OR 1=1']))).toBe('SUCCESS')
    expect(code(runNumeric(model, ['0 or 2 > 1']))).toBe('SUCCESS')
    expect(code(runNumeric(model, ['4001']))).toBe('NORMAL')
    expect(code(runNumeric(model, ['9']))).toBe('NO_BREAKOUT')
    expect(code(runNumeric(model, ["' OR 1=1--"]))).toBe('SYNTAX_ERROR')
    expect(code(runNumeric(model, ['']))).toBe('SYNTAX_ERROR')
  })
})

describe('t2 union', () => {
  const run = (input) => runUnion(union, [input])
  it('returns target table data for a correct column count', () => {
    const result = run("zz' UNION SELECT username, passcode FROM officers--")
    expect(result.code).toBe('SUCCESS')
    expect(result.rows).toContainEqual(['clerk', 'Keel-2222'])
    expect(code(run("zz' UNION SELECT NULL, passcode FROM officers #"))).toBe('SUCCESS')
    expect(code(run("zz' UNION ALL SELECT 'a', username FROM officers--"))).toBe('SUCCESS')
  })
  it('reports the classic mismatch, literal-only, wrong table and widened results', () => {
    expect(code(run("zz' UNION SELECT username FROM officers--"))).toBe('COLUMN_MISMATCH')
    expect(code(run("zz' UNION SELECT NULL, NULL FROM officers--"))).toBe('NO_DATA')
    expect(code(run("zz' UNION SELECT berth_no, tug FROM berths--"))).toBe('WRONG_TABLE')
    expect(code(run("zz' OR 1=1--"))).toBe('WIDENED')
    expect(code(run('Sea'))).toBe('NORMAL')
  })
  it('stays inside the grammar', () => {
    expect(code(run("zz' UNION SELECT username, passcode FROM nowhere--"))).toBe('SYNTAX_ERROR')
    expect(code(run("zz' UNION SELECT username, secret FROM officers--"))).toBe('SYNTAX_ERROR')
    expect(code(run("zz' UNION SELECT username, passcode FROM officers"))).toBe('SYNTAX_ERROR')
    expect(code(run("zz' UNION SELECT * FROM officers--"))).toBe('UNSUPPORTED')
    expect(code(run("zz'; DROP TABLE officers--"))).toBe('UNSUPPORTED')
    expect(code(run("zz' UNION SELECT username, passcode FROM officers WHERE 1=1--"))).toBe(
      'UNSUPPORTED',
    )
  })
})

describe('t2 boolean blind', () => {
  const run = (input) => runBlind(blind, [input])
  it('answers only yes or no and flags injection and substring probes', () => {
    expect(run('CR-1000')).toMatchObject({ code: 'YES', injected: false })
    expect(run('CR-9')).toMatchObject({ code: 'NO' })
    expect(run("CR-1000' AND 1=1--")).toMatchObject({ code: 'YES', injected: true, sub: false })
    expect(run("CR-1000' AND 1=2--")).toMatchObject({ code: 'NO', startsKnown: true })
    expect(run("CR-1000' AND 'a'='a")).toMatchObject({ code: 'YES' })
  })
  it('supports SUBSTRING(col,i,1) compared with = < >', () => {
    expect(run("CR-1000' AND SUBSTRING(passcode,1,1) > 'M'--")).toMatchObject({
      code: 'YES',
      sub: true,
    })
    expect(code(run("CR-1000' AND SUBSTRING(passcode,1,1) < 'M'--"))).toBe('NO')
    expect(code(run("CR-1000' AND SUBSTRING(passcode,2,1) = 'i'--"))).toBe('YES')
  })
  it('rejects other substring shapes and unknown columns', () => {
    expect(code(run("CR-1000' AND SUBSTRING(passcode,1,2) > 'M'--"))).toBe('UNSUPPORTED')
    expect(code(run("CR-1000' AND SUBSTRING(passcode,0,1) > 'M'--"))).toBe('UNSUPPORTED')
    expect(code(run("CR-1000' AND SUBSTRING(nope,1,1) > 'M'--"))).toBe('SYNTAX_ERROR')
    expect(code(run("CR-1000' AND nope = 1--"))).toBe('SYNTAX_ERROR')
  })
})

describe('t3 second order', () => {
  it('updates the target only when the stored name cuts off the rest of the query', () => {
    expect(code(runChange(users, "clerk'--"))).toBe('SUCCESS')
    expect(code(runChange(users, 'newcomer'))).toBe('OWN_ACCOUNT')
    expect(code(runChange(users, "' OR 1=1--"))).toBe('TOO_BROAD')
    expect(code(runChange(users, "ghost'--"))).toBe('NO_MATCH')
    expect(code(runChange(users, "admin'--"))).toBe('WRONG_ACCOUNT')
    expect(code(runChange(users, "x'; DROP TABLE officers--"))).toBe('UNSUPPORTED')
  })
  it('refuses a name that is already taken', () => {
    expect(isTaken(users, 'CLERK')).toBe(true)
    expect(isTaken(users, "clerk'--")).toBe(false)
  })
})

describe('no execution by design', () => {
  it('has no way to reach a database, shell or eval', async () => {
    const { readFile } = await import('node:fs/promises')
    const source = await readFile(
      new URL('../../../src/modules/games/sql-injection-arcade/engine.js', import.meta.url),
      'utf8',
    )
    expect(source).not.toMatch(/child_process|mongoose|\beval\b|new Function|require\(/)
    expect(source.match(/^import /gm) ?? []).toHaveLength(0)
  })
})
