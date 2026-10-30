import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';

const serif = '"Georgia", "Times New Roman", serif';
const SIZE = 2048;

// painted boards: [id, kind, lines, background, ink, trim, motif]
const boards = [
  ['telegraph-hang', 'hang', ['TELEGRAPH', 'OFFICE'], '#1f3a5f', '#f4d27a', '#c99a2e', 'bolt'],
  ['customs-hang', 'hang', ["H.M. CUSTOMS", 'HOUSE'], '#3c2e26', '#f1e3b8', '#b89a52', 'anchor'],
  ['post-hang', 'hang', ['ROYAL MAIL', 'POST OFFICE'], '#b2262a', '#fff0c0', '#e4b84a', 'crown'],
  ['pub-hang', 'hang', ['THE CAPYBARA', '& CROWN'], '#2d5a3a', '#ffe9a8', '#e6a63c', 'capy'],
  ['police-hang', 'hang', ['CLEARANCE', 'TOWER'], '#1c3d86', '#eaf1ff', '#9fb8f0', 'lamp'],
  ['news-hang', 'hang', ['THE DAILY', 'BRIEFING'], '#e9dcb8', '#2b2118', '#b3402f', 'press'],
  ['extra', 'hang', ['EXTRA!', 'EXTRA!'], '#f4ead0', '#c4262b', '#2b2118', 'none'],
  ['chandler', 'hang', ['SHIP', 'CHANDLER'], '#274b4b', '#f1dca0', '#caa04a', 'anchor'],
  ['telegraph-fascia', 'fascia', ['TELEGRAPH OFFICE'], '#1f3a5f', '#f4d27a', '#c99a2e'],
  ['customs-fascia', 'fascia', ["H.M. CUSTOMS HOUSE  -  BONDED STORES"], '#d8cbaa', '#3b2a1c', '#8b7440'],
  ['post-fascia', 'fascia', ['POST OFFICE  -  TELEGRAMS  -  SAVINGS BANK'], '#b2262a', '#fff0c0', '#e4b84a'],
  ['pub-fascia', 'fascia', ['THE CAPYBARA & CROWN  -  ALES & PORTER'], '#2d5a3a', '#ffe9a8', '#e6a63c'],
  ['police-fascia', 'fascia', ['CLEARANCE TOWER'], '#1c3d86', '#eaf1ff', '#9fb8f0'],
  ['news-fascia', 'fascia', ['NEWS  -  PAPERS  -  TOBACCO'], '#e9dcb8', '#2b2118', '#b3402f'],
  ['agent', 'fascia', ['SHIPPING & INSURANCE AGENTS'], '#4a3358', '#f0dba2', '#c9a24a'],
  ['tea', 'fascia', ['TEA & COFFEE WAREHOUSE'], '#6b3a1e', '#f6e1a6', '#d9a441'],
  ['wharfinger', 'fascia', ['WHARFINGERS & CO.  -  LONDON'], '#26433d', '#f0e2b0', '#cfa94e'],
  ['bonded', 'fascia', ['BONDED WAREHOUSE No. 4'], '#5a2420', '#f2d9a0', '#c8963e'],
  ['cooper', 'fascia', ['COOPERAGE  -  CASKS & BARRELS'], '#58411f', '#f6e3aa', '#d3a64a'],
  ['hotel', 'fascia', ['THE ANCHOR HOTEL  -  BEDS'], '#2c3f66', '#f6e8b6', '#d4ac52'],
  ['bakery', 'fascia', ['BAKER & CONFECTIONER'], '#7a3e4a', '#fdecc0', '#e0b050'],
  ['chemist', 'fascia', ['APOTHECARY  -  DRUGGIST'], '#2e5a50', '#f2e6b8', '#d2ac52'],
  ['server-fascia', 'fascia', ['SERVER YARD'], '#12301f', '#bff5cf', '#4fd37f'],
];

function fit(ctx, text, width, start, weight = 'bold') {
  let size = start;
  ctx.font = `${weight} ${size}px ${serif}`;
  while (ctx.measureText(text).width > width && size > 12) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${serif}`;
  }
  return size;
}

function motif(ctx, kind, cx, cy, s, ink, trim) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.lineWidth = s * 0.09;
  ctx.lineCap = 'round';
  if (kind === 'bolt') {
    ctx.beginPath();
    ctx.moveTo(s * 0.1, -s * 0.5);
    ctx.lineTo(-s * 0.3, s * 0.08);
    ctx.lineTo(-s * 0.02, s * 0.08);
    ctx.lineTo(-s * 0.14, s * 0.5);
    ctx.lineTo(s * 0.3, -s * 0.12);
    ctx.lineTo(s * 0.02, -s * 0.12);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'anchor') {
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.4);
    ctx.lineTo(0, s * 0.4);
    ctx.moveTo(-s * 0.22, -s * 0.2);
    ctx.lineTo(s * 0.22, -s * 0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, s * 0.1, s * 0.34, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -s * 0.46, s * 0.07, 0, Math.PI * 2);
    ctx.stroke();
  } else if (kind === 'crown') {
    ctx.fillStyle = trim;
    ctx.beginPath();
    ctx.moveTo(-s * 0.36, s * 0.3);
    ctx.lineTo(-s * 0.4, -s * 0.22);
    ctx.lineTo(-s * 0.18, 0);
    ctx.lineTo(0, -s * 0.34);
    ctx.lineTo(s * 0.18, 0);
    ctx.lineTo(s * 0.4, -s * 0.22);
    ctx.lineTo(s * 0.36, s * 0.3);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'lamp') {
    ctx.fillStyle = '#6fa6ff';
    ctx.beginPath();
    ctx.roundRect(-s * 0.2, -s * 0.34, s * 0.4, s * 0.62, s * 0.12);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-s * 0.1, -s * 0.2, s * 0.08, s * 0.34);
  } else if (kind === 'press') {
    ctx.fillStyle = '#2b2118';
    ctx.fillRect(-s * 0.36, -s * 0.28, s * 0.72, s * 0.56);
    ctx.fillStyle = '#e9dcb8';
    for (let i = 0; i < 4; i += 1) ctx.fillRect(-s * 0.28, -s * 0.2 + i * s * 0.12, s * 0.56, s * 0.05);
  } else if (kind === 'capy') {
    // a plump capybara wearing a crown
    ctx.fillStyle = '#b9814f';
    ctx.beginPath();
    ctx.ellipse(-s * 0.05, s * 0.16, s * 0.42, s * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(s * 0.34, s * 0.02, s * 0.2, s * 0.17, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5a3a26';
    ctx.beginPath();
    ctx.ellipse(s * 0.5, s * 0.06, s * 0.08, s * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e6a63c';
    ctx.beginPath();
    ctx.moveTo(s * 0.22, -s * 0.1);
    ctx.lineTo(s * 0.2, -s * 0.34);
    ctx.lineTo(s * 0.3, -s * 0.2);
    ctx.lineTo(s * 0.36, -s * 0.38);
    ctx.lineTo(s * 0.42, -s * 0.2);
    ctx.lineTo(s * 0.52, -s * 0.34);
    ctx.lineTo(s * 0.48, -s * 0.1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function paintBoard(ctx, rect, [, kind, lines, bg, ink, trim, mot]) {
  const { x, y, w, h } = rect;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  // soft painted wash and a double border in the trim colour
  const wash = ctx.createLinearGradient(0, 0, 0, h);
  wash.addColorStop(0, 'rgba(255,255,255,0.14)');
  wash.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = trim;
  ctx.lineWidth = Math.max(6, h * 0.045);
  ctx.strokeRect(ctx.lineWidth * 1.2, ctx.lineWidth * 1.2, w - ctx.lineWidth * 2.4, h - ctx.lineWidth * 2.4);
  ctx.lineWidth = Math.max(2, h * 0.014);
  ctx.strokeRect(ctx.lineWidth * 9, ctx.lineWidth * 9, w - ctx.lineWidth * 18, h - ctx.lineWidth * 18);
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (kind === 'hang') {
    const motifSize = mot && mot !== 'none' ? h * 0.3 : 0;
    const top = motifSize ? h * 0.36 : h * 0.1;
    if (motifSize) motif(ctx, mot, w / 2, h * 0.2, motifSize * 0.95, ink, trim);
    const rows = lines.length;
    const avail = h - top - h * 0.1;
    lines.forEach((line, i) => {
      const size = fit(ctx, line, w * 0.8, rows === 1 ? h * 0.36 : h * 0.26);
      ctx.font = `bold ${size}px ${serif}`;
      ctx.fillText(line, w / 2, top + (avail / rows) * (i + 0.5));
    });
  } else {
    const size = fit(ctx, lines[0], w * 0.9, h * 0.62);
    ctx.font = `bold ${size}px ${serif}`;
    ctx.fillText(lines[0], w / 2, h / 2 + h * 0.03);
  }
  ctx.restore();
}

// one atlas for every painted board, so all signs are a single draw
export function createSigns(scene) {
  const texture = new DynamicTexture('sign-atlas', { width: SIZE, height: SIZE }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  const ctx = texture.getContext();
  ctx.fillStyle = '#2a2018';
  ctx.fillRect(0, 0, SIZE, SIZE);
  const rects = new Map();
  const place = (list, w, h, perRow, y0) => {
    list.forEach((board, i) => {
      const rect = { x: (i % perRow) * w, y: y0 + Math.floor(i / perRow) * h, w, h };
      paintBoard(ctx, rect, board);
      // uv rect inset a little so mips never bleed a neighbouring board in
      const e = 3;
      rects.set(board[0], [(rect.x + e) / SIZE, 1 - (rect.y + h - e) / SIZE, (rect.x + w - e) / SIZE, 1 - (rect.y + e) / SIZE]);
    });
  };
  const hangs = boards.filter((b) => b[1] === 'hang');
  const fascias = boards.filter((b) => b[1] === 'fascia');
  const fasciaH = 176;
  const hangH = 384;
  place(fascias, 1024, fasciaH, 2, 0);
  place(hangs, 512, hangH, 4, Math.ceil(fascias.length / 2) * fasciaH);
  texture.anisotropicFilteringLevel = 8;
  texture.update(true);
  return { texture, uv: (id) => rects.get(id), has: (id) => rects.has(id) };
}
