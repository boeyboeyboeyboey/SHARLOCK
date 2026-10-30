// frontend display metadata is separate from server permissions
export const TOWN_SIZE = { width: 1120, height: 800 }
export const BUILDING_TYPES = [
  'cottage',
  'library',
  'office',
  'hut',
  'shed',
  'newsstand',
  'warehouse',
]

export function defineGameCatalog(entries) {
  const ids = new Set()
  for (const game of entries) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(game.id) || ids.has(game.id))
      throw new Error('Game IDs must be stable and unique.')
    ids.add(game.id)
    if (!game.name?.trim() || !game.description?.trim())
      throw new Error('Every game needs a name and description.')
    if (!Number.isInteger(game.difficulty) || game.difficulty < 1 || game.difficulty > 3)
      throw new Error('Difficulty must be an integer from 1 to 3.')
    if (
      !Array.isArray(game.backgroundKnowledge) ||
      !game.backgroundKnowledge.length ||
      game.backgroundKnowledge.some((topic) => typeof topic !== 'string' || !topic.trim())
    )
      throw new Error('List the background knowledge for every game.')
    if (
      game.shortName !== undefined &&
      (typeof game.shortName !== 'string' || !game.shortName.trim() || game.shortName.length > 18)
    )
      throw new Error('A short name is one line of at most 18 characters.')
    if (game.accent !== undefined && !/^#[0-9a-f]{6}$/i.test(game.accent))
      throw new Error('An accent is a six digit hex colour.')
    if (!game.route?.startsWith('/games/') || game.route.includes('://'))
      throw new Error('Games need a local /games/ route.')
    if (game.needs3d !== undefined && typeof game.needs3d !== 'boolean')
      throw new Error('Needs 3D is true or false.')
    if (game.activation !== undefined && game.activation !== 'direct')
      throw new Error('Choose a supported building activation.')
    if (!BUILDING_TYPES.includes(game.building?.type))
      throw new Error('Choose a supported pixel building type.')
    const { x, y } = game.building
    if (
      ![x, y].every(Number.isInteger) ||
      x < 0 ||
      y < 0 ||
      x > TOWN_SIZE.width - 192 ||
      y > TOWN_SIZE.height - 200
    )
      throw new Error('Place the entire building inside the town.')
  }
  return entries
}

export const gameCatalog = defineGameCatalog([
  {
    id: 'cli-cyber-defender',
    shortName: 'CLI Cyber Defender',
    accent: '#3ddc84',
    name: 'CLI Cyber Defender',
    description: 'Contain fictional cyber incidents with commands in a simulated terminal.',
    difficulty: 2,
    backgroundKnowledge: ['IP addresses', 'Firewall rules', 'Incident containment'],
    route: '/games/cli-cyber-defender',
    isPreview: false,
    duration: '2 min + debrief',
    icon: 'shield',
    building: { type: 'cottage', x: 234, y: 200 },
  },
  {
    id: 'phishing-post-mortem',
    shortName: 'Phishing',
    accent: '#ff6b6b',
    name: 'The Phishing Post-Mortem',
    description: 'Trace a fictional email incident and uncover the message that started it.',
    difficulty: 2,
    backgroundKnowledge: ['Sender spoofing', 'Deceptive links', 'Incident timelines'],
    route: '/games/phishing-post-mortem',
    isPreview: false,
    duration: '8 min',
    icon: 'news',
    building: { type: 'library', x: 664, y: 380 },
  },
  {
    id: 'sql-injection-arcade',
    shortName: 'SQL Injection',
    accent: '#ffb84d',
    name: 'SQL Injection Arcade',
    description: 'Solve a fictional login puzzle using parameterized queries.',
    difficulty: 2,
    backgroundKnowledge: ['SQL strings', 'Boolean conditions', 'Parameterized queries'],
    route: '/games/sql-injection-arcade',
    isPreview: false,
    duration: '6 min',
    icon: 'lock',
    building: { type: 'hut', x: 694, y: 180 },
  },
  {
    id: 'threat-briefing',
    shortName: 'Daily briefing',
    accent: '#d9d2bd',
    name: 'The daily briefing',
    description: 'Read The Sharlock Times for recent cybersecurity and technology stories.',
    difficulty: 1,
    backgroundKnowledge: ['Common cyber threats', 'Risk awareness'],
    route: '/games/threat-briefing',
    isPreview: false,
    duration: '5 min',
    icon: 'news',
    activation: 'direct',
    building: { type: 'newsstand', x: 424, y: 0 },
  },
  {
    id: 'social-engineering-simulator',
    shortName: 'Social Engineer',
    accent: '#c792ea',
    name: 'LLM Social Engineering Simulator',
    description:
      'Spot a fictional colleague’s pressure tactics and protect a synthetic reset code.',
    difficulty: 2,
    backgroundKnowledge: [
      'Impersonation',
      'Reset-code confidentiality',
      'Independent verification',
    ],
    route: '/games/social-engineering-simulator',
    isPreview: false,
    duration: '5 min',
    icon: 'people',
    building: { type: 'office', x: 234, y: 400 },
  },
  {
    id: 'clearance-tower',
    shortName: 'Clearance Tower',
    accent: '#5aa9ff',
    name: 'Clearance Tower',
    description:
      'Design who may see what in an intelligence tower, then watch a day test your policy.',
    difficulty: 3,
    backgroundKnowledge: [
      'Authentication vs authorization',
      'Access matrices and ACLs',
      'Security labels and roles',
    ],
    route: '/games/clearance-tower',
    isPreview: false,
    duration: '10 min',
    icon: 'lock',
    building: { type: 'shed', x: 879, y: 565 },
  },
  {
    id: 'botnet-tag',
    shortName: 'Botnet Tag',
    accent: '#7bd88f',
    name: 'Botnet Tag',
    description:
      'Play infection tag with your class: spread the botnet, or patch stations to stay clean.',
    difficulty: 2,
    backgroundKnowledge: ['Malware spread', 'Patching', 'Network services and ports'],
    route: '/games/botnet-tag',
    isPreview: false,
    needs3d: true,
    duration: '3 min round',
    icon: 'people',
    building: { type: 'warehouse', x: 240, y: 600 },
  },
])
