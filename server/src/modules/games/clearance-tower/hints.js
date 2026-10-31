export const HINT_COST = 10
export const MAX_HINTS = 2

// tier 1 names the principle to check, tier 2 explains it for this case; neither gives cells, labels or roles
export const HINTS = {
  'the-matrix': [
    'Check least privilege: does every right you grant match a task on today’s work list?',
    'Least privilege means each agent holds only the rights their own work needs. Every extra cell in the matrix is a door left open, and someone on the contractor list is already looking for one.',
  ],
  'the-gift': [
    'Check whose rights a macro runs with when someone opens it.',
    'Under discretionary control a program inherits every right of the person who runs it, so it can copy data anywhere that person may write. Trace where a copy could travel, then weigh whether closing a path also stops real work.',
  ],
  'read-down-write-up': [
    'Check the two Bell–LaPadula rules: no read up and no write down.',
    'An agent may read only files at or below its clearance and write only files at or above it, so information only flows upward. Compare each agent’s clearance with what their work reads and writes, then choose a floor for each file that allows it.',
  ],
  compartments: [
    'Check dominance: access needs a high enough level and every category.',
    'One label dominates another only when its level is at least as high and its categories include all of the other’s. Some labels are incomparable, so a higher level alone is not enough. Reading needs the agent to dominate the file, and writing needs the file to dominate the agent.',
  ],
  'roles-not-people': [
    'Check separation of duties: nobody should do the work and also edit or audit the register.',
    'Role-based control gives permissions to roles and roles to agents. Build each role around one job, assign only the badges an agent’s work needs, then check the duty rules on the desk against what each agent ends up holding.',
  ],
  reshuffle: [
    'Check least privilege for each move: remove the badges people no longer need.',
    'In role-based control a staff change is a badge edit, not a rewrite of permissions. For each person who moved, drop the old badges and add the ones the new job needs, then recheck that nobody who now holds several badges breaks a duty rule.',
  ],
}

export function hintTexts(levelId, used) {
  return (HINTS[levelId] ?? []).slice(0, used)
}
