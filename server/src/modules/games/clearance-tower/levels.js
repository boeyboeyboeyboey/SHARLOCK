// private level data: the day's events and prediction answers never leave the server
// until a policy is submitted; publicLevel() decides what the browser may see first
import { CLEARANCES } from './models.js'

const step = (agent, action, file) => ({ agent, action, file })
const work = (id, story, agent, action, file) => ({
  id,
  kind: 'work',
  story,
  steps: [step(agent, action, file)],
})
const attack = (id, story, ...steps) => ({ id, kind: 'attack', story, steps })
const tamper = (id, story, ...steps) => ({ id, kind: 'integrity', story, steps })
const label = (level, categories = []) => ({ level, categories })

const ACTS = {
  1: 'Discretionary access control',
  2: 'Mandatory access control',
  3: 'Role-based access control',
}

const DUTIES = [
  {
    permissions: ['write-register', 'write-ops'],
    reason: 'Whoever edits the Access Register must not also do the work it grants.',
  },
  {
    permissions: ['write-register', 'read-audit'],
    reason: 'Whoever edits the Access Register must not also audit it.',
  },
]

const ROLE_PERMISSIONS = [
  { id: 'read-ops', name: 'Read Operations Files', action: 'read', file: 'ops' },
  { id: 'write-ops', name: 'Write Operations Files', action: 'write', file: 'ops' },
  { id: 'read-register', name: 'Read Access Register', action: 'read', file: 'register' },
  { id: 'write-register', name: 'Edit Access Register', action: 'write', file: 'register' },
  { id: 'read-audit', name: 'Read Audit Trail', action: 'read', file: 'audit' },
  { id: 'read-payroll', name: 'Read Payroll', action: 'read', file: 'payroll' },
]

const ROLE_FILES = [
  { id: 'ops', name: 'Operations Files' },
  { id: 'register', name: 'Access Register' },
  { id: 'audit', name: 'Audit Trail' },
  { id: 'payroll', name: 'Payroll' },
]

export const LEVELS = [
  {
    id: 'the-matrix',
    act: 1,
    model: 'dac',
    title: 'The Matrix',
    slides: 'CS440 07-access-control, slides 6 and 13–21 (18–19 are non-examinable background)',
    brief:
      'Halcyon Agency runs on an access matrix: every agent, every file, every right. Authentication has already proved who each agent is; access control decides what they may do. Grant exactly what today’s work needs. Somebody on the contractor list has been asking questions.',
    agents: [
      { id: 'director', name: 'Director Hale', title: 'Director' },
      { id: 'analyst', name: 'Analyst Okafor', title: 'Intelligence analyst' },
      { id: 'contractor', name: 'Contractor Vance', title: 'Facilities contractor' },
      { id: 'auditor', name: 'Auditor Lim', title: 'Internal auditor' },
    ],
    files: [
      { id: 'ops', name: 'Ops Plan' },
      { id: 'report', name: 'Field Report' },
      { id: 'payroll', name: 'Payroll' },
      { id: 'menu', name: 'Canteen Menu' },
    ],
    startPolicy: { grants: [] },
    day: [
      work('w1', 'Director Hale reviews the Ops Plan.', 'director', 'read', 'ops'),
      work('w2', 'Analyst Okafor checks the Ops Plan before fieldwork.', 'analyst', 'read', 'ops'),
      attack('a1', 'Contractor Vance browses for the Ops Plan.', step('contractor', 'read', 'ops')),
      work('w3', 'Analyst Okafor files the Field Report.', 'analyst', 'write', 'report'),
      work('w4', 'Director Hale reads the Field Report.', 'director', 'read', 'report'),
      work('w5', 'Auditor Lim checks the Payroll figures.', 'auditor', 'read', 'payroll'),
      attack(
        'a2',
        'Contractor Vance tries to open Payroll.',
        step('contractor', 'read', 'payroll'),
      ),
      work('w6', 'Contractor Vance reads the Canteen Menu.', 'contractor', 'read', 'menu'),
      attack('a3', 'Analyst Okafor peeks at Payroll.', step('analyst', 'read', 'payroll')),
      work('w7', 'Director Hale updates the Ops Plan.', 'director', 'write', 'ops'),
    ],
    predictions: [
      {
        id: 'p1',
        context:
          'Contractor Vance’s keycard is a capability list: Canteen Menu — r, Field Report — w.',
        request: 'Contractor Vance reads the Field Report.',
        answer: 'deny',
        explanation:
          'A capability lists exactly what its holder may do. It grants write on the Field Report, not read (slides 20–21).',
      },
      {
        id: 'p2',
        context:
          'Optional background, not examinable: Payroll is a UNIX file owned by Auditor Lim with mode 754 (owner rwx, group r-x, others r--). Director Hale is in its group.',
        request: 'Director Hale writes to Payroll.',
        answer: 'deny',
        explanation:
          'The group bits are r-x: read and execute, but no write (slides 18–19, marked non-examinable in the deck).',
      },
      {
        id: 'p3',
        context:
          'Optional background, not examinable: same file, same mode 754. Contractor Vance falls under “others”.',
        request: 'Contractor Vance reads Payroll.',
        answer: 'allow',
        explanation:
          'Others get r--, so anyone outside the owner and group can read it. A generous mode is a leak waiting to happen (slides 18–19, marked non-examinable in the deck).',
      },
    ],
    takeaways: [
      'An access matrix lists every subject–object right. ACLs store its columns with each file; capabilities store its rows with each agent (slides 14–21).',
      'Least privilege: grant only what the work needs. Every extra cell is a door left open.',
    ],
  },
  {
    id: 'the-gift',
    act: 1,
    model: 'dac',
    title: 'The Gift',
    slides: 'CS440 07-access-control, slides 22–25',
    brief:
      'The CFO owns the Merger File and briefs the Regional Manager through the Board Report. The access lists already match the work. This morning the Manager sent the CFO a helpful little macro. Decide whether to change anything.',
    agents: [
      { id: 'cfo', name: 'CFO Reyes', title: 'Chief financial officer' },
      { id: 'manager', name: 'Manager Voss', title: 'Regional manager' },
    ],
    files: [
      { id: 'merger', name: 'Merger File' },
      { id: 'board', name: 'Board Report' },
    ],
    // every fix for the trojan blocks three tasks, so the work row counts seven of ten as full marks
    unavoidableWorkLoss: 3,
    startPolicy: {
      grants: [
        { subject: 'cfo', object: 'merger', rights: ['r', 'w'] },
        { subject: 'cfo', object: 'board', rights: ['w'] },
        { subject: 'manager', object: 'board', rights: ['r'] },
      ],
    },
    day: [
      work('w1', 'CFO Reyes reads the Merger File.', 'cfo', 'read', 'merger'),
      work('w2', 'CFO Reyes publishes the morning Board Report.', 'cfo', 'write', 'board'),
      work('w3', 'Manager Voss reads the morning Board Report.', 'manager', 'read', 'board'),
      work('w4', 'CFO Reyes checks the merger numbers again.', 'cfo', 'read', 'merger'),
      work('w5', 'CFO Reyes revises the Merger File.', 'cfo', 'write', 'merger'),
      attack(
        'a1',
        'CFO Reyes runs Manager Voss’s “budget macro”. With the CFO’s rights it copies the Merger File into the Board Report, and Voss reads it.',
        step('cfo', 'read', 'merger'),
        step('cfo', 'write', 'board'),
        step('manager', 'read', 'board'),
      ),
      work('w6', 'CFO Reyes publishes the midday Board Report.', 'cfo', 'write', 'board'),
      work('w7', 'Manager Voss reads the midday Board Report.', 'manager', 'read', 'board'),
      work('w8', 'CFO Reyes prepares the closing figures.', 'cfo', 'read', 'merger'),
      work('w9', 'CFO Reyes publishes the evening Board Report.', 'cfo', 'write', 'board'),
      work('w10', 'Manager Voss reads the evening Board Report.', 'manager', 'read', 'board'),
    ],
    predictions: [
      {
        id: 'p1',
        context: 'The macro runs inside CFO Reyes’s session.',
        request: 'The macro reads the Merger File.',
        answer: 'allow',
        explanation:
          'A program runs with the rights of the person who starts it. The access list sees the CFO, not the macro (slide 25).',
      },
      {
        id: 'p2',
        context: 'The macro still runs as CFO Reyes.',
        request: 'The macro writes the merger figures into the Board Report.',
        answer: 'allow',
        explanation:
          'The CFO may write the Board Report, so the copy succeeds. Discretionary control checks who asks, not where the data came from.',
      },
      {
        id: 'p3',
        context: 'Manager Voss has no entry on the Merger File’s access list.',
        request: 'Manager Voss opens the Merger File directly.',
        answer: 'deny',
        explanation:
          'The direct route is closed. The leak only works by borrowing the CFO’s rights through the Trojan horse (slides 24–25).',
      },
    ],
    takeaways: [
      'Under discretionary control a Trojan horse inherits the rights of whoever runs it and can copy data anywhere that person may write (slides 24–25).',
      'Every fix here also blocks real work. Discretionary control decides who acts, not where information flows. Mandatory labels address that next (slide 26).',
    ],
  },
  {
    id: 'read-down-write-up',
    act: 2,
    model: 'blp',
    title: 'Read Down, Write Up',
    slides: 'CS440 07-access-control, slides 26–30',
    brief:
      'The tower now runs Bell–LaPadula. Agents hold fixed clearances; you label the files. Information may only flow upward: agents read down and write up. The Ops Plan is for the Director’s eyes only. Place each file on the right floor.',
    agents: [
      { id: 'director', name: 'Director Hale', title: 'Director', label: label('top-secret') },
      { id: 'analyst', name: 'Analyst Okafor', title: 'Analyst', label: label('secret') },
      {
        id: 'officer',
        name: 'Officer Brandt',
        title: 'Duty officer',
        label: label('confidential'),
      },
      { id: 'guard', name: 'Guard Pike', title: 'Lobby guard', label: label('unclassified') },
    ],
    files: [
      { id: 'ops', name: 'Ops Plan' },
      { id: 'report', name: 'Field Report' },
      { id: 'threat', name: 'Threat Summary' },
      { id: 'notice', name: 'Lobby Notice' },
    ],
    categories: [],
    startPolicy: {
      objectLabels: {
        ops: label('unclassified'),
        report: label('unclassified'),
        threat: label('unclassified'),
        notice: label('unclassified'),
      },
    },
    day: [
      work('w1', 'Director Hale reads the Ops Plan.', 'director', 'read', 'ops'),
      work('w2', 'Analyst Okafor writes the Field Report.', 'analyst', 'write', 'report'),
      attack('a1', 'Guard Pike lingers by the Ops Plan.', step('guard', 'read', 'ops')),
      work('w3', 'Director Hale reads the Field Report.', 'director', 'read', 'report'),
      work('w4', 'Officer Brandt writes the Threat Summary.', 'officer', 'write', 'threat'),
      attack(
        'a2',
        'The Ops Plan is for the Director alone, but Analyst Okafor goes looking for it.',
        step('analyst', 'read', 'ops'),
      ),
      work('w5', 'Analyst Okafor reads the Threat Summary.', 'analyst', 'read', 'threat'),
      attack('a3', 'Officer Brandt opens the Field Report.', step('officer', 'read', 'report')),
      work('w6', 'Guard Pike reads the Lobby Notice.', 'guard', 'read', 'notice'),
      attack('a4', 'Guard Pike reads the Threat Summary.', step('guard', 'read', 'threat')),
    ],
    predictions: [
      {
        id: 'p1',
        context: 'Analyst Okafor holds Secret clearance.',
        request: 'Analyst Okafor reads a Confidential file.',
        answer: 'allow',
        explanation:
          'Simple-security property: reading down is allowed when the agent’s label dominates the file’s (slide 29).',
      },
      {
        id: 'p2',
        context: 'Analyst Okafor holds Secret clearance.',
        request: 'Analyst Okafor writes into a Confidential file.',
        answer: 'deny',
        explanation:
          'Star property: writing down could carry Secret data into a lower file, so it is blocked (slide 29).',
      },
      {
        id: 'p3',
        context: 'Guard Pike holds Unclassified clearance.',
        request: 'Guard Pike writes into a Top Secret file.',
        answer: 'allow',
        explanation:
          'Writing up is allowed: information moves to a higher label, never a lower one (slide 29).',
      },
    ],
    takeaways: [
      'Bell–LaPadula allows reading down (simple-security property) and writing up (star property), so information only flows upward (slide 29).',
      'Labels are set by the administrator, not by file owners, so nobody can quietly downgrade data (slide 26).',
    ],
  },
  {
    id: 'compartments',
    act: 2,
    model: 'blp',
    title: 'Compartments',
    slides: 'CS440 07-access-control, slides 27–32',
    brief:
      'Clearance alone is not enough: each desk only sees its own compartments. Labels now carry a level and a set of categories. And the Liaison has sent the Director a slide template.',
    agents: [
      {
        id: 'director',
        name: 'Director Hale',
        title: 'Director',
        label: label('top-secret', ['defense', 'cyber']),
      },
      {
        id: 'analyst',
        name: 'Analyst Okafor',
        title: 'Cyber desk',
        label: label('secret', ['cyber']),
      },
      {
        id: 'liaison',
        name: 'Liaison Voss',
        title: 'Defense liaison',
        label: label('secret', ['defense']),
      },
      { id: 'clerk', name: 'Clerk Ashby', title: 'Records clerk', label: label('confidential') },
    ],
    files: [
      { id: 'cyber', name: 'Cyber Brief' },
      { id: 'defense', name: 'Defense Plan' },
      { id: 'joint', name: 'Joint Report' },
      { id: 'notice', name: 'Lobby Notice' },
    ],
    categories: [
      { id: 'defense', name: 'Defense' },
      { id: 'cyber', name: 'Cyber' },
      { id: 'nuclear', name: 'Nuclear' },
    ],
    startPolicy: {
      objectLabels: {
        cyber: label('unclassified'),
        defense: label('unclassified'),
        joint: label('unclassified'),
        notice: label('unclassified'),
      },
    },
    day: [
      work('w1', 'Analyst Okafor reads the Cyber Brief.', 'analyst', 'read', 'cyber'),
      work('w2', 'Liaison Voss reads the Defense Plan.', 'liaison', 'read', 'defense'),
      attack(
        'a1',
        'Analyst Okafor, from the Cyber desk, tries the Defense Plan.',
        step('analyst', 'read', 'defense'),
      ),
      work('w3', 'Director Hale reads the Joint Report.', 'director', 'read', 'joint'),
      work('w4', 'Director Hale updates the Joint Report.', 'director', 'write', 'joint'),
      attack(
        'a2',
        'Director Hale opens Liaison Voss’s “slide template”. It copies the Joint Report into the Defense Plan, and Voss reads it.',
        step('director', 'read', 'joint'),
        step('director', 'write', 'defense'),
        step('liaison', 'read', 'defense'),
      ),
      attack('a3', 'Liaison Voss opens the Cyber Brief.', step('liaison', 'read', 'cyber')),
      work('w5', 'Clerk Ashby reads the Lobby Notice.', 'clerk', 'read', 'notice'),
      tamper(
        'i1',
        'Clerk Ashby pastes unverified rumours into the Joint Report.',
        step('clerk', 'write', 'joint'),
      ),
      work('w6', 'Director Hale skims the Cyber Brief.', 'director', 'read', 'cyber'),
    ],
    predictions: [
      {
        id: 'p1',
        context: 'Analyst Okafor holds Secret {Cyber}.',
        request: 'Analyst Okafor reads a file labelled Secret {Defense}.',
        answer: 'deny',
        explanation:
          'Neither label dominates the other: {Cyber} and {Defense} are incomparable, so the read fails even at the same level (slide 27).',
      },
      {
        id: 'p2',
        context: 'Director Hale holds Top Secret {Defense, Cyber}.',
        request: 'Director Hale reads a file labelled Secret {Defense}.',
        answer: 'allow',
        explanation:
          'Top Secret is at least Secret and {Defense} is inside {Defense, Cyber}, so the Director’s label dominates (slide 27).',
      },
      {
        id: 'p3',
        context: 'Clerk Ashby holds Confidential {}.',
        request: 'Clerk Ashby writes into a Top Secret {Defense, Cyber} file.',
        answer: 'allow',
        explanation:
          'Writing up is allowed when the file’s label dominates the clerk’s (slide 29): Top Secret {Defense, Cyber} covers Confidential {}, so the write succeeds even though the clerk can never read it back. Bell–LaPadula protects secrecy, not integrity (slide 28).',
      },
    ],
    takeaways: [
      'Labels with categories form a partial order. Some pairs are incomparable, and access needs dominance on both the level and the category set (slide 27).',
      'The star property stopped the Trojan horse that beat discretionary control (slide 31). But Bell–LaPadula ignores integrity, so writing up let the clerk tamper with the Joint Report (slide 28).',
    ],
  },
  {
    id: 'roles-not-people',
    act: 3,
    model: 'rbac',
    title: 'Roles, Not People',
    slides: 'CS440 07-access-control, slides 34–37',
    brief:
      'The tower’s records division runs on roles: permissions go to roles, and agents receive role badges. Design the roles for today’s jobs and keep the duties separate.',
    agents: [
      { id: 'ada', name: 'Agent Quinn', title: 'Operator' },
      { id: 'ben', name: 'Agent Achebe', title: 'Operator' },
      { id: 'cy', name: 'Officer Moreau', title: 'Security officer' },
      { id: 'dee', name: 'Agent Tan', title: 'Auditor' },
    ],
    files: ROLE_FILES,
    permissions: ROLE_PERMISSIONS,
    constraints: DUTIES,
    startPolicy: { roles: [], assignments: [] },
    day: [
      work('w1', 'Agent Quinn reads the Operations Files.', 'ada', 'read', 'ops'),
      work('w2', 'Agent Quinn updates the Operations Files.', 'ada', 'write', 'ops'),
      work('w3', 'Agent Achebe reads the Operations Files.', 'ben', 'read', 'ops'),
      attack('a1', 'Agent Achebe wanders into Payroll.', step('ben', 'read', 'payroll')),
      work('w4', 'Agent Achebe updates the Operations Files.', 'ben', 'write', 'ops'),
      work('w5', 'Officer Moreau checks the Access Register.', 'cy', 'read', 'register'),
      work('w6', 'Officer Moreau records a new grant.', 'cy', 'write', 'register'),
      attack(
        'a2',
        'Officer Moreau, who manages access, tries to read the Operations Files directly.',
        step('cy', 'read', 'ops'),
      ),
      work('w7', 'Agent Tan reviews the Audit Trail.', 'dee', 'read', 'audit'),
      attack('a3', 'Agent Quinn tries to read the Audit Trail.', step('ada', 'read', 'audit')),
    ],
    predictions: [
      {
        id: 'p1',
        context: 'The Operator role gains the “Read Payroll” permission.',
        request: 'Agent Quinn, an Operator, reads Payroll.',
        answer: 'allow',
        explanation:
          'Permissions attach to roles, so every Operator gains it at once (slides 35–36).',
      },
      {
        id: 'p2',
        context: 'Agent Tan holds the Auditor role but has not activated it in this session.',
        request: 'Agent Tan reads the Audit Trail in this session.',
        answer: 'deny',
        explanation:
          'A session activates a subset of a user’s roles; only active roles grant permissions (slide 35).',
      },
      {
        id: 'p3',
        context: 'The Security Officer role can change permissions but has no access to the data.',
        request: 'Officer Moreau reads the Operations Files.',
        answer: 'deny',
        explanation:
          'The security officer manages permissions but holds no data access (slide 36).',
      },
    ],
    takeaways: [
      'Role-based control assigns users to roles and permissions to roles, which maps naturally onto how an organisation works (slides 34–36).',
      'Separation of duties keeps doing, granting and auditing in different hands. The deck lists the three roles on slide 36; the rule itself is a team design built on them.',
    ],
  },
  {
    id: 'reshuffle',
    act: 3,
    model: 'rbac',
    title: 'Reshuffle',
    slides: 'CS440 07-access-control, slides 35–38',
    brief:
      'Overnight reshuffle: Agent Achebe moves to Audit, Agent Tan becomes Security Officer, Officer Moreau has left the agency and Agent Ward joins as an Operator. Update the badges before the doors open.',
    agents: [
      { id: 'ada', name: 'Agent Quinn', title: 'Operator' },
      { id: 'ben', name: 'Agent Achebe', title: 'Auditor (moved from Operations)' },
      { id: 'cy', name: 'Officer Moreau', title: 'Left the agency' },
      { id: 'dee', name: 'Agent Tan', title: 'Security officer (moved from Audit)' },
      { id: 'eli', name: 'Agent Ward', title: 'Operator (new hire)' },
    ],
    files: ROLE_FILES,
    permissions: ROLE_PERMISSIONS,
    constraints: DUTIES,
    compareEdits: true,
    startPolicy: {
      roles: [
        { id: 'operator', name: 'Operator', permissions: ['read-ops', 'write-ops'] },
        {
          id: 'security',
          name: 'Security Officer',
          permissions: ['read-register', 'write-register'],
        },
        { id: 'auditor', name: 'Auditor', permissions: ['read-audit'] },
      ],
      assignments: [
        { agent: 'ada', roleIds: ['operator'] },
        { agent: 'ben', roleIds: ['operator'] },
        { agent: 'cy', roleIds: ['security'] },
        { agent: 'dee', roleIds: ['auditor'] },
      ],
    },
    day: [
      work('w1', 'Agent Quinn reads the Operations Files.', 'ada', 'read', 'ops'),
      work('w2', 'Agent Ward reads the Operations Files.', 'eli', 'read', 'ops'),
      attack(
        'a1',
        'Agent Achebe, now in Audit, still opens the Operations Files.',
        step('ben', 'read', 'ops'),
      ),
      work('w3', 'Agent Ward updates the Operations Files.', 'eli', 'write', 'ops'),
      work('w4', 'Agent Achebe reviews the Audit Trail.', 'ben', 'read', 'audit'),
      attack(
        'a2',
        'Former officer Moreau tries the Access Register from home.',
        step('cy', 'read', 'register'),
      ),
      work('w5', 'Agent Tan checks the Access Register.', 'dee', 'read', 'register'),
      work('w6', 'Agent Tan records a new grant.', 'dee', 'write', 'register'),
      attack('a3', 'Agent Tan opens the Audit Trail out of habit.', step('dee', 'read', 'audit')),
      work('w7', 'Agent Quinn updates the Operations Files.', 'ada', 'write', 'ops'),
    ],
    predictions: [
      {
        id: 'p1',
        context: 'Agent Achebe’s Operator badge is swapped for Auditor.',
        request: 'Agent Achebe writes the Operations Files.',
        answer: 'deny',
        explanation:
          'Removing the Operator role removes all of its permissions in one edit (slide 38).',
      },
      {
        id: 'p2',
        context: 'Agent Ward joins and receives the existing Operator badge.',
        request: 'Agent Ward writes the Operations Files.',
        answer: 'allow',
        explanation:
          'Assigning an existing role grants its whole, already reviewed permission set (slide 38).',
      },
      {
        id: 'p3',
        context: 'Officer Moreau’s only badge has been removed.',
        request: 'Officer Moreau edits the Access Register.',
        answer: 'deny',
        explanation:
          'Removing the user–role assignment revokes every permission it carried (slide 38).',
      },
    ],
    takeaways: [
      'User–role assignments change often while role permissions stay stable, so staff changes become a few badge edits (slide 38).',
      'Compare your badge edits with the matrix cells that changed underneath: that gap is why organisations manage roles, not individual rights.',
    ],
  },
]

export function findLevel(levelId) {
  return LEVELS.find((level) => level.id === levelId)
}

export function summarizeLevel(level) {
  return {
    id: level.id,
    act: level.act,
    actTitle: ACTS[level.act],
    model: level.model,
    title: level.title,
  }
}

function uniqueWorkSteps(level) {
  const seen = new Set()
  const tasks = []
  for (const event of level.day) {
    if (event.kind !== 'work') continue
    for (const { agent, action, file } of event.steps) {
      const key = `${agent}:${action}:${file}`
      if (seen.has(key)) continue
      seen.add(key)
      tasks.push({ agent, action, file })
    }
  }
  return tasks
}

// what the browser sees before submitting: no day script, answers or explanations
export function publicLevel(level) {
  return structuredClone({
    ...summarizeLevel(level),
    brief: level.brief,
    slides: level.slides,
    agents: level.agents,
    files: level.files,
    clearances: level.model === 'blp' ? CLEARANCES : [],
    categories: level.categories ?? [],
    permissions: level.permissions ?? [],
    constraints: level.constraints ?? [],
    startPolicy: level.startPolicy,
    tasks: uniqueWorkSteps(level),
    predictions: level.predictions.map(({ id, context, request }) => ({ id, context, request })),
  })
}
