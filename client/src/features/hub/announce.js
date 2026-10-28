// screen reader text for the hub, one message per state transition
export function announceChange(prev, next, nameOf) {
  if (!prev || !next) return ''
  const name = (id) => nameOf(id) || id
  if (next.mode === 'entering' && prev.mode !== 'entering' && next.selected) {
    return `Entering ${name(next.selected)}`
  }
  if (next.mode !== 'explore' || prev.mode !== 'explore') return ''
  if (next.selected) {
    const arrived = next.nearDoor === next.selected
    if (next.selected !== prev.selected || (arrived && prev.nearDoor !== next.selected)) {
      return arrived
        ? `Arrived at ${name(next.selected)}. Press Enter to go in`
        : `${name(next.selected)} selected`
    }
    return ''
  }
  return prev.selected ? 'Selection cleared' : ''
}
