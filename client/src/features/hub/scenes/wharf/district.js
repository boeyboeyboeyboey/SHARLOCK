import { frame } from '../shared/geometry.js';
import { createBuilder } from './buildings.js';
import { outward } from './shapes.js';


const E = Math.PI / 2; // west buildings face east
const W_ = -Math.PI / 2; // east buildings face west
const IRON = [0.2, 0.2, 0.26, 1];
const stripes = (a, c) => [a, c];
const WHITE_STONE = [1.05, 1.02, 0.98, 1];
const cream = [1.05, 0.98, 0.86, 1];

// the six destination buildings plus the terraces and warehouses around them
export function buildDistrict({ world, signs }) {
  const B = createBuilder({ world, signs });
  const { house, fbox, b, windowAt } = B;
  const lampHeads = [];
  const crates = [];
  const smokePoints = [];
  const hoistPoints = [];
  const doorWalls = new Map();

  // ---- west side of the main street, facing east ----
  const telegraph = house({ x: -10, z: 20, yaw: E, W: 15, D: 12, floors: 3, wall: 'brickRed', color: [1.0, 0.94, 0.9, 1], nChimney: 2, litBias: 0.1, fascia: 'telegraph-fascia', signScale: 0.6, hang: { id: 'telegraph-hang', u: -5.4 }, awn: stripes([0.12, 0.2, 0.38, 1], [0.95, 0.9, 0.78, 1]), doorColor: [0.1, 0.16, 0.3, 1] });
  // roof mast with cross arms: the wires land here
  {
    const f = telegraph.f;
    fbox(b.wash, f, 6, telegraph.H + 4.4, -6, 0.22, 8.4, 0.22, IRON);
    for (const h of [3.4, 5.2, 6.9]) fbox(b.wash, f, 6, telegraph.H + h, -6, 3.4 - h * 0.22, 0.14, 0.14, IRON);
    for (const u of [-1.4, -0.7, 0, 0.7, 1.4]) fbox(b.stone, f, 6 + u, telegraph.H + 7.0, -6, 0.14, 0.2, 0.14, [0.8, 0.9, 0.9, 1]);
  }
  house({ x: -10, z: 10, yaw: E, W: 5, D: 12, floors: 3, wall: 'brickYellow', color: [1, 0.96, 0.92, 1], fascia: null });
  const police = house({ x: -10, z: 0, yaw: E, W: 15, D: 12, floors: 3, wall: 'brickYellow', color: [1, 0.96, 0.9, 1], nChimney: 2, hang: { id: 'police-hang', u: -5.6 }, fascia: 'police-fascia', doorColor: [0.12, 0.26, 0.62, 1], litBias: -0.1 });
  {
    // white painted ground floor, barred cipher-room windows, blue lamp over the door
    const f = police.f;
    b.wash.quad([f.point(-7.5, 0.6, 0.02), f.point(7.5, 0.6, 0.02), f.point(7.5, 3.6, 0.02), f.point(-7.5, 3.6, 0.02)], { color: [1.1, 1.08, 1.02, 1], normal: f.dir(0, 0, 1) });
    // the blue lamp hangs from a bracket beside the signboard, clear of the lettering
    lampHeads.push({ at: f.point(5.6, 3.5, 0.95), color: [0.2, 0.45, 1.9], kind: 'blue', size: 0.34 });
    fbox(b.wash, f, 5.6, 3.85, 0.5, 0.08, 0.08, 1.0, IRON);
    for (const u of [-5.2, -2.8, 3.4, 5.6]) for (let k = -2; k <= 2; k += 1) fbox(b.wash, f, u + k * 0.28, 1.9, 0.18, 0.05, 2.1, 0.05, IRON);
  }
  {
    // victorian watchtower over the entrance: brick shaft, clock faces, lantern room, slate spire and a flag, all merged into the shared batches
    const f = police.f;
    const base = police.H + 0.1;
    const S = 4.4;
    const S2 = 3.0;
    const shaft = 9.5;
    const cw = -2.3;
    const centre = f.point(0, 0, cw);
    // frame sitting on the wall plane of one tower face, k quarter turns from the street side
    const wallFrame = (k, half) => {
      const g = frame(centre[0], centre[2], f.yaw + (k * Math.PI) / 2);
      const p = g.point(0, 0, half);
      return frame(p[0], p[2], g.yaw);
    };
    const brickTone = [1, 0.9, 0.86, 1];
    const trim = [0.92, 0.88, 0.8, 1];
    fbox(b.brickRed, f, 0, base + shaft / 2, cw, S, shaft, S, brickTone);
    fbox(b.stone, f, 0, base + 0.3, cw, S + 0.6, 0.6, S + 0.6, trim);
    fbox(b.stone, f, 0, base + 4.2, cw, S + 0.3, 0.22, S + 0.3, trim);
    fbox(b.stone, f, 0, base + shaft - 0.3, cw, S + 0.6, 0.3, S + 0.6, trim);
    fbox(b.stone, f, 0, base + shaft + 0.2, cw, S + 1.1, 0.4, S + 1.1, WHITE_STONE);
    for (const su of [-1, 1]) for (const sw of [-1, 1]) fbox(b.stone, f, su * (S / 2 - 0.1), base + shaft / 2, cw + sw * (S / 2 - 0.1), 0.5, shaft, 0.5, trim);
    for (let k = 0; k < 4; k += 1) {
      const g = wallFrame(k, S / 2);
      // slit window low on the shaft, round dial high up
      b.windowDark.quad([g.point(-0.3, base + 1.6, 0.05), g.point(0.3, base + 1.6, 0.05), g.point(0.3, base + 3.3, 0.05), g.point(-0.3, base + 3.3, 0.05)], { color: [0.7, 0.7, 0.8, 1], uv: [0, 0, 1, 1], normal: g.dir(0, 0, 1) });
      const v = base + 6.9;
      fbox(b.stone, g, 0, v, 0.04, 3.1, 3.1, 0.1, trim);
      fbox(b.wash, g, 0, v, 0.1, 2.6, 2.6, 0.12, [1.12, 1.08, 0.94, 1]);
      for (const [tu, tv, sw, sh] of [[0, 1.05, 0.14, 0.36], [0, -1.05, 0.14, 0.36], [1.05, 0, 0.36, 0.14], [-1.05, 0, 0.36, 0.14]]) fbox(b.wash, g, tu, v + tv, 0.18, sw, sh, 0.06, IRON);
      b.wash.bar(g.point(0, v, 0.2), g.point(0.25, v + 0.95, 0.2), 0.1, { color: IRON });
      b.wash.bar(g.point(0, v, 0.22), g.point(-0.65, v + 0.35, 0.22), 0.14, { color: IRON });
    }
    // lantern room: stone posts around warm glass
    const lb = base + shaft + 0.4;
    for (const su of [-1, 1]) for (const sw of [-1, 1]) fbox(b.stone, f, su * (S2 / 2 - 0.15), lb + 1.3, cw + sw * (S2 / 2 - 0.15), 0.3, 2.6, 0.3, trim);
    for (let k = 0; k < 4; k += 1) {
      const g = wallFrame(k, S2 / 2);
      b.windowLit.quad([g.point(-0.95, lb + 0.35, 0.04), g.point(0.95, lb + 0.35, 0.04), g.point(0.95, lb + 2.2, 0.04), g.point(-0.95, lb + 2.2, 0.04)], { color: [0.95, 0.74, 0.45, 1], uv: [0, 0, 1, 1], normal: g.dir(0, 0, 1) });
      fbox(b.wash, g, 0, lb + 1.28, 0.08, 0.08, 1.9, 0.08, IRON);
    }
    fbox(b.stone, f, 0, lb + 0.1, cw, S2 + 0.2, 0.2, S2 + 0.2, trim);
    fbox(b.stone, f, 0, lb + 2.55, cw, S2 + 0.8, 0.3, S2 + 0.8, WHITE_STONE);
    // pyramid spire
    const sb = lb + 2.7;
    const half = (S2 + 0.8) / 2;
    const apex = f.point(0, sb + 4.2, cw);
    const corner = (su, sw) => f.point(su * half, sb, cw + sw * half);
    for (const [a, c, du, dw] of [[corner(-1, 1), corner(1, 1), 0, 1], [corner(1, 1), corner(1, -1), 1, 0], [corner(1, -1), corner(-1, -1), 0, -1], [corner(-1, -1), corner(-1, 1), -1, 0]]) {
      outward(b.slate, [a, c, apex, apex], f.dir(du, 0.9, dw), { color: [0.95, 0.98, 1.1, 1] });
    }
    // finial and a small pennant streaming south
    const top = sb + 4.2;
    b.wash.bar(f.point(0, top, cw), f.point(0, top + 2.6, cw), 0.1, { color: IRON });
    const fl = (u0, u1, v0, v1, color) => b.cloth.quad([f.point(u0, v0, cw), f.point(u1, v0, cw), f.point(u1, v1, cw), f.point(u0, v1, cw)], { color, normal: f.dir(0, 0, 1) });
    fl(-1.6, -0.05, top + 1.5, top + 2.55, [0.2, 0.4, 0.9, 1]);
    fl(-1.6, -0.05, top + 1.9, top + 2.15, [1.05, 1.0, 0.92, 1]);
    // shaft with lantern room, then the spire and pennant, as separate camera blockers
    B.block(f, [-S / 2 - 0.55, S / 2 + 0.55], [cw - S / 2 - 0.55, cw + S / 2 + 0.55], [police.H, lb + 2.85], 0.2);
    B.block(f, [-1.6, 1.6], [cw - 1.6, cw + 1.6], [sb, top + 2.6], 0.1);
  }
  house({ x: -10, z: -10, yaw: E, W: 5, D: 12, floors: 3, wall: 'brickRed', color: [0.98, 0.92, 0.88, 1] });
  const pub = house({ x: -10, z: -21.25, yaw: E, W: 17.5, D: 12, floors: 3, wall: 'brickRed', color: [0.92, 0.8, 0.76, 1], nChimney: 3, litBias: 0.35, fascia: 'pub-fascia', hang: { id: 'pub-hang', u: -6.4, size: [2.6, 1.95] }, doorColor: [0.32, 0.16, 0.12, 1], awn: stripes([0.2, 0.42, 0.28, 1], [0.95, 0.9, 0.78, 1]) });
  {
    // warm lanterns by the door and a pair of casks with benches
    const f = pub.f;
    lampHeads.push({ at: f.point(-1.5, 2.5, 0.5), color: [1.6, 1.0, 0.5], kind: 'lantern', size: 0.22 });
    lampHeads.push({ at: f.point(1.5, 2.5, 0.5), color: [1.6, 1.0, 0.5], kind: 'lantern', size: 0.22 });
    for (const u of [-5.6, 5.2]) {
      fbox(b.plank, f, u, 0.45, 0.45, 2.0, 0.1, 0.55, [0.95, 0.8, 0.62, 1]);
      fbox(b.plank, f, u - 0.8, 0.22, 0.45, 0.1, 0.44, 0.5, [0.7, 0.55, 0.42, 1]);
      fbox(b.plank, f, u + 0.8, 0.22, 0.45, 0.1, 0.44, 0.5, [0.7, 0.55, 0.42, 1]);
      fbox(b.plank, f, u, 0.88, 0.1, 2.0, 0.08, 0.1, [0.8, 0.65, 0.5, 1]);
    }
    crates.push({ kind: 'barrel', at: f.point(-3.6, 0, 0.7) }, { kind: 'barrel', at: f.point(-3.2, 0, 1.4) }, { kind: 'barrel', at: f.point(3.6, 0, 0.7) });
  }

  // ---- east side, facing west ----
  const customs = house({ x: 11.5, z: 19, yaw: W_, W: 18, D: 12, floors: 3, gf: 5, wall: 'stone', color: [1.02, 0.98, 0.94, 1], nChimney: 2, litBias: -0.1, fascia: null, shopFronts: false, doorColor: [0.14, 0.13, 0.16, 1], doorU: 0, quoins: false, doorFan: false, roofColor: [0.9, 0.9, 1.05, 1] });
  {
    // portico: four columns, entablature with the board, pediment, steps; iron barred ground floor windows
    const f = customs.f;
    for (const u of [-5.2, -1.8, 1.8, 5.2]) b.stone.cylinder({ c: [...f.point(u, 3.6, 2.0)], r: 0.46, h: 7.0, seg: 12, color: [1.05, 1.0, 0.94, 1] });
    for (const u of [-5.2, -1.8, 1.8, 5.2]) {
      fbox(b.stone, f, u, 0.3, 2.0, 1.2, 0.3, 1.2, [0.9, 0.86, 0.8, 1]);
      fbox(b.stone, f, u, 7.2, 2.0, 1.2, 0.3, 1.2, [0.95, 0.9, 0.84, 1]);
    }
    fbox(b.stone, f, 0, 7.8, 1.5, 13.2, 0.9, 2.6, [1.02, 0.98, 0.92, 1]);
    // the signboard stands on the entablature at the north end, away from the south hanging sign and is turned to face the start camera
    {
      const base = f.point(-4.7, 0, 3.4);
      const pf = frame(base[0], base[2], Math.atan2(-0.5, -0.86));
      const [bw, bh, v] = [3.0, 2.25, 10.3];
      b.signs.quad([pf.point(-bw / 2, v - bh / 2, 0), pf.point(bw / 2, v - bh / 2, 0), pf.point(bw / 2, v + bh / 2, 0), pf.point(-bw / 2, v + bh / 2, 0)], { color: [1.08, 1.04, 1, 1], uv: signs.uv('customs-hang'), normal: pf.dir(0, 0, 1) });
      b.wash.box({ c: pf.point(0, v, -0.07), s: [bw + 0.2, bh + 0.2, 0.1], yaw: pf.boxYaw, color: [0.18, 0.15, 0.16, 1] });
      for (const u of [-0.9, 0.9]) b.wash.bar(pf.point(u, 9.0, -0.1), pf.point(u, 9.3, -0.1), 0.1, { color: IRON });
    }
    B.block(f, [-6.6, 6.6], [0, 3.1], [0, 10.4], 0.25);
    // pediment
    const pe = (u, v, w) => f.point(u, v, w);
    b.stone.quad([pe(-6.6, 8.25, 2.8), pe(6.6, 8.25, 2.8), pe(0, 10.4, 2.8), pe(0, 10.4, 2.8)], { color: [1.04, 1, 0.94, 1], normal: f.dir(0, 0, 1) });
    for (let s = 0; s < 4; s += 1) fbox(b.stone, f, 0, 0.1 + s * 0.14, 2.5 + (3 - s) * 0.55, 12.4, 0.14, 0.55, [0.92, 0.88, 0.82, 1]);
    for (const u of [-7.3, -4.6, 4.6, 7.3]) {
      windowAt(f, u, 1.0, 1.2, 2.8, false);
      for (let k = -2; k <= 2; k += 1) fbox(b.wash, f, u + k * 0.24, 2.4, 0.2, 0.05, 2.9, 0.05, IRON);
    }
    // vault door: heavy dark leaf with a bright rim
    fbox(b.wash, f, 0, 2.3, 0.08, 3.0, 4.4, 0.1, [0.1, 0.1, 0.13, 1]);
    fbox(b.stone, f, 0, 4.7, 0.16, 3.5, 0.3, 0.3, [0.95, 0.9, 0.84, 1]);
    lampHeads.push({ at: f.point(-2.5, 4.1, 0.9), color: [1.6, 1.0, 0.5], kind: 'lantern', size: 0.22 }, { at: f.point(2.5, 4.1, 0.9), color: [1.6, 1.0, 0.5], kind: 'lantern', size: 0.22 });
    fbox(b.wash, f, 0, customs.H + 5, -4, 0.14, 10, 0.14, IRON);
    b.cloth.quad([f.point(0.07, customs.H + 9.6, -4), f.point(0.07, customs.H + 8.2, -4), f.point(0.07, customs.H + 8.2, -1.7), f.point(0.07, customs.H + 9.6, -1.7)], { color: [0.8, 0.14, 0.14, 1] });
    // the hanging sign sits at the south end of the frontage, clear of the columns
    const hf = frame(...f.point(7.8, 0, 0).filter((_, i) => i !== 1), f.yaw);
    B.hanging(hf, 'customs-hang', 0, 4.8);
  }
  house({ x: 10, z: 7.75, yaw: W_, W: 4.5, D: 12, floors: 3, wall: 'brickYellow', color: [1, 0.95, 0.9, 1] });
  const post = house({ x: 10, z: -2, yaw: W_, W: 15, D: 12, floors: 3, wall: 'brickRed', color: [1.0, 0.9, 0.86, 1], nChimney: 2, fascia: 'post-fascia', hang: { id: 'post-hang', u: 5.6 }, doorColor: [0.7, 0.1, 0.12, 1], litBias: 0.05 });
  {
    const f = post.f;
    b.wash.quad([f.point(-7.5, 0.6, 0.02), f.point(7.5, 0.6, 0.02), f.point(7.5, 3.6, 0.02), f.point(-7.5, 3.6, 0.02)], { color: [0.95, 0.2, 0.2, 1], normal: f.dir(0, 0, 1) });
    // gold crown plaque over the door
    fbox(b.wash, f, 0, 3.2, 0.12, 0.9, 0.6, 0.1, [1.2, 0.9, 0.3, 1]);
    // red pillar box on the pavement
    const p = f.point(2.6, 0, 1.2);
    b.wash.cylinder({ c: [p[0], 0.8, p[2]], r: 0.5, h: 1.6, seg: 12, color: [0.86, 0.1, 0.12, 1] });
    b.wash.cylinder({ c: [p[0], 1.72, p[2]], r: 0.5, rTop: 0.2, h: 0.2, seg: 12, color: [0.8, 0.08, 0.1, 1] });
    fbox(b.wash, f, 2.6, 1.3, 1.7, 0.5, 0.08, 0.06, [0.05, 0.03, 0.03, 1]);
    fbox(b.wash, f, 2.6, 0.12, 1.2, 1.1, 0.24, 1.1, [0.3, 0.3, 0.34, 1]);
  }
  house({ x: 10, z: -16, yaw: W_, W: 13, D: 12, floors: 3, wall: 'brickYellow', color: [1, 0.94, 0.88, 1], nChimney: 2, fascia: 'chemist', litBias: 0.2, awn: stripes([0.2, 0.4, 0.34, 1], cream) });
  house({ x: 10, z: -27.25, yaw: W_, W: 9.5, D: 12, floors: 3, wall: 'brickRed', color: [0.95, 0.88, 0.84, 1], fascia: 'bakery', litBias: 0.2, awn: stripes([0.62, 0.22, 0.3, 1], cream) });

  // ---- second tier facing the east lane, and west of the street ----
  const lane = [-27, -17, -7, 3, 13, 23];
  lane.forEach((z, i) => house({ x: 32, z, yaw: E, W: 10, D: 8, floors: 3 + (i % 2), wall: i % 2 ? 'brickYellow' : 'brickRed', color: [1, 0.93 + (i % 3) * 0.03, 0.9, 1], nChimney: 1, litBias: 0.1 }));
  const west = [-27, -17, -7, 3, 13, 23];
  west.forEach((z, i) => house({ x: -32, z, yaw: W_, W: 10, D: 10, floors: 3 + (i % 3 === 0 ? 1 : 0), wall: i % 2 ? 'brickRed' : 'brickYellow', color: [0.96, 0.9, 0.88, 1], nChimney: 1, sides: false, litBias: -0.1 }));

  // ---- warehouses: tall brick, loading doors, hoist beams ----
  const hoist = (f, u, H, floors, gf, fh) => {
    // timber beam out from the gable with a pulley, rope and hook, plus a column of loading doors
    fbox(b.plank, f, u, H + 1.0, 1.2, 0.3, 0.34, 3.4, [0.8, 0.62, 0.46, 1]);
    fbox(b.plank, f, u, H + 0.4, 0.05, 0.5, 1.4, 0.3, [0.7, 0.55, 0.42, 1]);
    fbox(b.wash, f, u, H + 0.8, 2.9, 0.1, 0.7, 0.1, IRON);
    fbox(b.wash, f, u, H - 1.4, 2.9, 0.04, 4.2, 0.04, [0.78, 0.7, 0.55, 1]);
    for (let k = 1; k <= floors; k += 1) {
      const v = gf + fh * (k - 1) + 0.4;
      fbox(b.wash, f, u, v + 1.1, 0.07, 1.7, 2.2, 0.1, [0.32, 0.2, 0.14, 1]);
      fbox(b.stone, f, u, v + 2.35, 0.13, 2.1, 0.24, 0.22, [0.9, 0.86, 0.8, 1]);
    }
    hoistPoints.push(f.point(u, H - 1.4, 2.9));
  };
  const warehouse = (spec, hoistU = null) => {
    const w = house({ roof: 'along', rise: 0.2, floors: 5, gf: 5, fh: 3.6, litBias: -0.3, shopFronts: false, nChimney: 1, ...spec });
    if (hoistU !== null) hoist(w.f, hoistU, w.H, 4, w.gf, w.fh);
    return w;
  };
  warehouse({ x: 41.5, z: -21, yaw: W_, W: 22, D: 14, wall: 'brickYellow', color: [0.95, 0.82, 0.74, 1], fascia: 'bonded', doorColor: [0.3, 0.2, 0.14, 1] }, 5);
  warehouse({ x: 41.5, z: 2, yaw: W_, W: 24, D: 14, wall: 'brickRed', color: [0.88, 0.76, 0.72, 1], fascia: 'tea', doorColor: [0.3, 0.2, 0.14, 1] }, -5);
  warehouse({ x: 41.5, z: 20.5, yaw: W_, W: 13, D: 14, wall: 'brickYellow', color: [0.92, 0.82, 0.76, 1], fascia: 'server-fascia', doorColor: [0.12, 0.3, 0.2, 1] });
  // quayside warehouses with the hoist over the water side
  const westWh = warehouse({ x: -30, z: 38, yaw: E, W: 14, D: 14, floors: 4, wall: 'brickRed', color: [0.9, 0.78, 0.74, 1], fascia: 'wharfinger', back: true, doorColor: [0.3, 0.2, 0.14, 1] }, 3);
  const eastWh = warehouse({ x: 42, z: 38, yaw: W_, W: 14, D: 14, floors: 4, wall: 'brickYellow', color: [0.94, 0.84, 0.76, 1], fascia: 'cooper', back: true, doorColor: [0.3, 0.2, 0.14, 1] }, -3);
  void westWh;
  void eastWh;
  // ---- telegraph poles and wires leading to the office ----
  const poles = [];
  poles.push([-29, 32.8], [-21.5, 32], [-13.5, 31.4]);
  for (const [x, z] of poles) {
    b.plank.cylinder({ c: [x, 4.0, z], r: 0.1, h: 8.0, seg: 7, color: [0.62, 0.48, 0.38, 1] });
    fbox(b.wash, frame(x, z, 0), 0, 8.5, 0, 1.8, 0.12, 0.12, IRON);
    fbox(b.wash, frame(x, z, 0), 0, 7.6, 0, 1.4, 0.1, 0.1, IRON);
  }
  const wire = (a, c, y) => {
    for (const dy of [0, -0.9]) {
      let prev = [a[0], y + dy, a[1]];
      for (let s = 1; s <= 4; s += 1) {
        const t = s / 4;
        const p = [a[0] + (c[0] - a[0]) * t, y + dy - Math.sin(t * Math.PI) * 0.45, a[1] + (c[1] - a[1]) * t];
        b.wash.bar(prev, p, 0.035, { color: IRON });
        prev = p;
      }
    }
  };
  for (let i = 0; i < poles.length - 1; i += 1) wire(poles[i], poles[i + 1], 8.5);
  // last span climbs from the end pole to the office mast
  {
    const mast = telegraph.f.point(6, 0, -6);
    const last = poles[poles.length - 1];
    for (const dy of [0, -0.9]) {
      let prev = [last[0], 8.5 + dy, last[1]];
      for (let k = 1; k <= 5; k += 1) {
        const t = k / 5;
        const p = [last[0] + (mast[0] - last[0]) * t, 8.5 + dy + (telegraph.H + 7.0 - 8.5) * t - Math.sin(t * Math.PI) * 0.4, last[1] + (mast[2] - last[1]) * t];
        b.wash.bar(prev, p, 0.035, { color: IRON });
        prev = p;
      }
    }
  }

  return { B, lampHeads, crates, smokePoints, hoistPoints, doorWalls, chimneys: B.chimneys, telegraph, customs, police, post, pub };
}
