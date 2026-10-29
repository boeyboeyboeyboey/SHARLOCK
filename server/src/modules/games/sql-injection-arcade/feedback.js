// teaching messages keyed by outcome code; they never include the private answer
const COMMON = {
  SYNTAX_ERROR:
    'The database reported a syntax error: the query it received was malformed, often an unbalanced quote or a missing piece. It still counts as a try.',
  UNSUPPORTED:
    'This trainer does not model that syntax, so nothing was evaluated. It still counts as a try.',
  NO_BREAKOUT: 'The input stayed inside its quotes, so the database treated it as plain data.',
  NO_MATCH: 'The query ran but matched no rows.',
  NORMAL: 'That is how the page is meant to work. No injection happened.',
  WRONG_ACCOUNT: 'You got in, but as a different account. Aim at the account you were asked for.',
  COLUMN_MISMATCH:
    'The used SELECT statements have a different number of columns. A UNION must return as many items as the original query.',
  NO_DATA:
    'The UNION worked, but it only returned literals. Select a column from the table you are after.',
  WRONG_TABLE: 'That table exists, but it is not the one holding the login details.',
  WIDENED:
    'You changed which manifest rows came back, but nothing from another table. Try a UNION.',
  YES: 'The page says: in stock.',
  NO: 'The page says: not in stock.',
  STORED: 'Registered. The quote was escaped on insert, so the name is stored exactly as typed.',
  TAKEN: 'That username is already registered. It counts as a try.',
  OWN_ACCOUNT: 'Only your own new account was updated.',
  TOO_BROAD: 'The update hit more than one account. Be precise about which row changes.',
  ANSWER_RIGHT: 'Correct answer.',
  ANSWER_WRONG: 'That answer does not match the hidden value.',
  FIX_RIGHT: 'That is the fix that separates data from code.',
  FIX_WRONG: 'That option does not fix the root cause.',
}

const SUCCESS = {
  'login-tautology': 'You are in. The always-true condition made the login query match a row.',
  'login-comment': 'You are in as the account you named. The comment removed the passcode check.',
  'login-numeric': 'The registry returned a file. The extra condition matched every row.',
  union: 'The results now include rows from the login table.',
  'second-order': 'The update hit the target account only.',
}

export function messageFor(kind, code) {
  if (!code) return null
  if (code === 'SUCCESS') return SUCCESS[kind] ?? null
  return COMMON[code] ?? null
}
