/* global window, document, Image */
// dev only: renders each interior room from a running dev client and writes client/public/interiors/<id>.webp
// usage: node scripts/capture-interiors.mjs [--base http://localhost:5176] [--force]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = `${root}client/public/interiors`
const args = process.argv.slice(2)
const flag = (name) => args.indexOf(name)
const base = flag('--base') > -1 ? args[flag('--base') + 1] : 'http://localhost:5176'
const force = flag('--force') > -1
const rooms = [
  'cli-cyber-defender',
  'phishing-post-mortem',
  'sql-injection-arcade',
  'social-engineering-simulator',
  'clearance-tower',
]
const size = { width: 1600, height: 900 }

// credentials stay inside this function and are never logged
function readLogin() {
  const text = readFileSync(`${root}.local-handover/wardrobe-preview/login.txt`, 'utf8')
  const pick = (key) => text.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim()
  return { email: pick('email'), password: pick('password') }
}

const todo = rooms.filter((id) => force || !existsSync(`${outDir}/${id}.webp`))
if (!todo.length) {
  console.log('all stills exist, pass --force to overwrite')
  process.exit(0)
}
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
try {
  const context = await browser.newContext({ viewport: size })
  await context.addInitScript(() => {
    localStorage.setItem('sharlock.hubForce3d', '1')
    localStorage.setItem('sharlock.townMode', '3d')
    localStorage.setItem('sharlock.loreIntroSeen', '1')
    localStorage.setItem('sharlock.hubWatchManual', '1')
    localStorage.setItem('sharlock.controlsHintSeen', '3')
    sessionStorage.setItem('sharlock.musicMuted', '1')
  })
  const csrf = await context.request.get(`${base}/api/auth/csrf`, { headers: { Origin: base } })
  const { csrfToken } = await csrf.json()
  const login = await context.request.post(`${base}/api/auth/login`, {
    headers: { Origin: base, 'X-CSRF-Token': csrfToken },
    data: readLogin(),
  })
  if (!login.ok()) throw new Error(`login failed (${login.status()})`)

  for (const id of todo) {
    const page = await context.newPage()
    await page.goto(`${base}/games/${id}?tier=desktop`)
    await page.waitForFunction(
      (room) =>
        window.__interior?.state.ready === true &&
        window.__interior.state.room === room &&
        window.__interior.state.frames >= 2,
      id,
      { timeout: 180000 },
    )
    // the live view blurs and scales the canvas and shows the desk panel; the still bakes in neither
    await page.addStyleTag({
      content:
        '.interior-desk,.desk-surface,.desk-overlay,.modal,.modal-backdrop{display:none!important}.interior-canvas{filter:none!important;transform:none!important}',
    })
    await page.waitForTimeout(1500)
    const png = await page.getByTestId('interior-canvas').screenshot({ type: 'png' })
    const dataUrl = await page.evaluate(
      async ([b64, w, h]) => {
        const img = new Image()
        img.src = `data:image/png;base64,${b64}`
        await img.decode()
        const out = document.createElement('canvas')
        out.width = w
        out.height = h
        // cover fit so a canvas of another aspect still fills the frame
        const scale = Math.max(w / img.width, h / img.height)
        const dw = img.width * scale
        const dh = img.height * scale
        const ctx = out.getContext('2d')
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
        return out.toDataURL('image/webp', 0.8)
      },
      [png.toString('base64'), size.width, size.height],
    )
    const bytes = Buffer.from(dataUrl.split(',')[1], 'base64')
    writeFileSync(`${outDir}/${id}.webp`, bytes)
    console.log(`${id}.webp ${(bytes.length / 1024).toFixed(0)} KB`)
    await page.close()
  }
} finally {
  await browser.close()
}
