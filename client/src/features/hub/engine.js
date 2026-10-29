import { Engine } from '@babylonjs/core/Engines/engine.js';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine.js';
// every webgpu engine extension, since deep imports skip the ones the engine file does not pull in
import '@babylonjs/core/Engines/WebGPU/Extensions/index.js';
import { Scene } from '@babylonjs/core/scene.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import '@babylonjs/core/Physics/physicsEngineComponent.js';
import '@babylonjs/core/Meshes/instancedMesh.js';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin.js';
import HavokPhysics from '@babylonjs/havok';
import havokWasm from '@babylonjs/havok/lib/esm/HavokPhysics.wasm?url';
import { getTier } from './scenes/shared/quality.js';
import { createSampler, realSamplingOff } from './perfWatch.js';

// counted across instances so a remount can prove the previous hub was disposed
let mountCount = 0;
let disposalCount = 0;

let hkPromise = null;
function loadHavok() {
  hkPromise ??= HavokPhysics({ locateFile: () => havokWasm });
  return hkPromise;
}

function freshCanvas(old) {
  const next = document.createElement('canvas');
  for (const { name, value } of old.attributes) next.setAttribute(name, value);
  old.replaceWith(next);
  return next;
}

async function createEngine(canvas, params) {
  if (params.get('renderer') !== 'webgl2' && navigator.gpu) {
    try {
      if (await WebGPUEngine.IsSupportedAsync) {
        // shader compilers would default to a cdn; point them at this origin so nothing leaves it
        const gpu = new WebGPUEngine(canvas, {
          antialias: true,
          adaptToDeviceRatio: false,
          glslangOptions: { jsPath: '/_no-cdn/glslang.js', wasmPath: '/_no-cdn/glslang.wasm' },
          twgslOptions: { jsPath: '/_no-cdn/twgsl.js', wasmPath: '/_no-cdn/twgsl.wasm' },
        });
        try {
          await gpu.initAsync();
          return { engine: gpu, type: 'webgpu', canvas };
        } catch (error) {
          console.warn('webgpu init failed, falling back to webgl2', error);
          gpu.dispose();
          // a canvas that requested a webgpu context cannot hand out webgl2
          canvas = freshCanvas(canvas);
        }
      }
    } catch (error) {
      console.warn('webgpu probe failed, falling back to webgl2', error);
    }
  }
  const gl = new Engine(canvas, true, { antialias: true, stencil: true, powerPreference: 'high-performance' }, false);
  return { engine: gl, type: 'webgl2', canvas };
}

// quality: the Graphics setting, auto, high, medium or low
// watch: sample real frame rates and report them through onPerf({ fps, tier })
// resumeAt: { x, z } to start where the player stood before a rebuild
// params: URLSearchParams with the dev overrides renderer, tier and mirror
// joystick: { el, knob } elements of the touch pad, owned by the caller
// spawnAt: destination id whose door the player starts beside, for coming back from a game
export function createHub({ container, joystick = {}, params = new URLSearchParams(), spawnAt = null, quality = 'auto', watch = false, resumeAt = null, onPerf = () => {}, onState = () => {} }) {
  const tier = getTier(params, quality);
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const state = {
    ready: false,
    engine: null,
    scene: null,
    fps: 0,
    selected: null,
    nearDoor: null,
    nearNpc: null,
    mode: 'explore',
    panelFor: null,
    drawCalls: 0,
    triangles: 0,
    trianglesAllPasses: 0,
    paused: false,
    inputPaused: false,
    reducedMotion: motionQuery.matches,
    get mounts() {
      return mountCount;
    },
    get disposals() {
      return disposalCount;
    },
  };
  const emit = () => onState(state);

  let canvas = document.createElement('canvas');
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Interactive 3D view of the Thames Wharf. Use the destination buttons to choose a place, or move Sharlock with WASD or the arrow keys.');
  canvas.className = 'hub-canvas';
  container.append(canvas);

  let disposed = false;
  let torn = false;
  let engine = null;
  let engineType = null;
  let scene = null;
  let built = null;
  let observer = null;
  let fpsTimer = null;
  const manualWatch = realSamplingOff();
  const perf = watch ? createSampler({ onResult: (fps) => onPerf({ fps, tier: tier.name }) }) : null;
  const onMotion = (event) => {
    state.reducedMotion = event.matches;
    emit();
  };
  motionQuery.addEventListener('change', onMotion);

  const api = () => built?.api ?? null;

  async function start() {
    const created = await createEngine(canvas, params);
    engine = created.engine;
    engineType = created.type;
    canvas = created.canvas;
    if (disposed) return;

    const applyScale = () => engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, tier.renderScale));
    observer = new ResizeObserver(() => {
      applyScale();
      engine.resize();
    });
    applyScale();
    observer.observe(container);

    scene = new Scene(engine);
    const hk = await loadHavok();
    if (disposed) return;
    scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, hk));
    const { build } = await import('./scenes/a-wharf.js');
    if (disposed) return;
    built = await build({ engine, scene, canvas, state, notify: emit, params, joystick, spawnAt, quality, resumeAt });
    if (disposed) return;

    const rendered = new Promise((resolve) => scene.onAfterRenderObservable.addOnce(resolve));
    // the low tier renders every other frame
    let lastFrame = 0;
    let lastTick = performance.now();
    engine.runRenderLoop(() => {
      if (tier.fpsCap) {
        const now = performance.now();
        if (now - lastFrame < 1000 / tier.fpsCap - 3) return;
        lastFrame = now;
      }
      scene.render();
      if (perf && !manualWatch) {
        const tick = performance.now();
        perf.frame(tick - lastTick, !document.hidden && state.ready && state.mode === 'explore' && !state.inputPaused);
        lastTick = tick;
      }
    });
    fpsTimer = setInterval(() => {
      state.fps = Math.round(engine.getFps());
      emit();
    }, 500);
    state.engine = engineType;
    state.scene = 'wharf';
    mountCount += 1;
    if (state.inputPaused) built.api.setInputPaused(true);
    if (state.selected) built.api.select(state.selected);
    await rendered;
    if (disposed) return;
    state.ready = true;
    emit();
  }

  // the build can fail halfway, so teardown must cope with any missing piece
  function teardown() {
    if (torn) return;
    torn = true;
    clearInterval(fpsTimer);
    observer?.disconnect();
    motionQuery.removeEventListener('change', onMotion);
    engine?.stopRenderLoop();
    try {
      built?.dispose?.();
    } catch (error) {
      console.warn('hub scene teardown', error);
    }
    scene?.dispose();
    engine?.dispose();
    if (engineType === 'webgl2') canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
    canvas.remove();
    state.ready = false;
    state.scene = null;
    state.fps = 0;
    disposalCount += 1;
    if (import.meta.env.DEV && window.__hub?.state === state) delete window.__hub;
    emit();
  }

  const ready = start().catch((error) => {
    if (!disposed) console.error('hub failed to start', error);
    disposed = true;
    teardown();
    throw error;
  });
  // a hub nobody awaits must not raise an unhandled rejection
  ready.catch(() => {});

  const hub = {
    state,
    ready,
    select(id) {
      // the enter and return flights own the camera, so picks wait for explore
      if (state.mode !== 'explore') return;
      state.selected = id;
      api()?.select(id);
      emit();
    },
    enter: (id) => api()?.enter(id) ?? Promise.resolve(false),
    back: () => api()?.back() ?? Promise.resolve(false),
    resetCamera: () => api()?.resetCamera(),
    position: () => api()?.debug.position() ?? null,
    pauseInput(value) {
      state.inputPaused = Boolean(value);
      api()?.setInputPaused(state.inputPaused);
      emit();
    },
    dispose() {
      disposed = true;
      // wait for an in flight build to stop before tearing down what it is still creating
      ready.then(teardown, teardown);
    },
  };

  if (import.meta.env.DEV) {
    window.__hub = {
      state,
      select: hub.select,
      enter: hub.enter,
      back: hub.back,
      resetCamera: hub.resetCamera,
      pauseInput: hub.pauseInput,
      get debug() {
        const debug = api()?.debug;
        return debug ? { ...debug, simulateFps: (fps) => perf?.feed(fps) } : null;
      },
    };
  }
  return hub;
}
