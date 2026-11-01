// saved topics are slugs; these are the ones plain sentence case would get wrong
const SPECIAL_LABELS = Object.freeze({
  'bell-lapadula': 'Bell-LaPadula',
  'out-of-band-verification': 'Out-of-band verification',
  'role-based-access-control': 'Role-based access control',
  'second-order-injection': 'Second-order injection',
  'sql-injection': 'SQL injection',
})

export function topicLabel(slug) {
  if (SPECIAL_LABELS[slug]) return SPECIAL_LABELS[slug]
  const words = String(slug).replaceAll('-', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
