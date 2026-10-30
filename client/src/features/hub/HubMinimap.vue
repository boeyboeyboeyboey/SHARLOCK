<script setup>
import { computed, nextTick, onMounted, ref, shallowRef } from 'vue'
import { contextBlocks, footprint, mapBounds, mapSize, percentOf, pointsAttr, project, projectRect, shortLabel, wedgePoints } from './minimap.js'

const props = defineProps({
  games: { type: Array, required: true },
  // { x, z, heading } in world metres, or null before the first sample
  player: { type: Object, default: null },
  selected: { type: String, default: null },
  // classmates as { sid, x, z, staff }, drawn as small unnamed dots
  peers: { type: Array, default: () => [] },
})
const emit = defineEmits(['choose'])

// layout.js pulls in babylon's maths, so it loads here (after the hub engine) instead of with the page
const layout = shallowRef(null)
const open = ref(false)
const panel = ref(null)
const toggle = ref(null)
const closer = ref(null)

onMounted(async () => {
  layout.value = await import('./scenes/wharf/layout.js')
})

const rects = (list) => list.map((r) => projectRect(r))
const ground = computed(() => (layout.value ? rects(layout.value.floors) : []))
const streets = computed(() => (layout.value ? rects(Object.values(layout.value.streets)) : []))
const blocks = computed(() => rects(contextBlocks))
const river = computed(() => {
  if (!layout.value) return null
  return projectRect({ x0: mapBounds.x0, x1: mapBounds.x1, z0: layout.value.quayZ, z1: mapBounds.z1 })
})
const quay = computed(() => (layout.value ? project(0, layout.value.quayZ).y : 0))
// only destinations the games list knows about get a marker
const pins = computed(() => {
  if (!layout.value) return []
  return layout.value.destinations.flatMap((dest) => {
    const game = props.games.find((g) => g.id === dest.id)
    if (!game) return []
    const fp = footprint(dest)
    return [
      {
        id: dest.id,
        name: game.name,
        label: shortLabel(dest.id, game.name),
        accent: dest.accent,
        rect: projectRect(fp),
        at: percentOf(fp.cx, fp.cz),
      },
    ]
  })
})
const others = computed(() =>
  props.peers.map((peer) => {
    const p = project(peer.x, peer.z)
    return { sid: peer.sid, x: p.x, y: p.y, staff: Boolean(peer.staff) }
  }),
)
const me = computed(() => {
  if (!props.player) return null
  const p = project(props.player.x, props.player.z)
  return { x: p.x, y: p.y, wedge: pointsAttr(wedgePoints(p.x, p.y, props.player.heading)) }
})

async function openMap() {
  open.value = true
  await nextTick()
  closer.value?.focus()
}

function closeMap() {
  if (!open.value) return
  open.value = false
  nextTick(() => toggle.value?.focus())
}

function pick(id) {
  emit('choose', id)
  closeMap()
}

// the overlay keeps keyboard focus and owns Escape; on desktop Escape still reaches the hub
function onKeydown(event) {
  if (!open.value) return
  if (event.key === 'Escape') {
    event.stopPropagation()
    closeMap()
    return
  }
  if (event.key !== 'Tab') return
  const items = [...panel.value.querySelectorAll('button')]
  if (!items.length) return
  const first = items[0]
  const last = items[items.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
</script>

<template>
  <div class="hub-map-root">
    <button
      ref="toggle"
      type="button"
      class="btn btn-secondary btn-sm hub-map-toggle hub-glass-btn hub-glass"
      data-testid="hub-map-toggle"
      aria-label="Open map"
      :aria-expanded="String(open)"
      @click="openMap"
    >
      Map
    </button>
    <section
      ref="panel"
      class="hub-map hub-glass"
      :class="{ 'is-open': open }"
      data-testid="hub-minimap"
      role="region"
      aria-label="Map"
      @keydown="onKeydown"
    >
      <div class="hub-map-head">
        <span class="hub-map-title">Map</span>
        <button ref="closer" type="button" class="btn btn-secondary btn-sm hub-glass-btn" data-testid="hub-map-close" @click="closeMap">
          Close
        </button>
      </div>
      <div class="hub-map-body">
        <div class="hub-map-box" :style="{ '--ratio': mapSize.width / mapSize.height }">
          <svg
            v-if="layout"
            class="hub-map-svg"
            :viewBox="`0 0 ${mapSize.width} ${mapSize.height}`"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <rect class="m-land" x="0" y="0" :width="mapSize.width" :height="mapSize.height" />
            <rect v-if="river" class="m-river" v-bind="river" />
            <rect v-for="(r, i) in blocks" :key="`b${i}`" class="m-block" v-bind="r" />
            <rect v-for="(r, i) in streets" :key="`s${i}`" class="m-street" v-bind="r" />
            <rect v-for="(r, i) in ground" :key="`g${i}`" class="m-floor" v-bind="r" />
            <line class="m-quay" x1="0" :x2="mapSize.width" :y1="quay" :y2="quay" />
            <rect
              v-for="pin in pins"
              :key="pin.id"
              class="m-building"
              :class="{ 'is-selected': selected === pin.id }"
              v-bind="pin.rect"
              :style="{ '--accent': pin.accent }"
            />
            <circle
              v-for="peer in others"
              :key="peer.sid"
              class="m-peer"
              :class="{ 'is-staff': peer.staff }"
              :cx="peer.x"
              :cy="peer.y"
              r="1.7"
            />
            <g v-if="me" class="m-me">
              <polygon class="m-wedge" :points="me.wedge" />
              <circle class="m-dot" :cx="me.x" :cy="me.y" r="2.3" />
            </g>
          </svg>
          <button
            v-for="pin in pins"
            :key="pin.id"
            type="button"
            class="hub-map-pin"
            :class="{ 'is-selected': selected === pin.id }"
            :data-testid="`hub-map-${pin.id}`"
            :aria-label="`Travel to ${pin.name}`"
            :aria-pressed="String(selected === pin.id)"
            :style="{ left: `${pin.at.left}%`, top: `${pin.at.top}%`, '--accent': pin.accent }"
            @click="pick(pin.id)"
          >
            <span class="hub-map-dot" aria-hidden="true"></span>
            <span class="hub-map-label" aria-hidden="true">{{ pin.label }}</span>
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.hub-map-root {
  display: contents;
}
.hub-map-toggle {
  display: none;
}
.hub-map {
  position: absolute;
  right: 8px;
  bottom: 8px;
  z-index: 2;
  width: 132px;
  padding: 6px;
}
.hub-map-head {
  display: none;
}
.hub-map-body {
  display: grid;
  place-items: center;
}
.hub-map-box {
  --hit: 24px;
  position: relative;
  width: 100%;
  aspect-ratio: var(--ratio);
  overflow: hidden;
  border: 1px solid var(--hub-glass-edge);
  border-radius: calc(var(--hub-glass-radius) - 4px);
  background: #c9b88f;
}
.hub-map-svg {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}
.m-land {
  fill: #c9b88f;
}
.m-river {
  fill: #7ba7bd;
}
.m-block {
  fill: #a8987a;
}
.m-street {
  fill: #ead9b0;
}
.m-floor {
  fill: #f1e6c4;
}
.m-quay {
  stroke: #5b5340;
  stroke-width: 0.8;
}
.m-building {
  fill: var(--accent);
  fill-opacity: 0.55;
  stroke: #3a2f27;
  stroke-width: 0.7;
}
.m-building.is-selected {
  fill-opacity: 0.9;
  stroke: #fff8df;
  stroke-width: 1.6;
  paint-order: stroke;
}
.m-peer {
  fill: #d9822b;
  stroke: #fff8df;
  stroke-width: 0.6;
}
.m-peer.is-staff {
  fill: #8a3fd0;
}
.m-wedge {
  fill: #2f6fdc;
  fill-opacity: 0.45;
}
.m-dot {
  fill: #2f6fdc;
  stroke: #fff8df;
  stroke-width: 0.9;
}
.hub-map-pin {
  position: absolute;
  display: grid;
  place-items: center;
  width: var(--hit);
  height: var(--hit);
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  transform: translate(-50%, -50%);
  cursor: pointer;
}
.hub-map-dot {
  width: 12px;
  height: 12px;
  border: 2px solid var(--town-edge);
  border-radius: 50%;
  background: var(--accent);
}
.hub-map-pin.is-selected .hub-map-dot {
  box-shadow: 0 0 0 2px var(--accent-primary), 0 0 0 4px var(--town-edge);
}
.hub-map-label {
  position: absolute;
  top: calc(50% + 7px);
  left: 50%;
  padding: 0 3px;
  border: 1px solid var(--town-edge);
  background: var(--town-paper);
  color: var(--town-edge);
  font-size: 10px;
  line-height: 1.3;
  white-space: nowrap;
  transform: translateX(-50%);
  pointer-events: none;
}
.hub-map-pin.is-selected .hub-map-label {
  background: var(--accent-primary);
}
.hub-map-pin:focus-visible {
  outline: 3px solid var(--town-edge);
  outline-offset: 0;
}
@media (min-width: 768px) {
  .hub-map {
    width: 140px;
  }
}
/* tall desktop windows have room under the destination list for a readable map */
@media (min-width: 1200px) and (min-height: 860px) {
  .hub-map {
    width: 184px;
  }
}
/* phones, touch screens and short windows: a Map button opens the map over the whole scene, with 44px pins */
@media (max-width: 575.98px), (max-height: 639.98px), (pointer: coarse) {
  .hub-map-toggle {
    position: absolute;
    right: 8px;
    bottom: 8px;
    z-index: 2;
    display: inline-flex;
    min-height: 44px;
    align-items: center;
  }
  .hub-map {
    display: none;
  }
  .hub-map.is-open {
    inset: 0;
    z-index: 5;
    display: flex;
    flex-direction: column;
    width: auto;
    /* the floating menu and mode controls sit over the top edge, so the map starts below them */
    padding: 64px 8px 8px;
    border-width: 0;
    border-radius: 0;
  }
  .hub-map-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 8px;
  }
  .hub-map-title {
    font-weight: 700;
  }
  .hub-map-head .btn {
    min-height: 44px;
    min-width: 72px;
  }
  .hub-map-body {
    flex: 1 1 auto;
    min-height: 0;
    container-type: size;
  }
  .hub-map-box {
    --hit: 44px;
    width: min(100cqw, calc(100cqh * var(--ratio)));
  }
  .hub-map-dot {
    width: 18px;
    height: 18px;
  }
  .hub-map-label {
    top: calc(50% + 11px);
    font-size: 12px;
  }
}
/* on a phone the right column under the toolbar is free, the bottom edge belongs to the destination list */
@media (max-width: 575.98px) {
  .hub-map-toggle {
    top: 64px;
    bottom: auto;
  }
}
</style>
