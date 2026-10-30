const BUG =
  '<svg viewBox="0 0 24 24" aria-hidden="true" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><ellipse cx="12" cy="14" rx="4" ry="5" fill="currentColor"/><circle cx="12" cy="7" r="2.4" fill="currentColor"/><path d="M8 11 4 9M8 15l-4 1M16 11l4-2M16 15l4 1M10 5 8 3M14 5l2-2"/></svg>'

// dom name labels laid over the canvas; positions are written straight to style so a frame never touches vue
export function createLabelLayer(container) {
  const layer = document.createElement('div')
  layer.className = 'tag-labels'
  layer.setAttribute('aria-hidden', 'true')
  layer.dataset.testid = 'tag-labels'
  container.append(layer)
  const nodes = new Map()

  function make(item) {
    const el = document.createElement('div')
    el.className = 'tag-label'
    const text = document.createElement('span')
    text.className = 'tag-label-text'
    el.append(text)
    layer.append(el)
    const node = { el, text, badge: null, chip: null, last: '' }
    nodes.set(item.key, node)
    return node
  }

  return {
    // items: { key, text, x, y, scale, width, kind, infected, isBot, isMe, cooling }
    update(items) {
      const live = new Set()
      for (const item of items) {
        live.add(item.key)
        const node = nodes.get(item.key) ?? make(item)
        if (node.text.textContent !== item.text) node.text.textContent = item.text
        const cls = [
          'tag-label',
          item.kind === 'station' ? 'is-station' : 'is-player',
          item.infected && 'is-infected',
          item.isMe && 'is-me',
          item.cooling && 'is-cooling',
        ]
          .filter(Boolean)
          .join(' ')
        if (node.el.className !== cls) node.el.className = cls
        if (item.infected && !node.badge) {
          node.badge = document.createElement('span')
          node.badge.className = 'tag-label-bug'
          node.badge.innerHTML = BUG
          node.el.prepend(node.badge)
        } else if (!item.infected && node.badge) {
          node.badge.remove()
          node.badge = null
        }
        if (item.isBot && !node.chip) {
          node.chip = document.createElement('span')
          node.chip.className = 'tag-label-chip'
          node.chip.textContent = 'bot'
          node.el.append(node.chip)
        }
        const transform = `translate(${Math.round(item.x)}px, ${Math.round(item.y)}px) translate(-50%, -100%) scale(${item.scale.toFixed(2)})`
        if (node.last !== transform) {
          node.el.style.transform = transform
          node.last = transform
        }
        node.el.hidden = false
      }
      for (const [key, node] of nodes) {
        if (live.has(key)) continue
        node.el.remove()
        nodes.delete(key)
      }
    },
    count: () => nodes.size,
    dispose() {
      nodes.clear()
      layer.remove()
    },
  }
}
