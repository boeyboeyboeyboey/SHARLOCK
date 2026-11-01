import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { toSun } from './layout.js';
import { glowMaterial } from './toon.js';
import { rng } from '../shared/random.js';

const EL0 = (-15 * Math.PI) / 180;
const EL1 = (90 * Math.PI) / 180;
// writes the mix into out, so the half a million pixels below create no short lived arrays; out may also be a
const mixInto = (out, a, b, t) => {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
};
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// value noise on a wrapping lattice, so clouds join up around the full circle
function makeNoise(seed, wrapX) {
  const rand = rng(seed);
  const size = 64;
  const grid = new Float32Array(size * size);
  for (let i = 0; i < grid.length; i += 1) grid[i] = rand();
  const at = (x, y) => grid[(((y % size) + size) % size) * size + (((x % wrapX) + wrapX) % wrapX)];
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const tx = x - xi;
    const ty = y - yi;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

const ZENITH = [104, 106, 188];
const HIGH = [186, 142, 196];
const LOW = [255, 168, 138];
const HORIZON = [255, 204, 128];
const BELOW = [255, 196, 140];
const HALO = [255, 190, 110];
const GLOW = [255, 226, 160];
const CLOUD_SHADE = [150, 112, 176];
const CLOUD_UNDER = [255, 150, 124];
const CLOUD_LIT = [255, 214, 142];
const CLOUD_RIM = [255, 238, 190];
const DISC = [255, 249, 226];

// paints rows from..to of the sky into rgba bytes: sunset gradient, painterly cloud banks lit from below and a big soft sun
export function createSkyPainter(data, width, height) {
  const wrapX = 16;
  const n1 = makeNoise(11, wrapX);
  const n2 = makeNoise(23, wrapX * 2);
  const fbm = (a, e) => {
    const x = (a / (Math.PI * 2)) * wrapX;
    const y = e * 9;
    return n1(x, y) * 0.55 + n1(x * 2, y * 2.3) * 0.28 + n2(x * 4, y * 4.1) * 0.17;
  };
  const c = [0, 0, 0];
  const tone = [0, 0, 0];
  return (from, to) => {
    for (let j = from; j < to; j += 1) {
      const v = 1 - (j + 0.5) / height;
      const el = EL0 + v * (EL1 - EL0);
      for (let i = 0; i < width; i += 1) {
        const az = ((i + 0.5) / width) * Math.PI * 2 - Math.PI;
        const dx = Math.sin(az) * Math.cos(el) - toSun.x;
        const dy = Math.sin(el) - toSun.y;
        const dz = Math.cos(az) * Math.cos(el) - toSun.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        // colour bands by elevation
        mixInto(c, ZENITH, HIGH, 1 - smooth(0.18, 1.1, el));
        mixInto(c, c, LOW, 1 - smooth(0.02, 0.5, el));
        mixInto(c, c, HORIZON, 1 - smooth(-0.02, 0.2, el));
        if (el < 0) mixInto(c, HORIZON, BELOW, smooth(0, 0.2, -el));
        // warm halo, tight inner glow
        const halo = Math.exp(-(d * d) / (2 * 0.55 * 0.55));
        const glow = Math.exp(-(d * d) / (2 * 0.16 * 0.16));
        mixInto(c, c, HALO, halo * 0.55);
        mixInto(c, c, GLOW, glow * 0.7);
        // cloud banks: stretched noise, three painted tones, bright underside
        const base = fbm(az, el * 1.6);
        const above = fbm(az, el * 1.6 + 0.06);
        const cover = smooth(0.5, 0.58, base) * smooth(-0.04, 0.12, el) * (1 - smooth(0.7, 1.1, el));
        if (cover > 0.001) {
          const under = Math.min(1, Math.max(0, 0.5 + (above - base) * 7));
          const nearSun = Math.exp(-(d * d) / (2 * 0.9 * 0.9));
          mixInto(tone, CLOUD_SHADE, CLOUD_UNDER, under);
          mixInto(tone, tone, CLOUD_LIT, smooth(0.55, 1, under) * (0.35 + nearSun * 0.65));
          mixInto(tone, tone, CLOUD_RIM, smooth(0.9, 1.0, under) * nearSun);
          mixInto(c, c, tone, cover * 0.92);
        }
        // the disc itself, with a soft rim
        const disc = 1 - smooth(0.05, 0.075, d);
        mixInto(c, c, DISC, disc);
        const o = (j * width + i) * 4;
        data[o] = c[0];
        data[o + 1] = c[1];
        data[o + 2] = c[2];
        data[o + 3] = 255;
      }
    }
  };
}

const SKY_BANDS = 4;
const nextTask = () => new Promise((resolve) => setTimeout(resolve));

// painted once per mount, in bands with a pause between them so the loading screen stays alive on slow machines
// resolves null when the hub was left while it painted
export async function createSky(scene, { width = 1536, height = 384, isDisposed = () => false } = {}) {
  const texture = new DynamicTexture('sky', { width, height }, scene, false, Texture.BILINEAR_SAMPLINGMODE);
  const ctx = texture.getContext();
  const image = ctx.createImageData(width, height);
  const paint = createSkyPainter(image.data, width, height);
  for (let band = 0; band < SKY_BANDS; band += 1) {
    paint(Math.floor((band * height) / SKY_BANDS), Math.floor(((band + 1) * height) / SKY_BANDS));
    await nextTask();
    if (isDisposed()) {
      texture.dispose();
      return null;
    }
  }
  ctx.putImageData(image, 0, 0);
  texture.update(true);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;

  // dome with uv = azimuth and elevation, looking inwards
  const rings = 28;
  const segs = 72;
  const radius = 600;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let r = 0; r <= rings; r += 1) {
    const v = r / rings;
    const el = EL0 + v * (EL1 - EL0);
    for (let s = 0; s <= segs; s += 1) {
      const u = s / segs;
      const az = u * Math.PI * 2 - Math.PI;
      pos.push(Math.sin(az) * Math.cos(el) * radius, Math.sin(el) * radius, Math.cos(az) * Math.cos(el) * radius);
      uv.push(u, v);
    }
  }
  for (let r = 0; r < rings; r += 1) {
    for (let s = 0; s < segs; s += 1) {
      const a = r * (segs + 1) + s;
      const b = a + segs + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const dome = new Mesh('sky', scene);
  const data = new VertexData();
  data.positions = new Float32Array(pos);
  data.uvs = new Float32Array(uv);
  data.indices = new Uint16Array(idx);
  data.applyToMesh(dome, false);
  const material = glowMaterial(scene, 'sky', { texture, fog: false, backFaceCulling: false });
  material.disableDepthWrite = true;
  dome.material = material;
  dome.infiniteDistance = true;
  dome.isPickable = false;
  dome.applyFog = false;
  dome.alwaysSelectAsActiveMesh = true;
  dome.renderingGroupId = 0;
  return {
    mesh: dome,
    dispose() {
      dome.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
