// library: parse5 (mit), bounded html parsing; credited in credits.md
import { parseFragment } from 'parse5'

const discarded = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'template',
  'svg',
  'math',
])

export function safeUrl(value, base) {
  if (
    typeof value !== 'string' ||
    value.length > 4096 ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    return null
  try {
    const url = new URL(value, base)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    return url.href
  } catch {
    return null
  }
}

export function inlineText(nodes) {
  return nodes.map((node) => (node.type === 'break' ? ' ' : node.text)).join('')
}

export function parseInline(value = '') {
  if (typeof value !== 'string' || value.length > 16000) throw new Error('Invalid text fragment')
  const root = parseFragment(value)
  let count = 0
  function visit(node, depth = 0) {
    if (++count > 512 || depth > 24) throw new Error('Text fragment is too complex')
    if (node.nodeName === '#text') return [{ type: 'text', text: node.value }]
    if (discarded.has(node.tagName)) return []
    if (node.tagName === 'br') return [{ type: 'break' }]
    const children = (node.childNodes || []).flatMap((child) => visit(child, depth + 1))
    if (node.tagName === 'a') {
      const href = safeUrl(
        node.attrs.find((attr) => attr.name === 'href')?.value,
        'https://www.theguardian.com',
      )
      return href ? [{ type: 'link', text: inlineText(children), href }] : children
    }
    return children
  }
  return visit(root)
}
