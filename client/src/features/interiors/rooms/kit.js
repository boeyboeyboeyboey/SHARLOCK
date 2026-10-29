import { Color3 } from '@babylonjs/core/Maths/math.color.js'
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js'
import { PointLight } from '@babylonjs/core/Lights/pointLight.js'
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js'
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js'
import { rgb } from '../../hub/scenes/shared/geometry.js'
import { applyToon } from '../../hub/scenes/wharf/toon.js'
import {
  createCapybaraRig,
  createCapybaraStatic,
  furStyles,
} from '../../hub/scenes/shared/capybara.js'

// shared pieces for the interior rooms; x right, y up, z away from the camera at the front wall

export const toon = (m) => applyToon(m, { rimGain: 0.9 })

export function hemi(scene, { intensity, diffuse, ground }) {
  const light = new HemisphericLight('fill', new Vector3(0, 1, 0), scene)
  light.intensity = intensity
  light.diffuse = new Color3(...diffuse)
  light.groundColor = new Color3(...ground)
  light.specular = Color3.Black()
  return light
}

export function lamp(scene, name, pos, color, intensity, range) {
  const light = new PointLight(name, new Vector3(...pos), scene)
  light.diffuse = new Color3(...color)
  light.specular = Color3.Black()
  light.intensity = intensity
  light.range = range
  return light
}

// floor, ceiling, three walls, wainscot with a brass rail and ceiling beams
export function shell(b, p) {
  b.box({ c: [0, -0.05, 0.5], s: [9.2, 0.1, 9.4], color: rgb(p.floorA) })
  for (let i = 0; i < 12; i += 1)
    b.box({
      c: [-4.1 + i * 0.75, 0.002, 0.5],
      s: [0.7, 0.01, 9],
      color: rgb(i % 2 ? p.floorB : p.floorA, 1.05),
    })
  b.box({ c: [0, 3.85, 0.5], s: [9.2, 0.1, 9.4], color: rgb(p.ceiling) })
  b.box({ c: [0, 1.9, 4.55], s: [9.2, 3.8, 0.1], color: rgb(p.wall) })
  b.box({ c: [-4.55, 1.9, 0.5], s: [0.1, 3.8, 9.4], color: rgb(p.wall, 0.92) })
  b.box({ c: [4.55, 1.9, 0.5], s: [0.1, 3.8, 9.4], color: rgb(p.wall, 0.92) })
  b.box({ c: [0, 1.9, -4.2], s: [9.2, 3.8, 0.1], color: rgb(p.wall, 0.8) })
  b.box({ c: [0, 0.55, 4.5], s: [9, 1.1, 0.06], color: rgb(p.wainscot) })
  b.box({ c: [-4.5, 0.55, 0.5], s: [0.06, 1.1, 9], color: rgb(p.wainscot) })
  b.box({ c: [4.5, 0.55, 0.5], s: [0.06, 1.1, 9], color: rgb(p.wainscot) })
  b.box({ c: [0, 1.12, 4.48], s: [9, 0.06, 0.1], color: rgb(p.trim, 0.7) })
  for (const z of [-1.2, 1.6, 4.1])
    b.box({ c: [0, 3.65, z], s: [9, 0.22, 0.28], color: rgb(p.beam, 1.6) })
}

// one canvas of painted labels; cells are [text lines, background, ink], an empty lines list gives a plain cell, 4 across by 4 down
// uv(i) is the rect for cell i, usable as the uv of a batch box
export function labelAtlas(scene, name, cells, [W, H] = [1024, 512]) {
  const texture = new DynamicTexture(
    name,
    { width: W, height: H },
    scene,
    true,
    Texture.TRILINEAR_SAMPLINGMODE,
  )
  const ctx = texture.getContext()
  const cw = W / 4
  const ch = H / 4
  cells.forEach(([lines, bg, ink], i) => {
    const x = (i % 4) * cw
    const y = Math.floor(i / 4) * ch
    ctx.fillStyle = bg
    ctx.fillRect(x, y, cw, ch)
    if (!lines.length) return
    ctx.strokeStyle = ink
    ctx.globalAlpha = 0.5
    ctx.lineWidth = 3 * (W / 1024)
    ctx.strokeRect(x + 5, y + 5, cw - 10, ch - 10)
    ctx.globalAlpha = 1
    ctx.fillStyle = ink
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    lines.forEach((text, n) => {
      let size = (lines.length > 1 ? 30 : 38) * (W / 1024)
      ctx.font = `bold ${size}px Georgia, 'Times New Roman', serif`
      while (ctx.measureText(text).width > cw - 24 && size > 12) {
        size -= 2
        ctx.font = `bold ${size}px Georgia, 'Times New Roman', serif`
      }
      ctx.fillText(
        text,
        x + cw / 2,
        y + ch / 2 + (n - (lines.length - 1) / 2) * (size + 6 * (W / 1024)),
      )
    })
  })
  texture.update()
  return {
    texture,
    uv: (i) => [
      (i % 4) / 4,
      1 - (Math.floor(i / 4) + 1) / 4,
      (i % 4) / 4 + 0.25,
      1 - Math.floor(i / 4) / 4,
    ],
  }
}

// the resident idles in the room: animated rig on desktop, a static pose elsewhere
export function resident(scene, { budget, reduced }, o) {
  const style = { ...furStyles[o.fur ?? 'dockA'], ...(o.scarf ? { scarf: o.scarf } : {}) }
  let rig = null
  let node = null
  if (budget.rig) {
    rig = createCapybaraRig(scene, {
      name: o.name,
      style,
      size: o.size ?? 1.2,
      hat: o.hat ?? null,
      monocle: false,
      capColor: o.cap ?? [0.3, 0.3, 0.3],
      accessory: o.accessory ?? null,
      toon,
      reduced,
      idleSeed: o.seed ?? 11,
    })
    node = rig.node
  } else {
    node = createCapybaraStatic(scene, { style, cap: o.cap ?? [0.3, 0.3, 0.3], name: o.name, toon })
    node.scaling.setAll(o.size ?? 1.2)
  }
  node.position.set(o.pos[0], o.pos[1] ?? 0, o.pos[2])
  node.rotation.y = o.yaw
  return {
    update: (dt) => rig?.update(dt, 0),
    dispose() {
      rig?.dispose()
      node?.dispose?.()
    },
  }
}
