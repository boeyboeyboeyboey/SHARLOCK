import { lowerTier, readPerf } from './perfWatch.js';

// instant device checks: one cheap probe per page load decides 3d or 2d and how heavy the 3d may be
export const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software|microsoft basic render/i;
const FORCE_KEY = 'sharlock.hubForce3d';
let signalsProbe;

// pure decision from already gathered signals
export function evaluateDevice({ webgl2, softwareRenderer = false, phone = false, saveData = false, deviceMemory, cores, baseTier = 'desktop' }) {
  if (!webgl2) return { verdict: '2d', tier: baseTier, reasons: ['no-webgl2'] };
  if (softwareRenderer) return { verdict: '2d', tier: baseTier, reasons: ['software-renderer'] };
  // a phone opens the 2d map unless the player chooses 3d
  if (phone) return { verdict: '2d', tier: baseTier, reasons: ['phone'] };
  const reasons = [];
  if (saveData) reasons.push('save-data');
  if (typeof deviceMemory === 'number' && deviceMemory <= 2) reasons.push('low-memory');
  if (typeof cores === 'number' && cores <= 2) reasons.push('low-cores');
  return { verdict: '3d', tier: reasons.length ? 'low' : baseTier, reasons };
}

function loseContext(gl) {
  try {
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    // a context that is already gone needs no cleanup
  }
}

// creates throwaway webgl2 contexts on detached canvases and releases them again
export function probeGraphics(doc = document) {
  const open = (attributes) => {
    try {
      return doc.createElement('canvas').getContext('webgl2', attributes) ?? null;
    } catch {
      return null;
    }
  };
  const gl = open();
  if (!gl) return { webgl2: false, softwareRenderer: false };
  let softwareRenderer = false;
  try {
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? '') : '';
    softwareRenderer = SOFTWARE_RENDERER.test(name);
  } catch {
    // the renderer string is optional
  }
  // a normal context works but a strict one is refused: the browser would render in software
  if (!softwareRenderer) {
    const strict = open({ failIfMajorPerformanceCaveat: true });
    if (strict) loseContext(strict);
    else softwareRenderer = true;
  }
  loseContext(gl);
  return { webgl2: true, softwareRenderer };
}

export function readHardware(nav = navigator) {
  return {
    saveData: Boolean(nav.connection?.saveData),
    deviceMemory: nav.deviceMemory,
    cores: nav.hardwareConcurrency,
  };
}

// the width and pointer heuristic the tiers always used
export function heuristicTier() {
  return window.matchMedia('(pointer: fine)').matches && window.innerWidth >= 900 ? 'desktop' : 'compact';
}

// a touch screen narrower than a tablet
export function isPhone() {
  return typeof matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 768;
}

// dev and test builds only: lets headless software rendering keep exercising the 3d hub
function forced3d() {
  if (!import.meta.env.DEV) return false;
  try {
    return localStorage.getItem(FORCE_KEY) === '1' || new URLSearchParams(location.search).get('hub') === 'force3d';
  } catch {
    return false;
  }
}

// folds an earlier runtime measurement into the verdict
export function applyPerf(base, perf) {
  if (!perf || base.verdict !== '3d') return base;
  if (perf.twoD) return { verdict: '2d', tier: 'low', reasons: ['slow-runtime'] };
  return { ...base, tier: lowerTier(base.tier, perf.tier) };
}

export function getDeviceCheck() {
  signalsProbe ??= { ...probeGraphics(), ...readHardware() };
  const force = forced3d();
  const signals = force ? { ...signalsProbe, webgl2: true, softwareRenderer: false } : signalsProbe;
  const base = evaluateDevice({ ...signals, phone: !force && isPhone(), baseTier: heuristicTier() });
  // an earlier visit measured this device as struggling
  return applyPerf(base, readPerf());
}

export const FORCE_3D_KEY = FORCE_KEY;
