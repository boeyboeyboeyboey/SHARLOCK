// every organisation, person and domain here is fictional; hosts always end in .example

function entity(name, short, slug, extra = {}) {
  return { name, short, slug, domain: `${slug}.example`, ...extra }
}

export const COMPANIES = [
  entity('Aurora Dynamics', 'Aurora', 'aurora-dynamics'),
  entity('Harbourline Logistics', 'Harbourline', 'harbourline-logistics'),
  entity('Kestrel Wealth', 'Kestrel', 'kestrel-wealth'),
  entity('Meridian Health Partners', 'Meridian', 'meridian-health'),
  entity('Westbrook Engineering', 'Westbrook', 'westbrook-engineering'),
  entity('Tidewater Foods', 'Tidewater', 'tidewater-foods'),
  entity('Summitlane Media', 'Summitlane', 'summitlane-media'),
  entity('Copperfield Insurance', 'Copperfield', 'copperfield-insurance'),
]

export const VENDORS = [
  entity('Northvale Supplies', 'Northvale', 'northvale-supplies', { product: 'office supplies' }),
  entity('Brightmill Print', 'Brightmill', 'brightmill-print', { product: 'printing' }),
  entity('Wavecrest Couriers', 'Wavecrest', 'wavecrest-couriers', { product: 'courier services' }),
  entity('Palmgrove Catering', 'Palmgrove', 'palmgrove-catering', { product: 'catering' }),
  entity('Ironwood Furnishings', 'Ironwood', 'ironwood-furnishings', { product: 'furniture' }),
  entity('Lakeshore Cleaning', 'Lakeshore', 'lakeshore-cleaning', { product: 'cleaning' }),
]

export const FIRST_NAMES = [
  'Kenneth',
  'Priya',
  'Wei Ling',
  'Farhan',
  'Siti',
  'Marcus',
  'Hui Min',
  'Arjun',
  'Nurul',
  'Daniel',
  'Mei',
  'Rahul',
  'Grace',
  'Jun Jie',
  'Aisha',
  'Ethan',
  'Chloe',
  'Haziq',
  'Divya',
  'Ryan',
]

export const LAST_NAMES = [
  'Lim',
  'Nair',
  'Tan',
  'Rahman',
  'Ong',
  'Menon',
  'Lee',
  'Goh',
  'Ismail',
  'Chua',
  'Pillai',
  'Ng',
  'Wong',
  'Koh',
  'Yusof',
  'Sim',
]

// hosts that belong to nobody in the scenario
export const UNRELATED_HOSTS = [
  'account-verify-center',
  'secure-docs-portal',
  'mail-support-desk',
  'login-check-online',
  'prize-claims-hub',
  'file-share-gateway',
]

export const FREE_MAIL_HOSTS = ['quickpost.example', 'mailnest.example', 'inboxhub.example']

export const FRONT_HOSTS = ['cloud-forms', 'secure-notify', 'docs-relay', 'mail-track']

export const TRICK_WORDS = ['secure', 'portal', 'login', 'support', 'verify', 'online']

export const FILLER_LINES = [
  'Thanks for your help with this.',
  'Let me know if you have any questions.',
  'This message was sent to everyone on the distribution list.',
  'I will be at my desk if you need to talk it through.',
  'Reference details are included for your records.',
  'Please keep this message for your files.',
  'Thank you for your continued support.',
  'Our office hours are Monday to Friday, 9am to 6pm.',
]

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
