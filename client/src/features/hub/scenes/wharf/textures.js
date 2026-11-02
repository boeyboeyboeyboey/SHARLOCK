import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js'
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js'
import { rng } from '../shared/random.js'

const rgb = (r, g, b, a = 1) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`

function tile(scene, name, size, paint, { aniso = 8, mips = true } = {}) {
  const texture = new DynamicTexture(
    name,
    { width: size, height: size },
    scene,
    mips,
    Texture.TRILINEAR_SAMPLINGMODE,
  )
  const ctx = texture.getContext()
  paint(ctx, size)
  texture.wrapU = Texture.WRAP_ADDRESSMODE
  texture.wrapV = Texture.WRAP_ADDRESSMODE
  texture.anisotropicFilteringLevel = aniso
  texture.update(true)
  return texture
}

// soft gouache dabs across the whole tile, wrapped so it still tiles
function dabs(ctx, size, rand, count, base, spread, alpha = 0.07, scale = 1) {
  for (let i = 0; i < count; i += 1) {
    const x = rand() * size
    const y = rand() * size
    const w = (6 + rand() * 26) * scale
    const h = (4 + rand() * 14) * scale
    const k = (rand() - 0.5) * spread
    ctx.fillStyle = rgb(base[0] + k, base[1] + k, base[2] + k, alpha)
    for (const ox of [0, -size, size])
      for (const oy of [0, -size, size]) {
        if (x + ox + w < 0 || x + ox > size || y + oy + h < 0 || y + oy > size) continue
        ctx.fillRect(x + ox, y + oy, w, h)
      }
  }
}

// one tile is 2 m: chunky stretcher bond, 4 bricks across and 12 courses
export function brickTexture(scene, name, { bricks, mortar }) {
  return tile(scene, name, 512, (ctx, size) => {
    const rand = rng(name.length * 977 + bricks[0][0])
    ctx.fillStyle = rgb(...mortar)
    ctx.fillRect(0, 0, size, size)
    const rows = 12
    const per = 4
    const rh = size / rows
    const bw = size / per
    for (let r = 0; r < rows; r += 1) {
      for (let c = -1; c < per; c += 1) {
        const x = c * bw + (r % 2 ? bw / 2 : 0)
        const y = r * rh
        const pick = bricks[Math.floor(rand() * bricks.length)]
        const k = 0.88 + rand() * 0.24
        ctx.fillStyle = rgb(pick[0] * k, pick[1] * k, pick[2] * k)
        const gap = 3.2
        ctx.beginPath()
        ctx.roundRect(x + gap, y + gap * 0.8, bw - gap * 2, rh - gap * 1.6, 4)
        ctx.fill()
        // lighter top edge and a dab, so each brick reads as hand painted
        ctx.fillStyle = rgb(255, 235, 210, 0.16)
        ctx.fillRect(x + gap + 2, y + gap * 0.8 + 1, bw - gap * 2 - 4, 3)
        ctx.fillStyle = rgb(pick[0] * k * 0.8, pick[1] * k * 0.8, pick[2] * k * 0.8, 0.35)
        ctx.fillRect(x + gap + rand() * bw * 0.4, y + rh * 0.45, bw * 0.3, rh * 0.28)
      }
    }
    dabs(ctx, size, rand, 140, [150, 120, 110], 70, 0.06, 1.4)
  })
}

// cream ashlar blocks, 1 m courses
export function stoneTexture(scene, name = 'stone') {
  return tile(scene, name, 512, (ctx, size) => {
    const rand = rng(31)
    ctx.fillStyle = rgb(226, 214, 190)
    ctx.fillRect(0, 0, size, size)
    const rows = 4
    const rh = size / rows
    for (let r = 0; r < rows; r += 1) {
      const cols = 2
      const bw = size / cols
      for (let c = -1; c < cols; c += 1) {
        const x = c * bw + (r % 2 ? bw / 2 : 0)
        const k = 0.94 + rand() * 0.1
        ctx.fillStyle = rgb(246 * k, 236 * k, 212 * k)
        ctx.beginPath()
        ctx.roundRect(x + 4, r * rh + 4, bw - 8, rh - 8, 8)
        ctx.fill()
      }
    }
    dabs(ctx, size, rand, 220, [220, 205, 180], 60, 0.07, 1.8)
  })
}

// slate roof: scalloped rows, 2 m tile
export function slateTexture(scene, name = 'slate') {
  return tile(scene, name, 512, (ctx, size) => {
    const rand = rng(77)
    ctx.fillStyle = rgb(70, 66, 92)
    ctx.fillRect(0, 0, size, size)
    const rows = 16
    const rh = size / rows
    const per = 8
    const sw = size / per
    for (let r = 0; r < rows; r += 1) {
      for (let c = -1; c < per; c += 1) {
        const x = c * sw + (r % 2 ? sw / 2 : 0)
        const k = 0.85 + rand() * 0.3
        ctx.fillStyle = rgb(112 * k, 106 * k, 142 * k)
        ctx.beginPath()
        ctx.roundRect(x + 2, r * rh + 1, sw - 4, rh * 1.5, [2, 2, 12, 12])
        ctx.fill()
        ctx.fillStyle = rgb(210, 190, 230, 0.12)
        ctx.fillRect(x + 4, r * rh + 2, sw - 8, 2)
      }
    }
    dabs(ctx, size, rand, 120, [120, 110, 150], 50, 0.06, 1.6)
  })
}

// a copy of a painted texture washed toward a haze colour, for things that sit far back in the air
export function hazeTexture(scene, source, name, color, amount) {
  const size = source.getSize().width
  return tile(scene, name, size, (ctx) => {
    ctx.drawImage(source.getContext().canvas, 0, 0)
    ctx.fillStyle = rgb(color[0], color[1], color[2], amount)
    ctx.fillRect(0, 0, size, size)
  })
}

// large calm setts, 4 m tile: 16 courses of broad stones with gentle colour drift and soft mortar, wrapped so it tiles
export function cobbleTexture(scene, name = 'cobble') {
  return tile(
    scene,
    name,
    1024,
    (ctx, size) => {
      const rand = rng(1840)
      ctx.fillStyle = rgb(112, 100, 104)
      ctx.fillRect(0, 0, size, size)
      const rows = 16
      const rh = size / rows
      for (let r = 0; r < rows; r += 1) {
        // stone widths that sum to exactly one tile, so the row repeats without a seam
        const widths = []
        let sum = 0
        while (sum < size - 90) {
          const w = 96 + rand() * 54
          widths.push(w)
          sum += w
        }
        const fit = size / sum
        let x = rand() * size
        for (const raw of widths) {
          const w = raw * fit
          const k = 0.92 + rand() * 0.14
          const warm = rand()
          ctx.save()
          ctx.shadowColor = 'rgba(70,58,66,0.55)'
          ctx.shadowBlur = 7
          ctx.fillStyle = rgb((158 + warm * 14) * k, (146 + warm * 6) * k, (142 - warm * 8) * k)
          for (const ox of [-size, 0, size]) {
            if (x + ox + w < -12 || x + ox > size + 12) continue
            ctx.beginPath()
            ctx.roundRect(x + ox + 4, r * rh + 4, w - 8, rh - 8, 16)
            ctx.fill()
          }
          ctx.restore()
          // faint lighter crown on each stone, no hard highlight
          ctx.fillStyle = rgb(255, 238, 205, 0.07)
          for (const ox of [-size, 0, size]) {
            if (x + ox + w < -12 || x + ox > size + 12) continue
            ctx.beginPath()
            ctx.roundRect(x + ox + 14, r * rh + 10, w * 0.6, rh * 0.4, 14)
            ctx.fill()
          }
          x = (x + w) % size
        }
      }
      dabs(ctx, size, rand, 90, [150, 134, 132], 40, 0.035, 5)
    },
    { aniso: 16 },
  )
}

// vertical planks for decks and doors, 2 m tile
export function plankTexture(scene, name = 'planks') {
  return tile(scene, name, 512, (ctx, size) => {
    const rand = rng(909)
    const count = 8
    const pw = size / count
    for (let i = 0; i < count; i += 1) {
      const k = 0.82 + rand() * 0.3
      ctx.fillStyle = rgb(176 * k, 128 * k, 84 * k)
      ctx.fillRect(i * pw, 0, pw, size)
      ctx.fillStyle = rgb(60, 36, 24, 0.55)
      ctx.fillRect(i * pw, 0, 3, size)
      for (let g = 0; g < 7; g += 1) {
        ctx.fillStyle = rgb(70, 46, 30, 0.12)
        ctx.fillRect(i * pw + 6 + rand() * (pw - 12), rand() * size, 2, 40 + rand() * 120)
      }
      // butt joints
      ctx.fillStyle = rgb(60, 36, 24, 0.5)
      ctx.fillRect(i * pw, (rand() * 0.8 + 0.1) * size, pw, 3)
    }
    dabs(ctx, size, rand, 90, [140, 100, 70], 60, 0.07, 1.4)
  })
}

// plain painted plaster with gouache blotches, 4 m tile
export function washTexture(scene, name = 'wash') {
  return tile(scene, name, 512, (ctx, size) => {
    const rand = rng(5)
    ctx.fillStyle = rgb(244, 240, 236)
    ctx.fillRect(0, 0, size, size)
    dabs(ctx, size, rand, 320, [235, 228, 224], 46, 0.1, 2.4)
    dabs(ctx, size, rand, 120, [255, 252, 246], 30, 0.12, 3)
  })
}

// sash windows, 2 columns by 3 panes. lit panes glow warm, dark panes borrow the dusk sky
export function windowTexture(scene, name, lit) {
  const w = 128
  const h = 192
  const texture = new DynamicTexture(
    name,
    { width: w, height: h },
    scene,
    true,
    Texture.TRILINEAR_SAMPLINGMODE,
  )
  const ctx = texture.getContext()
  const frame = lit ? '#f7ecd2' : '#efe3cc'
  ctx.fillStyle = frame
  ctx.fillRect(0, 0, w, h)
  const pane = (x, y, pw, ph, row) => {
    const g = ctx.createLinearGradient(0, y, 0, y + ph)
    if (lit) {
      g.addColorStop(0, '#ffe3a0')
      g.addColorStop(1, '#ffa94a')
    } else {
      g.addColorStop(0, row === 0 ? '#9a86c8' : '#c79ab6')
      g.addColorStop(1, '#f1a67c')
    }
    ctx.fillStyle = g
    ctx.fillRect(x, y, pw, ph)
    if (lit) {
      // curtain edges and a soft warm bloom inside the pane
      ctx.fillStyle = 'rgba(255,120,40,0.28)'
      ctx.fillRect(x, y, pw * 0.2, ph)
      ctx.fillRect(x + pw * 0.8, y, pw * 0.2, ph)
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.16)'
      ctx.fillRect(x, y, pw * 0.3, ph * 0.5)
    }
  }
  const pad = 10
  const bar = 6
  const pw = (w - pad * 2 - bar) / 2
  const ph = (h - pad * 2 - bar * 2) / 3
  for (let r = 0; r < 3; r += 1)
    for (let c = 0; c < 2; c += 1) pane(pad + c * (pw + bar), pad + r * (ph + bar), pw, ph, r)
  texture.update(true)
  texture.anisotropicFilteringLevel = 8
  texture.wrapU = Texture.CLAMP_ADDRESSMODE
  texture.wrapV = Texture.CLAMP_ADDRESSMODE
  return texture
}

// soft radial blob for light pools and foam
export function glowTexture(scene, name, stops, size = 128) {
  const texture = new DynamicTexture(name, size, scene, true)
  const ctx = texture.getContext()
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [t, color] of stops) g.addColorStop(t, color)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  texture.update()
  texture.hasAlpha = true
  texture.wrapU = Texture.CLAMP_ADDRESSMODE
  texture.wrapV = Texture.CLAMP_ADDRESSMODE
  return texture
}
