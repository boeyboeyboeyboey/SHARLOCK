// synthetic training data only: fictional names, codes and tables, never real credentials
export const USER_TABLES = [
  { table: 'officers', userCol: 'username', passCol: 'passcode' },
  { table: 'wardens', userCol: 'login', passCol: 'keycode' },
  { table: 'inspectors', userCol: 'handle', passCol: 'secret' },
  { table: 'pilots', userCol: 'callsign', passCol: 'pin' },
]
export const TARGET_NAMES = ['harbourmaster', 'quartermaster', 'wharfinger', 'purser']
export const OTHER_NAMES = [
  'clerk',
  'bosun',
  'tallyman',
  'stevedore',
  'dockhand',
  'signalman',
  'navigator',
  'rigger',
]
export const CODE_WORDS = [
  'Tide',
  'Anchor',
  'Beacon',
  'Cargo',
  'Mooring',
  'Keel',
  'Buoy',
  'Davit',
  'Fathom',
  'Lantern',
  'Rudder',
  'Wharf',
]
export const BADGE_SETS = [
  { table: 'badges', col: 'badge' },
  { table: 'permits', col: 'badge_no' },
  { table: 'registry', col: 'pass_id' },
]
export const MANIFEST_TABLES = ['manifests', 'shipments', 'cargo_log', 'arrivals']
export const SEARCH_COLUMNS = ['vessel', 'cargo', 'port']
export const EXTRA_COLUMNS = ['berth', 'flag', 'tonnage', 'eta']
export const COLUMN_VALUES = {
  vessel: ['Sea Heron', 'Tidewalker', 'Northern Gull', 'Salt Maiden', 'Grey Pelican'],
  cargo: ['grain', 'timber', 'machine parts', 'tea', 'copper wire'],
  port: ['Lisbon', 'Rotterdam', 'Busan', 'Valparaiso', 'Durban'],
  berth: ['B4', 'C2', 'A7', 'D1', 'B9'],
  flag: ['Norway', 'Panama', 'Malta', 'Chile', 'Japan'],
  tonnage: ['4200', '8800', '1250', '6100', '3300'],
  eta: ['06:10', '09:45', '13:20', '17:05', '21:30'],
}
export const DECOY_TABLES = [
  {
    table: 'berths',
    columns: ['berth_no', 'tug'],
    values: [
      ['B4', 'Otter'],
      ['C2', 'Finch'],
    ],
  },
  {
    table: 'tugs',
    columns: ['tug', 'crew'],
    values: [
      ['Otter', '4'],
      ['Finch', '3'],
    ],
  },
]
export const CRATE_SETS = [
  { table: 'crates', col: 'crate' },
  { table: 'pallets', col: 'pallet_no' },
  { table: 'containers', col: 'box_ref' },
]
