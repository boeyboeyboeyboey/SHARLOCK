import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { glowMaterial } from './toon.js';
import { arcStrip } from '../shared/plates.js';
import { loadPlateTexture } from '../shared/plate-texture.js';
import { groundFrac, groundY, pieceRings } from './plategeo.js';
import { rng } from '../shared/random.js';

const rad = (deg) => (deg * Math.PI) / 180;

// st paul's: drum with colonnade, stone dome, lantern, ball and cross, twin west towers
function paintDome(ctx, x, base, ppm, color) {
  ctx.fillStyle = color;
  const dw = 34 * ppm;
  ctx.fillRect(x - dw * 0.6, base - 24 * ppm, dw * 1.2, 24 * ppm);
  ctx.fillRect(x - dw * 0.5, base - 32 * ppm, dw, 8 * ppm);
  ctx.beginPath();
  ctx.ellipse(x, base - 32 * ppm, dw * 0.46, 22 * ppm, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(x - 2.2 * ppm, base - 58 * ppm, 4.4 * ppm, 7 * ppm);
  ctx.beginPath();
  ctx.moveTo(x - 2.4 * ppm, base - 56 * ppm);
  ctx.lineTo(x, base - 66 * ppm);
  ctx.lineTo(x + 2.4 * ppm, base - 56 * ppm);
  ctx.fill();
  ctx.fillRect(x - 0.3 * ppm, base - 74 * ppm, 0.6 * ppm, 9 * ppm);
  ctx.fillRect(x - 1.6 * ppm, base - 72 * ppm, 3.2 * ppm, 0.6 * ppm);
  for (const s of [-1, 1]) {
    ctx.fillRect(x + s * dw * 0.78 - 3 * ppm, base - 34 * ppm, 6 * ppm, 34 * ppm);
    ctx.beginPath();
    ctx.moveTo(x + s * dw * 0.78 - 3.6 * ppm, base - 34 * ppm);
    ctx.lineTo(x + s * dw * 0.78, base - 42 * ppm);
    ctx.lineTo(x + s * dw * 0.78 + 3.6 * ppm, base - 34 * ppm);
    ctx.fill();
  }
  ctx.fillRect(x - dw * 0.9, base - 12 * ppm, dw * 1.8, 12 * ppm);
}

function spire(ctx, x, base, ppm, height, color) {
  ctx.fillStyle = color;
  const w = 3.6 * ppm;
  ctx.fillRect(x - w / 2, base - height * 0.55 * ppm, w, height * 0.55 * ppm);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.6, base - height * 0.55 * ppm);
  ctx.lineTo(x, base - height * ppm);
  ctx.lineTo(x + w * 0.6, base - height * 0.55 * ppm);
  ctx.fill();
}

// layered silhouettes with a few lit windows. every strip covers `arc` degrees at the given radius
export function paintSkyline(ctx, w, h, { seed, arc, radius, dome = null, spires = 4, density = 1, layers = null, crane = true }) {
  const rand = rng(seed);
  const widthM = 2 * radius * Math.sin(rad(arc / 2));
  const ppm = w / widthM;
  const base = h * 0.86;
  ctx.clearRect(0, 0, w, h);
  const palette = layers ?? [
    { color: 'rgba(214,150,170,0.78)', hMin: 8, hMax: 26, step: 8 },
    { color: 'rgba(160,100,142,0.9)', hMin: 8, hMax: 30, step: 10 },
    { color: 'rgba(104,66,116,0.97)', hMin: 7, hMax: 24, step: 12 },
  ];
  palette.forEach((layer, li) => {
    let x = -40;
    ctx.fillStyle = layer.color;
    while (x < w) {
      const bw = (6 + rand() * layer.step) * ppm * 1.6;
      const bh = (layer.hMin + rand() * (layer.hMax - layer.hMin)) * ppm;
      ctx.fillStyle = layer.color;
      ctx.fillRect(x, base - bh, bw, bh + h * 0.2);
      const roof = rand();
      if (roof < 0.4) {
        ctx.beginPath();
        ctx.moveTo(x - 1, base - bh);
        ctx.lineTo(x + bw / 2, base - bh - bw * 0.3);
        ctx.lineTo(x + bw + 1, base - bh);
        ctx.fill();
      } else if (roof < 0.6) {
        ctx.fillRect(x + bw * 0.6, base - bh - 4 * ppm, 1.2 * ppm, 4 * ppm);
        ctx.fillRect(x + bw * 0.55, base - bh - 4.4 * ppm, 2 * ppm, 0.8 * ppm);
      }
      if (li === 2) {
        for (let k = 0; k < bw * bh * 0.0016 * density; k += 1) {
          ctx.fillStyle = rand() < 0.7 ? 'rgba(255,196,110,0.9)' : 'rgba(255,224,160,0.9)';
          ctx.fillRect(x + 2 + rand() * (bw - 5), base - bh + 3 + rand() * (bh - 6), 1.6, 2.2);
        }
      }
      x += bw + rand() * 4 * ppm;
    }
  });
  if (crane) {
    // a couple of far cranes and masts
    ctx.strokeStyle = 'rgba(80,52,96,0.95)';
    ctx.lineWidth = Math.max(1.5, 0.5 * ppm);
    for (let i = 0; i < 3; i += 1) {
      const x = rand() * w;
      ctx.beginPath();
      ctx.moveTo(x, base);
      ctx.lineTo(x, base - (26 + rand() * 12) * ppm);
      ctx.lineTo(x + (10 + rand() * 6) * ppm, base - (30 + rand() * 6) * ppm);
      ctx.stroke();
    }
  }
  for (let i = 0; i < spires; i += 1) spire(ctx, rand() * w, base, ppm, 38 + rand() * 28, 'rgba(112,72,124,0.96)');
  if (dome !== null) paintDome(ctx, dome * w, base, ppm, 'rgba(96,60,110,0.98)');
  // solid land under the skyline so nothing stands in the water
  ctx.fillStyle = 'rgba(88,58,100,1)';
  ctx.fillRect(0, base, w, h - base);
  // warm haze rising from the water line, so the far bank melts into the sunset
  ctx.globalCompositeOperation = 'source-atop';
  const haze = ctx.createLinearGradient(0, base - h * 0.34, 0, base);
  haze.addColorStop(0, 'rgba(255,170,130,0)');
  haze.addColorStop(1, 'rgba(255,184,128,0.78)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
}

export const plateBase = `${import.meta.env.BASE_URL}hub/plates/`;

// numbered pieces per ring, with a painted stand-in for any piece whose file is absent; the loader is swappable so a test can feed synthetic textures
// isdisposed: true once the hub was left; what loaded so far is released and the result is null
export async function buildSkyline({ scene, indexes, tier, loadFile = loadPlateTexture, isDisposed = () => false }) {
  const meshes = [];
  const textures = [];
  const materials = [];
  const have = (name) => Boolean(name) && indexes.plates.has(name);
  const scale = tier.desktop ? 1 : 0.5;

  const strip = (name, loaded, { az0, az1, r, paint, alphaIndex, groundFrac: frac = groundFrac, fadeLeft = 0, fadeRight = 0, columns = 16 }) => {
    let texture = loaded;
    const fromFile = Boolean(texture);
    if (!texture) {
      // a stand-in for a partial arc keeps the pixel density of the full 100 degree strip
      const w = Math.round(2048 * scale * Math.min(1, (az1 - az0) / 100));
      const h = Math.round(384 * scale);
      texture = new DynamicTexture(name, { width: w, height: h }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
      paint(texture.getContext(), w, h);
      texture.update(true);
      texture.hasAlpha = true;
      texture.wrapU = Texture.CLAMP_ADDRESSMODE;
      texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    }
    textures.push(texture);
    const size = texture.getSize();
    // painted stand-ins keep the chord based height they were drawn for, supplied images are fitted by arc length so painted proportions stay true
    const widthM = fromFile ? r * rad(az1 - az0) : 2 * r * Math.sin(rad((az1 - az0) / 2));
    const heightM = widthM * (size.height / size.width);
    // the ground line sits a fixed fraction up from the bottom edge (14 percent unless the ring says otherwise) and is put at the water level
    const y0 = -(fromFile ? frac : groundFrac) * heightM + groundY;
    const mesh = arcStrip(scene, name, { r, y0, y1: y0 + heightM, az0: rad(az0), az1: rad(az1), columns, rows: 1, fadeLeft: fromFile ? fadeLeft : 0, fadeRight: fromFile ? fadeRight : 0 });
    const material = glowMaterial(scene, name, { texture, fog: false, backFaceCulling: false });
    material.useAlphaFromDiffuseTexture = true;
    material.disableDepthWrite = true;
    material.zOffset = 4;
    mesh.material = material;
    mesh.applyFog = false;
    mesh.alphaIndex = alphaIndex;
    // the vertex alpha carries the overlap ramp of a piece
    mesh.hasVertexAlpha = Boolean(fromFile && (fadeLeft || fadeRight));
    meshes.push(mesh);
    materials.push(material);
  };

  const midLayers = [{ color: 'rgba(190,118,140,0.9)', hMin: 6, hMax: 15, step: 9 }, { color: 'rgba(130,78,118,0.96)', hMin: 6, hMax: 17, step: 10 }, { color: 'rgba(86,54,100,1)', hMin: 5, hMax: 14, step: 12 }];
  const pieces = (set) => Object.entries(pieceRings).filter(([, p]) => p.set === set);
  const paintFor = ({ set, index, az0, az1, r }) => {
    const arc = az1 - az0;
    if (set === 'mid') return (ctx, w, h) => paintSkyline(ctx, w, h, { seed: 91 + index, arc, radius: r, spires: 1, density: 1.5, layers: midLayers });
    const dome = -72 > az0 && -72 < az1 ? (-72 - az0) / arc : null;
    return (ctx, w, h) => paintSkyline(ctx, w, h, { seed: 30 + index, arc, radius: r, dome, spires: 3 });
  };

  // decode and key every plate at once, then place them in ring order so draw order never depends on which file arrived first
  const list = [...pieces('far'), ...pieces('mid')];
  const loaded = await Promise.all(
    list.map(([, p]) => (have(p.file) ? loadFile(scene, `${plateBase}${p.file}`, { cropTo: p.cropTo, cutBelow: p.cropTo ? 1 - p.groundFrac : null, scale: tier.plateScale }) : null)),
  );
  if (isDisposed()) {
    for (const texture of loaded) texture?.dispose();
    return null;
  }
  list.forEach(([name, p], i) => strip(name, loaded[i], { ...p, paint: paintFor(p) }));

  return {
    meshes,
    dispose() {
      for (const m of meshes) m.dispose();
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
    },
  };
}
