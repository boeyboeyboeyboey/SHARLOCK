// each card is plain text; highlight names a phrase inside it that the intro renders in gold
export const LORE_CARDS = [
  { text: 'London, 1880.' },
  {
    text: 'The telegraph has wired the British Empire together. Messages that once took weeks now cross the city in seconds.',
  },
  {
    text: 'And where messages travel, thieves follow. Forged telegrams, stolen ciphers, clerks tricked into opening the wrong door.',
  },
  {
    text: 'One detective has been called to the Thames Wharf to stop them: Sharlock Holmes.',
    highlight: 'Sharlock Holmes',
  },
  { text: 'Every case you solve here sharpens your instincts. The city is counting on you.' },
]

export const FADE_MS = 400

// reading time for one card, in milliseconds
export function holdFor(text) {
  const words = String(text).trim().split(/\s+/).filter(Boolean).length
  return Math.max(1500, 320 * words)
}
