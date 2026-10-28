import { FRONT_HOSTS, TRICK_WORDS, UNRELATED_HOSTS } from './pools.js'

const SWAPS = [
  { from: 'm', to: 'rn', how: 'the pair r-n in place of the letter m' },
  { from: 'w', to: 'vv', how: 'two v characters in place of the letter w' },
  { from: 'l', to: '1', how: 'the digit 1 in place of the letter l' },
]

// builds a host that reads like the entity's own domain; the tier decides how subtle it is
export function fakeHost(rng, tier, entity) {
  const { slug, name, domain } = entity
  if (tier === 1) {
    const host = `${rng.pick(UNRELATED_HOSTS)}.example`
    return { host, note: `${host} has nothing to do with ${name}, whose real domain is ${domain}` }
  }
  if (tier === 2) {
    const word = rng.pick(TRICK_WORDS)
    const host = `${slug}-${word}.example`
    return {
      host,
      note: `${host} adds "${word}" to the name of ${name}, but only ${domain} belongs to them`,
    }
  }
  const swap = rng.shuffle(SWAPS).find((candidate) => slug.includes(candidate.from))
  if (swap) {
    const host = `${slug.replace(swap.from, swap.to)}.example`
    return { host, note: `${host} imitates ${domain} by using ${swap.how}` }
  }
  const registered = `${rng.pick(FRONT_HOSTS)}.example`
  const host = `${slug}.${registered}`
  return {
    host,
    note: `${host} starts with the name of ${name} but really belongs to ${registered}`,
  }
}
