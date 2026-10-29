// code-drawn pixel art for the 2D town: static, trusted svg strings (no user input) built on a 4px grid
const INK = '#354b3e'
const R = (x, y, w, h, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`
const B = (x, y, w, h, c) => R(x - 1, y - 1, w + 2, h + 2, INK) + R(x, y, w, h, c)
const step = (x, yb, w, n, d, hr, f, hi) => {
  let s = ''
  for (let i = 0; i < n; i++) {
    const xi = x + i * d
    const wi = w - 2 * i * d
    const yi = yb - (i + 1) * hr
    s += R(xi - 1, yi - 1, wi + 2, hr + 1, INK) + R(xi, yi, wi, hr, f) + R(xi, yi, wi, 1, hi)
  }
  return s
}
const win = (x, y, w, h, g = '#8fc4cc') =>
  B(x, y, w, h, g) + R(x + (w >> 1), y, 1, h, '#f8e6b0') + R(x, y + (h >> 1), w, 1, '#f8e6b0')
const puff = (n, x, y) =>
  `<rect class="town-smoke ${n}" x="${x}" y="${y}" width="3" height="3" fill="#fff8df" opacity=".8"/>`
const shadow = (x, y, w) => R(x, y, w, 2, '#00000026')

const parts = {
  cli() {
    let s = shadow(4, 38, 46)
    s += B(6, 21, 40, 17, '#e7d5a8') + R(7, 32, 38, 5, '#dabd89') + R(7, 21, 38, 1, '#f8e6b0')
    for (let x = 8; x < 44; x += 6) s += R(x, 33, 3, 1, '#c9a56b') + R(x + 3, 35, 3, 1, '#c9a56b')
    s += step(2, 22, 48, 4, 3, 2, '#6f7f93', '#98a7b8')
    for (let x = 2; x <= 44; x++) {
      const t = x / 44
      s += R(x, Math.round(5 + 7 * (1 - t) + 3 * Math.sin(Math.PI * t)), 1, 1, INK)
    }
    s += B(0, 12, 2, 26, '#7b513d')
    s += B(45, 3, 2, 35, '#7b513d') + B(40, 3, 12, 2, '#ae7750') + B(42, 8, 8, 2, '#ae7750')
    s += B(9, 25, 17, 10, '#5b8999') + R(10, 26, 15, 8, '#1d2b26')
    s += R(12, 27, 8, 1, '#7be08a') + R(12, 29, 11, 1, '#7be08a') + R(12, 31, 6, 1, '#7be08a')
    s += R(19, 31, 2, 1, '#d6ffd9') + R(10, 26, 15, 1, '#2f5a45') + B(10, 36, 15, 1, '#ae7750')
    s += win(30, 25, 6, 6) + B(32, 31, 8, 7, '#7b513d') + R(33, 32, 6, 5, '#ae7750')
    s += R(38, 34, 1, 1, '#e5c877') + B(29, 22, 12, 2, '#e5c877')
    return { w: 52, h: 40, vy: 0, body: s }
  },
  clear() {
    let s = shadow(6, 53, 42) + '<g transform="translate(4,8)">'
    s += B(2, 32, 12, 14, '#cbb99b') + B(34, 32, 12, 14, '#cbb99b')
    s += B(1, 29, 14, 3, '#a96e57') + B(33, 29, 14, 3, '#a96e57')
    s += R(2, 29, 12, 1, '#d79570') + R(34, 29, 12, 1, '#d79570')
    s += win(5, 36, 4, 5) + win(39, 36, 4, 5)
    s += B(14, 12, 20, 34, '#a9b9cc') + R(15, 13, 2, 33, '#c4d0de') + R(31, 13, 2, 33, '#8396ad')
    for (let y = 16; y < 44; y += 4) s += R(17, y, 14, 1, '#98a9be')
    s += B(12, 8, 24, 5, '#8396ad')
    for (let x = 12; x < 36; x += 6) s += B(x, 4, 4, 5, '#8396ad')
    s += B(18, 15, 12, 12, '#fff8df') + R(23, 16, 2, 1, INK) + R(23, 25, 2, 1, INK)
    s += R(19, 20, 1, 2, INK) + R(28, 20, 1, 2, INK) + R(23, 18, 1, 4, INK) + R(24, 21, 3, 1, INK)
    s += R(20, 30, 2, 5, INK) + R(26, 30, 2, 5, INK)
    s += B(19, 36, 10, 10, INK) + R(20, 38, 8, 8, '#7b513d') + R(24, 38, 1, 8, '#5b4a3a')
    s += R(20, 37, 8, 1, '#a9b9cc')
    s += R(13, -2, 1, 10, INK) + R(14, -2, 6, 3, '#c9715c') + R(14, -2, 6, 1, '#e08a72')
    s += B(28, -1, 7, 5, '#6f7f93') + R(35, 0, 2, 3, '#fff3b0') + '</g>'
    return { w: 56, h: 56, vy: 0, body: s }
  },
  pub() {
    let s = shadow(4, 38, 50)
    s += B(6, 20, 44, 18, '#f8e6b0') + R(6, 34, 44, 4, '#cbb99b') + R(6, 28, 44, 2, '#7b513d')
    for (const x of [14, 28, 42]) s += R(x, 20, 2, 14, '#7b513d')
    s += B(40, 2, 5, 11, '#a9795f') + R(39, 1, 7, 2, '#7b513d')
    s += step(2, 22, 52, 7, 3, 2, '#8f5444', '#b36a52')
    s += B(23, 13, 8, 6, '#f4cf74') + R(27, 13, 1, 6, '#7b513d')
    s += B(9, 28, 16, 9, '#7b513d') + R(10, 29, 6, 7, '#f4cf74') + R(17, 29, 7, 7, '#f4cf74')
    s += R(10, 31, 14, 1, '#a9795f') + R(8, 37, 18, 1, INK)
    for (let i = 0; i < 6; i++) s += B(8 + i * 3, 24, 3, 4, i % 2 ? '#f8e6b0' : '#d98a3c')
    s += B(33, 27, 8, 11, '#7b513d') + R(35, 29, 4, 4, '#f4cf74') + R(39, 34, 1, 1, '#e5c877')
    s += R(44, 24, 10, 1, INK) + R(49, 25, 1, 3, INK) + B(46, 28, 8, 8, '#e5c877')
    s += R(48, 30, 4, 4, '#7b513d') + R(52, 31, 1, 2, '#7b513d') + R(48, 29, 4, 1, '#fff8df')
    s += B(0, 31, 6, 8, '#ae7750') + R(0, 33, 6, 1, INK) + R(0, 36, 6, 1, INK)
    s += puff('s1', 41, -2) + puff('s2', 42, -2) + puff('s3', 40, -2)
    return { w: 56, h: 48, vy: -8, body: s }
  },
  sql() {
    let s = shadow(2, 38, 54)
    s += B(4, 36, 48, 3, '#cbb99b') + B(6, 33, 44, 3, '#dabd89') + B(8, 15, 40, 18, '#e7d5a8')
    s += step(6, 15, 44, 4, 5, 2, '#f8e6b0', '#fff8df') + B(6, 14, 44, 2, '#cbb99b')
    s += B(24, 5, 8, 2, '#5b8999') + B(24, 7, 8, 2, '#8fc4cc') + B(24, 9, 8, 2, '#5b8999')
    for (const x of [11, 18, 34, 41])
      s += B(x, 17, 4, 16, '#fff8df') + R(x + 3, 17, 1, 16, '#dabd89')
    s += B(24, 22, 8, 11, '#7b513d') + R(25, 23, 6, 4, '#5b8999') + R(28, 28, 1, 5, '#5b4a3a')
    s += R(27, 31, 1, 1, '#e5c877') + R(28, 0, 1, 6, INK) + R(29, 0, 6, 4, '#c9715c')
    s += R(31, 1, 2, 2, '#fff8df')
    s += B(0, 31, 8, 7, '#ae7750') + R(0, 34, 8, 1, INK) + R(3, 31, 1, 7, INK)
    s += B(1, 25, 6, 6, '#c79b66') + R(1, 28, 6, 1, INK)
    s += B(48, 34, 8, 2, '#c9715c') + B(49, 32, 7, 2, '#5b8999') + B(48, 30, 8, 2, '#e5c877')
    s += B(51, 24, 5, 6, '#ae7750') + R(51, 26, 5, 1, INK)
    return { w: 56, h: 40, vy: 0, body: s }
  },
  post() {
    let s = shadow(4, 38, 48) + B(8, 18, 36, 20, '#c9715c')
    for (let y = 21; y < 38; y += 3) {
      s += R(9, y, 34, 1, '#b25c49')
      for (let x = 9 + (y % 2 ? 0 : 3); x < 43; x += 6) s += R(x, y + 1, 1, 2, '#b25c49')
    }
    s += R(8, 18, 36, 2, '#f8e6b0') + R(8, 20, 2, 18, '#f8e6b0') + R(42, 20, 2, 18, '#f8e6b0')
    s += step(4, 20, 44, 5, 4, 2, '#5b8999', '#8fc4cc')
    s += R(26, 2, 1, 8, INK) + B(21, 0, 10, 6, '#fff8df')
    s += R(22, 1, 2, 1, '#c9715c') + R(24, 2, 2, 1, '#c9715c') + R(26, 2, 2, 1, '#c9715c')
    s += R(28, 1, 2, 1, '#c9715c')
    for (const x of [12, 33]) {
      s += B(x, 23, 7, 9, '#8fc4cc') + R(x + 3, 23, 1, 9, '#f8e6b0') + R(x, 27, 7, 1, '#f8e6b0')
    }
    s += B(22, 28, 8, 10, '#7b513d') + R(23, 29, 6, 3, '#f4cf74') + R(28, 34, 1, 1, '#e5c877')
    s += B(21, 25, 10, 2, '#e5c877') + R(20, 38, 12, 1, '#cbb99b')
    s += B(1, 28, 8, 10, '#c4443a') + B(0, 26, 10, 3, '#a8321f') + R(3, 31, 4, 1, INK)
    s += R(1, 35, 8, 1, '#e5c877') + B(44, 32, 7, 6, '#d7a475') + R(46, 31, 3, 2, '#7b513d')
    s += R(46, 34, 3, 2, '#fff8df') + B(48, 37, 5, 3, '#cbb99b')
    return { w: 52, h: 40, vy: 0, body: s }
  },
  news() {
    let s = shadow(2, 34, 40)
    s += B(6, 22, 32, 12, '#ae7750') + R(7, 27, 30, 1, '#7b513d') + R(7, 31, 30, 1, '#7b513d')
    s += B(4, 20, 36, 3, '#deb783') + R(5, 16, 2, 6, '#7b513d') + R(37, 16, 2, 6, '#7b513d')
    for (let i = 0; i < 9; i++) {
      const c = i % 2 ? '#fff8df' : '#c4443a'
      s += B(4 + i * 4, 9, 4, 8, c) + B(4 + i * 4, 17, 4, 2, c)
    }
    s += B(3, 7, 38, 2, '#7b513d') + B(19, 3, 6, 4, '#e5c877') + R(21, 4, 2, 2, '#fff3b0')
    s += B(8, 15, 9, 5, '#fff8df') + R(9, 17, 5, 1, INK) + R(9, 18, 7, 1, '#8a9ba8')
    s += B(10, 13, 9, 2, '#f8e6b0') + B(24, 16, 9, 4, '#f8e6b0') + R(28, 16, 1, 4, '#7b513d')
    s += B(26, 14, 6, 2, '#fff8df') + B(0, 29, 7, 5, '#fff8df') + R(3, 29, 1, 5, '#7b513d')
    s += R(0, 31, 7, 1, '#7b513d')
    return { w: 44, h: 36, vy: 0, body: s }
  },
}

// catalog building.type to the drawing that suits it
const TYPE_ART = {
  cottage: 'cli',
  library: 'post',
  hut: 'sql',
  newsstand: 'news',
  office: 'pub',
  shed: 'clear',
}

export function buildingArt(type) {
  const art = parts[TYPE_ART[type]]()
  return {
    width: art.w * 4,
    height: art.h * 4,
    viewBox: `0 ${art.vy} ${art.w} ${art.h}`,
    body: art.body,
  }
}

// scenery-only props (not destinations): backstreet house, market stall, cart, bench, crates
const smallSvg = (x, y, w, h, body, z) =>
  `<svg class="town-prop" style="left:${x}px;top:${y}px;z-index:${z}" width="${w * 4}" height="${h * 4}" viewBox="0 0 ${w} ${h}">${body}</svg>`

export function propsMarkup() {
  const house =
    shadow(2, 27, 32) +
    B(4, 12, 28, 15, '#d7c39a') +
    R(5, 22, 26, 4, '#c9b184') +
    step(2, 14, 32, 5, 3, 2, '#8a6a5a', '#a98672') +
    win(8, 16, 6, 6) +
    B(20, 17, 6, 10, '#7b513d') +
    R(24, 22, 1, 1, '#e5c877') +
    B(25, 3, 4, 8, '#a9795f')
  const stall =
    shadow(2, 22, 34) +
    B(5, 14, 3, 8, '#7b513d') +
    B(30, 14, 3, 8, '#7b513d') +
    B(4, 18, 30, 4, '#ae7750') +
    R(5, 19, 28, 1, '#c79b66') +
    [0, 1, 2, 3, 4, 5].map((i) => B(3 + i * 5, 8, 5, 6, i % 2 ? '#fff8df' : '#5b8999')).join('') +
    B(8, 15, 5, 3, '#c9715c') +
    B(14, 15, 5, 3, '#e5c877') +
    B(20, 15, 5, 3, '#9ccf7a')
  const cart =
    B(3, 6, 18, 6, '#ae7750') +
    R(4, 8, 16, 1, '#7b513d') +
    B(5, 2, 5, 4, '#c79b66') +
    B(11, 3, 5, 3, '#fff8df') +
    B(8, 12, 5, 5, '#a9795f') +
    B(17, 12, 5, 5, '#a9795f') +
    R(9, 13, 3, 3, '#7b513d') +
    R(18, 13, 3, 3, '#7b513d') +
    R(21, 5, 8, 1, INK) +
    R(26, 5, 1, 3, INK)
  const bench =
    B(1, 3, 14, 2, '#ae7750') +
    B(2, 5, 2, 4, '#7b513d') +
    B(12, 5, 2, 4, '#7b513d') +
    R(1, 1, 14, 2, '#a96e57')
  const crates =
    B(1, 6, 9, 8, '#ae7750') +
    R(1, 9, 9, 1, INK) +
    R(5, 6, 1, 8, INK) +
    B(10, 9, 7, 5, '#c79b66') +
    B(3, 1, 6, 5, '#c79b66') +
    R(3, 3, 6, 1, INK)
  return [
    smallSvg(20, 330, 36, 28, house, 340),
    smallSvg(36, 560, 38, 24, stall, 590),
    smallSvg(724, 676, 30, 18, cart, 700),
    smallSvg(168, 676, 16, 10, bench, 690),
    smallSvg(936, 440, 18, 16, crates, 450),
  ].join('')
}

const lamp = (x, y) =>
  R(x, y - 10, 2, 10, INK) +
  R(x - 1, y - 1, 4, 2, INK) +
  B(x - 1, y - 15, 4, 5, '#e5c877') +
  R(x, y - 14, 2, 2, '#fff3b0')

// lamp posts in 280 x 200 ground units
export function lampsMarkup() {
  return [
    [11, 66],
    [38, 66],
    [233, 66],
    [257, 66],
    [116, 84],
    [116, 132],
    [116, 172],
    [164, 84],
    [164, 132],
    [164, 172],
  ]
    .map(([x, y]) => lamp(x, y))
    .join('')
}

// ground layer in 280 x 200 units (1 unit = 4px of the 1120 x 800 world)
export function groundMarkup() {
  const path = (x, y, w, h, f = 'url(#tw-sand)') =>
    R(x, y, w, h, '#c2a66b') + R(x + 1, y + 1, w - 2, h - 2, f)
  let g = `<defs>
<pattern id="tw-grass" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#a8c98a"/><rect x="2" y="3" width="2" height="1" fill="#91b575"/><rect x="9" y="10" width="3" height="1" fill="#91b575"/><rect x="12" y="4" width="1" height="1" fill="#bcd9a0"/><rect x="5" y="13" width="1" height="1" fill="#bcd9a0"/></pattern>
<pattern id="tw-sand" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#e6cb92"/><rect x="1" y="2" width="2" height="1" fill="#d5b879"/><rect x="5" y="6" width="2" height="1" fill="#d5b879"/></pattern>
<pattern id="tw-cob" width="12" height="8" patternUnits="userSpaceOnUse"><rect width="12" height="8" fill="#ead29c"/><path d="M0 3h12M0 7h12M4 0v3M10 3v4M2 4v3" stroke="#d5b879" stroke-width="1" fill="none"/></pattern>
<pattern id="tw-wat" width="16" height="8" patternUnits="userSpaceOnUse"><rect width="16" height="8" fill="#5b8999"/><rect x="2" y="1" width="4" height="1" fill="#8fc4cc"/><rect x="10" y="5" width="3" height="1" fill="#8fc4cc"/><rect x="6" y="3" width="3" height="1" fill="#4a7585"/></pattern>
<pattern id="tw-pln" width="8" height="4" patternUnits="userSpaceOnUse"><rect width="8" height="4" fill="#ae7750"/><rect y="3" width="8" height="1" fill="#7b513d"/><rect x="3" width="1" height="3" fill="#c79b66"/></pattern>
</defs>`
  g += R(0, 0, 280, 200, 'url(#tw-grass)')
  // pond
  const cx = 250
  const y0 = 76
  const rows = 14
  const hw = (r) => Math.round(11 * Math.sqrt(Math.max(0, 1 - Math.pow((r - 6.5) / 7.2, 2))))
  for (let r = -1; r <= rows; r++) {
    const w = hw(Math.min(rows - 1, Math.max(0, r))) + 1
    g += R(cx - w - 1, y0 + r, 2 * w + 2, 1, INK)
  }
  for (let r = 0; r < rows; r++) {
    const w = hw(r)
    g += R(cx - w, y0 + r, 2 * w, 1, r < 2 || r > rows - 3 ? '#5b8999' : '#8fc4cc')
  }
  g += R(244, 82, 3, 1, '#fff8df') + R(252, 86, 2, 1, '#fff8df')
  g += R(246, 84, 2, 2, '#7ca265') + R(256, 80, 2, 2, '#7ca265')
  // river and quay
  g += R(0, 0, 280, 38, 'url(#tw-wat)') + R(0, 0, 280, 2, '#7ca265') + R(0, 2, 280, 1, INK)
  g += R(0, 38, 280, 4, '#cbb99b') + R(0, 38, 280, 1, '#e7d5a8') + R(0, 41, 280, 1, INK)
  for (let x = 4; x < 280; x += 10) g += R(x, 39, 1, 2, '#a9987a')
  g += path(0, 42, 280, 22)
  // street, forecourts, plaza
  g += path(118, 62, 44, 138, 'url(#tw-cob)')
  g +=
    path(52, 95, 67, 7) +
    path(52, 145, 67, 7) +
    path(160, 90, 68, 7) +
    path(160, 140, 59, 7) +
    path(160, 186, 111, 7)
  g += path(108, 164, 64, 34, 'url(#tw-cob)')
  // fountain
  g += R(131, 172, 18, 14, INK) + R(132, 173, 16, 12, '#cbb99b') + R(134, 175, 12, 8, '#8fc4cc')
  g += R(139, 170, 2, 8, '#8fc4cc') + R(138, 168, 4, 2, '#cbb99b')
  g += R(136, 176, 1, 2, '#fff8df') + R(143, 177, 1, 2, '#fff8df')
  // pier under the newsstand
  g +=
    R(112, 2, 56, 52, INK) +
    R(113, 2, 54, 52, 'url(#tw-pln)') +
    R(113, 2, 2, 52, '#7b513d') +
    R(165, 2, 2, 52, '#7b513d')
  for (const [x, y] of [
    [111, 6],
    [166, 6],
    [111, 40],
    [166, 40],
  ])
    g += B(x, y, 3, 3, '#7b513d')
  // unfinished bridge: two stone towers, a gap, one scaffold and a crane
  const stone = '#e7d5a8'
  const tower = (x) => {
    let t = B(x, 8, 16, 28, stone) + R(x + 1, 9, 2, 27, '#f8e6b0') + R(x + 13, 9, 2, 27, '#cbb99b')
    t += B(x + 5, 27, 6, 9, '#4f5f7a') + R(x + 6, 28, 4, 1, '#6f7f93')
    t += B(x - 1, 4, 4, 4, '#cbb99b') + B(x + 13, 4, 4, 4, '#cbb99b')
    return t
  }
  g += tower(190) + tower(246)
  g +=
    B(160, 24, 30, 3, '#a9b9cc') +
    B(206, 24, 12, 3, '#a9b9cc') +
    B(234, 24, 12, 3, '#a9b9cc') +
    B(262, 24, 18, 3, '#a9b9cc')
  let scaf = ''
  for (const y of [8, 16, 24, 32]) scaf += R(243, y, 22, 1, '#ae7750')
  for (const x of [243, 254, 264]) scaf += R(x, 8, 1, 28, '#ae7750')
  g += scaf
  // crane stays 3 units below the world top, off the ink edge line, and never in ink so it reads on the water
  g +=
    R(197, 3, 1, 5, '#d9a441') +
    R(197, 3, 14, 1, '#d9a441') +
    R(211, 4, 1, 5, '#7a85a0') +
    R(208, 9, 6, 2, '#c4443a')
  return g
}

// drifting barges in 280 x 200 ground units, animated by css
export function bargesMarkup() {
  const barge = (x, y, w, c) =>
    R(x - 1, y - 1, w + 2, 10, INK) +
    R(x, y, w, 7, '#7b513d') +
    R(x + 1, y + 1, w - 2, 3, c) +
    R(x, y + 7, w, 2, '#4a3225')
  const cargo = B(16, 12, 8, 5, '#c79b66') + B(26, 11, 9, 6, '#c9715c') + B(37, 13, 8, 4, '#c79b66')
  const tug =
    B(64, 22, 22, 8, '#4f6a86') +
    R(64, 28, 22, 2, '#2f4358') +
    B(68, 16, 8, 6, '#e7d5a8') +
    R(70, 17, 4, 3, '#8fc4cc') +
    B(79, 10, 4, 12, '#c4443a') +
    R(78, 9, 6, 2, INK) +
    puff('s1', 79, 6) +
    puff('s2', 80, 6)
  const skiff = R(90, 31, 16, 3, INK) + R(91, 30, 14, 3, '#a96e57') + R(91, 30, 14, 1, '#d79570')
  return `<g class="town-barge b1">${barge(12, 17, 44, '#5a3a2a') + cargo}</g><g class="town-barge b2">${tug}</g><g class="town-barge b3">${skiff}</g>`
}

// generic capybaras, 12 x 8 units; walkers swap two leg frames, sitters and standers keep four legs
// back props sit behind the body, front props are drawn over it
function capybara({ fur, dark, back = '', front = '', walk = false, sit = false }) {
  const leg = (x) => R(x, 7, 1, 1, INK)
  const legs = walk
    ? `<g class="cap-f0">${leg(2) + leg(4) + leg(6) + leg(8)}</g><g class="cap-f1">${leg(2) + leg(6)}</g><g class="cap-f2">${leg(4) + leg(8)}</g>`
    : sit
      ? R(1, 6, 8, 1, INK)
      : leg(2) + leg(4) + leg(6) + leg(8)
  const body =
    R(1, 2, 8, 5, INK) +
    R(8, 1, 4, 5, INK) +
    R(2, 3, 6, 3, fur) +
    R(9, 2, 2, 3, fur) +
    R(9, 4, 2, 1, dark) +
    R(2, 5, 6, 1, dark) +
    R(10, 3, 1, 1, INK)
  return `<svg class="town-capy" width="48" height="32" viewBox="0 0 12 8" shape-rendering="crispEdges"><g class="cap-body">${back}${body}${front}${legs}</g></svg>`
}

// townsfolk wardrobe; sharlock's deerstalker, monocle and red scarf stay his alone
export const capyFurs = {
  chestnut: ['#b98258', '#8a5c3c'],
  walnut: ['#a9784f', '#7d5233'],
  honey: ['#c79463', '#946a44'],
  sand: ['#d8b48a', '#a88660'],
  cocoa: ['#7f5538', '#5a3a26'],
  ash: ['#9a8572', '#6f5e4e'],
}
export const capyProps = {
  crate: { back: R(2, -1, 6, 4, INK) + R(3, 0, 4, 2, '#c79b66') },
  basket: {
    back:
      R(2, 0, 6, 2, INK) +
      R(3, 0, 4, 1, '#d0a05a') +
      R(4, 0, 1, 1, '#9c6b33') +
      R(6, 0, 1, 1, '#9c6b33'),
  },
  flatCap: { back: R(8, 0, 3, 2, INK) + R(9, 0, 2, 1, '#4f6a86') },
  feltHat: { back: R(8, 0, 4, 2, INK) + R(9, 0, 2, 1, '#a96e57') },
  bowler: { back: R(8, 0, 4, 2, INK) + R(9, 0, 2, 1, '#5f6675') },
  apron: { front: R(5, 3, 3, 3, '#efe4c8') + R(5, 3, 3, 1, '#d8c9a4') },
  newspaper: { front: R(10, 4, 2, 2, '#fff8df') + R(10, 5, 2, 1, '#b9b29a') },
  neckerchief: { front: R(8, 4, 1, 2, '#d9a441') },
}

// one entry per capybara in lifeMarkup order: four walkers, then three stills
export const townCapys = [
  { fur: 'chestnut', props: ['crate', 'flatCap'] },
  { fur: 'honey', props: ['basket', 'bowler'] },
  { fur: 'sand', props: ['feltHat', 'newspaper'] },
  { fur: 'cocoa', props: ['neckerchief'] },
  { fur: 'ash', props: ['flatCap', 'apron'] },
  { fur: 'walnut', props: ['bowler', 'newspaper'] },
  { fur: 'chestnut', props: ['apron'] },
]

const capyArt = (i, opts = {}) => {
  const { fur, props } = townCapys[i]
  const [light, dark] = capyFurs[fur]
  const pick = (side) => props.map((p) => capyProps[p][side] || '').join('')
  return capybara({ fur: light, dark, back: pick('back'), front: pick('front'), ...opts })
}

const walker = (x, y, axis, dist, secs, art) =>
  `<div class="town-walker ${axis}" style="left:${x}px;top:${y}px;--d:${dist}px;--t:${secs}s"><div class="town-flip">${art}</div></div>`
const still = (x, y, art, bob = false) =>
  `<div class="town-still${bob ? ' bob' : ''}" style="left:${x}px;top:${y}px;z-index:${y + 2}">${art}</div>`
const gullSvg =
  '<svg class="town-gull-art" width="36" height="24" viewBox="0 0 12 8" shape-rendering="crispEdges">' +
  `<g class="gull-up">${R(0, 1, 4, 1, INK) + R(8, 1, 4, 1, INK) + R(4, 2, 4, 2, INK) + R(1, 0, 3, 1, '#fff8df') + R(8, 0, 3, 1, '#fff8df') + R(5, 2, 2, 1, '#fff8df')}</g>` +
  `<g class="gull-down">${R(0, 3, 4, 1, INK) + R(8, 3, 4, 1, INK) + R(4, 2, 4, 2, INK) + R(1, 2, 3, 1, '#fff8df') + R(8, 2, 3, 1, '#fff8df') + R(5, 2, 2, 1, '#fff8df')}</g></svg>`
const gull = (x, y, dist, secs) =>
  `<div class="town-walker gull x" style="left:${x}px;top:${y}px;--d:${dist}px;--t:${secs}s"><div class="town-flip">${gullSvg}</div></div>`

// people and birds, positioned in world pixels (feet at the anchor)
export function lifeMarkup() {
  return [
    walker(40, 166, 'x', 350, 44, capyArt(0, { walk: true })),
    walker(700, 166, 'x', 370, 48, capyArt(1, { walk: true })),
    walker(30, 262, 'x', 170, 26, capyArt(2, { walk: true })),
    walker(560, 300, 'y', 340, 40, capyArt(3, { walk: true })),
    still(640, 776, capyArt(4), true),
    still(200, 692, capyArt(5, { sit: true }), true),
    still(1000, 380, capyArt(6, { sit: true }), true),
    gull(80, 60, 240, 18),
    // open sky between the crane and the scaffold, clear of both towers
    gull(880, 40, 60, 14),
  ].join('')
}
