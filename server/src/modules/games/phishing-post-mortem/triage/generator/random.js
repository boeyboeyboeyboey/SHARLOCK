import { createHash } from 'node:crypto'

// round content must not reveal a small state, so the stream is sha256 over a 128-bit seed
// rather than a 32-bit generator that could be searched exhaustively from one visible email
export function createRandom(seed, roundIndex) {
  const roundKey = createHash('sha256').update(`${seed}:${roundIndex}`).digest()
  let counter = 0
  let words = []

  function next() {
    if (words.length === 0) {
      const block = createHash('sha256')
        .update(roundKey)
        .update(Buffer.from(Uint32Array.of(counter).buffer))
        .digest()
      counter += 1
      for (let offset = 0; offset < 32; offset += 4) words.push(block.readUInt32BE(offset))
      words.reverse()
    }
    return words.pop() / 4294967296
  }

  function int(min, max) {
    return min + Math.floor(next() * (max - min + 1))
  }

  function pick(items) {
    return items[Math.floor(next() * items.length)]
  }

  function shuffle(items) {
    const ordered = [...items]
    for (let index = ordered.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(next() * (index + 1))
      ;[ordered[index], ordered[swap]] = [ordered[swap], ordered[index]]
    }
    return ordered
  }

  return { next, int, pick, shuffle }
}
