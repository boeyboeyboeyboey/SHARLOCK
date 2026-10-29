<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getDeviceCheck } from '../hub/deviceCheck.js'
import { readGraphics } from '../hub/graphics.js'
import { createSampler, decidePerf, realSamplingOff } from '../hub/perfWatch.js'
import { getTier } from '../hub/scenes/shared/quality.js'
import { readStoredMode, resolveMode } from '../legacy-town/useTownMode.js'
import { decideRender, fallbackGradient, stillUrl } from './renderMode.js'
import { roomFor } from './rooms/index.js'
import { createInterior } from './useInteriorEngine.js'

const route = useRoute()
const roomId = computed(() => String(route.meta.interior ?? ''))
const room = computed(() => roomFor(roomId.value))

const device = getDeviceCheck()
const stored = readStoredMode()
const failed = ref(false)
const slow = ref(false)
const stillMissing = ref(false)
const canvas = ref(null)
const tier = getTier(new URLSearchParams(window.location.search), readGraphics())
const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

const townMode = computed(() => resolveMode({ stored, device, failed: failed.value }).mode)
const renderMode = computed(() =>
  room.value
    ? decideRender({
        townMode: townMode.value,
        tierName: tier.name,
        reducedMotion: reducedQuery.matches,
        failed: failed.value,
        slow: slow.value,
      })
    : 'still',
)
const gradient = computed(() => fallbackGradient(room.value?.palette))
const stage = computed(() => (renderMode.value === 'still' ? 'still' : '3d'))

let interior = null
const manualWatch = realSamplingOff()
let sampler = null

function stop() {
  interior?.dispose()
  interior = null
}

async function start() {
  stop()
  stillMissing.value = false
  if (renderMode.value === 'still') return
  await nextTick()
  if (!canvas.value || renderMode.value === 'still') return
  if (!manualWatch) {
    sampler = createSampler({
      onResult: (fps) => {
        if (
          decidePerf({ tier: tier.name, fps, explicit3d: stored === '3d' }).action === 'switch-2d'
        )
          slow.value = true
      },
    })
  }
  interior = createInterior({
    canvas: canvas.value,
    roomId: roomId.value,
    tier,
    renderMode: renderMode.value,
    onFailed: () => (failed.value = true),
    onPerf: (ms) => sampler?.frame(ms, !document.hidden),
  })
}

onMounted(start)
watch([roomId, renderMode], start)
onBeforeUnmount(stop)
</script>

<template>
  <div
    class="interior"
    :data-room="roomId"
    :data-stage="stage"
    :data-tier="tier.name"
    data-testid="interior"
  >
    <div class="interior-stage" aria-hidden="true">
      <canvas
        v-if="stage === '3d'"
        :key="roomId"
        ref="canvas"
        class="interior-canvas"
        data-testid="interior-canvas"
      ></canvas>
      <template v-else>
        <div
          class="interior-fallback"
          :style="{ background: gradient }"
          data-testid="interior-fallback"
        ></div>
        <img
          v-if="roomId && !stillMissing"
          class="interior-still"
          :src="stillUrl(roomId)"
          alt=""
          data-testid="interior-still"
          @error="stillMissing = true"
        />
      </template>
    </div>
    <div class="interior-desk" data-testid="interior-desk">
      <RouterView />
    </div>
  </div>
</template>

<style scoped>
/* the layout cancels the workspace padding and the desk repeats it, so a game that bleeds by the
   workspace gutter (a negative margin) lines up with the desk's inner edge without any clipping.
   --gutter, --pt and --pb mirror .portal-main's padding at each breakpoint */
.interior {
  --gutter: 1.15rem;
  --pt: 1.6rem;
  --pb: 3rem;
  --room-gap: clamp(24px, 3vw, 48px);
  /* the room shrinks vertically on short windows so fitted games keep their height */
  --room-gap-y: clamp(0px, calc((100dvh - 700px) / 4), var(--room-gap));
  --room-wood: #3b2a1d;
  position: relative;
  isolation: isolate;
  margin: calc(-1 * var(--pt)) calc(-1 * var(--gutter)) calc(-1 * var(--pb));
}

@media (min-width: 576px) {
  .interior {
    --gutter: 2rem;
    --pt: 2rem;
  }
}

@media (min-width: 768px) {
  .interior {
    --gutter: 1.8rem;
    --pt: 2.2rem;
  }
}

@media (min-width: 992px) {
  .interior {
    --gutter: 2.8rem;
    --pt: 2.5rem;
  }
}

@media (min-width: 1200px) {
  .interior {
    --gutter: 3.5rem;
  }
}

/* the same pages the shell trims on laptop-height windows */
@media (min-width: 768px) and (min-height: 600px) {
  .interior:has(.case-preview, .is-fitted, .auth-page, .profile-view, .cohort-page) {
    --pt: 0.75rem;
    --pb: 1rem;
  }
}

.interior-stage {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  background: #14100d;
  pointer-events: none;
}

.interior-canvas,
.interior-still,
.interior-fallback {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.interior-still {
  object-fit: cover;
}

.interior[data-tier='desktop'] .interior-canvas,
.interior[data-tier='compact'] .interior-canvas,
.interior-still {
  filter: blur(1.5px);
  transform: scale(1.03);
}

.interior-desk {
  position: relative;
  background: var(--bg-primary);
  /* the frame is a ring outside the box, so the desk's own box is exactly the game's container */
  box-shadow:
    0 0 0 3px var(--room-wood),
    0 10px 40px rgb(0 0 0 / 0.45);
  min-width: 0;
  padding: var(--pt) var(--gutter) var(--pb);
}

/* phones: the room is a header band above the game panel */
@media (max-width: 767.98px) {
  .interior-stage {
    position: relative;
    height: 150px;
  }

  .interior-desk {
    box-shadow: 0 -3px 0 var(--room-wood);
  }
}

@media (min-width: 768px) {
  .interior {
    padding: var(--room-gap-y) 0;
  }

  .interior-desk {
    margin-inline: var(--room-gap);
  }
}

/* fitted games measure the window minus the shell, so the room gap comes off that too; on windows under 700px high the room gap and frame go and the game gets the old size */
@media (min-width: 768px) and (min-height: 600px) {
  .interior-desk {
    --shell-chrome: calc(176px + 2 * var(--room-gap-y));
  }
}

@media (min-width: 768px) and (min-height: 600px) and (max-height: 699.98px) {
  .interior-desk {
    --shell-chrome: 176px;
    margin-inline: 0;
    box-shadow: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .interior-canvas,
  .interior-still {
    transform: none;
  }
}
</style>
