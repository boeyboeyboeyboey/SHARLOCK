// known good answers for each level, shared by the unit, http and browser tests
const label = (level, categories = []) => ({ level, categories })

const STANDARD_ROLES = [
  { id: 'operator', name: 'Operator', permissions: ['read-ops', 'write-ops'] },
  { id: 'security', name: 'Security Officer', permissions: ['read-register', 'write-register'] },
  { id: 'auditor', name: 'Auditor', permissions: ['read-audit'] },
]

export const SOLUTIONS = {
  'the-matrix': {
    score: 100,
    policy: {
      grants: [
        { subject: 'director', object: 'ops', rights: ['r', 'w'] },
        { subject: 'director', object: 'report', rights: ['r'] },
        { subject: 'analyst', object: 'ops', rights: ['r'] },
        { subject: 'analyst', object: 'report', rights: ['w'] },
        { subject: 'auditor', object: 'payroll', rights: ['r'] },
        { subject: 'contractor', object: 'menu', rights: ['r'] },
      ],
    },
    predictions: { p1: 'deny', p2: 'deny', p3: 'allow' },
  },
  // every fix blocks three tasks; clear-4 scores the work row out of seven, clear-3 scored this 91
  'the-gift': {
    score: 100,
    policy: {
      grants: [
        { subject: 'cfo', object: 'merger', rights: ['r', 'w'] },
        { subject: 'cfo', object: 'board', rights: ['w'] },
      ],
    },
    predictions: { p1: 'allow', p2: 'allow', p3: 'deny' },
  },
  'read-down-write-up': {
    score: 100,
    policy: {
      objectLabels: {
        ops: label('top-secret'),
        report: label('secret'),
        threat: label('confidential'),
        notice: label('unclassified'),
      },
    },
    predictions: { p1: 'allow', p2: 'deny', p3: 'allow' },
  },
  compartments: {
    score: 100,
    policy: {
      objectLabels: {
        cyber: label('secret', ['cyber']),
        defense: label('secret', ['defense']),
        joint: label('top-secret', ['defense', 'cyber']),
        notice: label('unclassified'),
      },
    },
    predictions: { p1: 'deny', p2: 'allow', p3: 'allow' },
  },
  'roles-not-people': {
    score: 100,
    policy: {
      roles: STANDARD_ROLES,
      assignments: [
        { agent: 'ada', roleIds: ['operator'] },
        { agent: 'ben', roleIds: ['operator'] },
        { agent: 'cy', roleIds: ['security'] },
        { agent: 'dee', roleIds: ['auditor'] },
      ],
    },
    predictions: { p1: 'allow', p2: 'deny', p3: 'deny' },
  },
  reshuffle: {
    score: 100,
    policy: {
      roles: STANDARD_ROLES,
      assignments: [
        { agent: 'ada', roleIds: ['operator'] },
        { agent: 'eli', roleIds: ['operator'] },
        { agent: 'ben', roleIds: ['auditor'] },
        { agent: 'dee', roleIds: ['security'] },
      ],
    },
    predictions: { p1: 'deny', p2: 'allow', p3: 'deny' },
  },
}

export function predictionList(predictions) {
  return Object.entries(predictions).map(([id, verdict]) => ({ id, verdict }))
}
