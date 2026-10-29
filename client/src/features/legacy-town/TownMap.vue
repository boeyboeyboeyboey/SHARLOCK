<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import Panzoom from '@panzoom/panzoom'
import { TOWN_SIZE } from '../../data/gameCatalog.js'
import PixelIcon from '../../components/town/PixelIcon.vue'
import TownScenery from './TownScenery.vue'
import TownBuildingArt from './TownBuildingArt.vue'
import TownAudio from './TownAudio.vue'
import GameInfoCard from './GameInfoCard.vue'

const emit = defineEmits(['activate'])
const props = defineProps({ games: { type: Array, required: true }, soundSuspended: Boolean })
const frame = ref(null)
const viewport = ref(null)
const world = ref(null)
const scale = ref(1)
const dragging = ref(false)
const minScale = 1
const maxScale = 2
const activePointers = new Map()
let camera
let suppressClick = false
let resizeFrame
const infoCard = ref(null)
const selectedId = ref(null)
const selectedGame = computed(() => props.games.find((game) => game.id === selectedId.value))
const cardStyle = ref({ left: '12px', bottom: '12px' })
const buildingButtons = new Map()
let pinned = false
let ignoreFocus = false
let pointerDown = false
let closeTimer
let resizeObserver

function cancelClose() {
  clearTimeout(closeTimer)
}
function placeCard() {
  const button = buildingButtons.get(selectedId.value)
  const card = infoCard.value?.$el
  if (!button || !frame.value || !card) return
  if (frame.value.clientWidth < 640) {
    cardStyle.value = { left: '12px', right: '12px', bottom: '12px' }
    return
  }
  // keep cards inside the visible frame after camera transforms
  const bounds = frame.value.getBoundingClientRect()
  const anchor = button.getBoundingClientRect()
  const width = card.offsetWidth
  const height = card.offsetHeight
  let left = anchor.right - bounds.left + 10
  if (left + width > bounds.width - 12) left = anchor.left - bounds.left - width - 10
  left = Math.max(12, Math.min(left, bounds.width - width - 12))
  // the card may overlap the toolbar and controls, so clamp to the whole map panel
  const panel = frame.value.parentElement.getBoundingClientRect()
  // a card that fits stays inside the frame; only a taller one may spill over the panel
  const fits = height + 24 <= bounds.height
  const minTop = fits ? 12 : panel.top - bounds.top + 12
  const maxTop = fits ? bounds.height - height - 12 : panel.bottom - bounds.top - height - 12
  const top = Math.max(minTop, Math.min(anchor.top - bounds.top, maxTop))
  cardStyle.value = { left: `${left}px`, top: `${top}px` }
}
async function reveal(game, pin = false) {
  if (ignoreFocus || (pinned && !pin)) return
  cancelClose()
  pinned = pin
  selectedId.value = game.id
  await nextTick()
  placeCard()
  if (pin) infoCard.value?.focus()
}
function dismiss(restoreFocus = false) {
  cancelClose()
  const button = buildingButtons.get(selectedId.value)
  selectedId.value = null
  pinned = false
  if (restoreFocus) {
    ignoreFocus = true
    button?.focus({ preventScroll: true })
    ignoreFocus = false
  }
}
function focusBuilding(id) {
  ignoreFocus = true
  buildingButtons.get(id)?.focus({ preventScroll: true })
  ignoreFocus = false
}
defineExpose({ dismiss, focusBuilding })
function scheduleClose() {
  if (pinned) return
  cancelClose()
  closeTimer = setTimeout(() => dismiss(), 180)
}
function focusLeft(event) {
  if (!frame.value?.contains(event.relatedTarget) && !pinned) dismiss()
}
function pointerReveal(event, game) {
  if (event.pointerType === 'mouse' && !pointerDown) reveal(game)
}
function centerBuilding(game) {
  const button = buildingButtons.get(game.id)
  if (!camera || !button) return
  const bounds = viewport.value.getBoundingClientRect()
  const anchor = button.getBoundingClientRect()
  const pan = camera.getPan()
  const zoom = camera.getScale()
  // convert the visible offset into unscaled world coordinates; panzoom clamps the result
  camera.pan(
    pan.x + (bounds.left + bounds.width / 2 - anchor.left - anchor.width / 2) / zoom,
    pan.y + (bounds.top + bounds.height / 2 - anchor.top - anchor.height / 2) / zoom,
  )
}
function focusReveal(game) {
  // pointer focus must not open an overlay before the same tap reaches its building
  if (pointerDown || ignoreFocus) return
  centerBuilding(game)
  reveal(game)
}
function selectBuilding(event, game) {
  if (suppressClick && event.detail !== 0) return
  if (game.activation === 'direct') {
    dismiss()
    emit('activate', game.route)
  } else reveal(game, true)
}
function findBuilding(event) {
  const game = props.games.find((item) => item.id === event.target.value)
  if (!game) return
  centerBuilding(game)
  reveal(game, true)
}
function zoomBy(step) {
  if (!camera) return
  const target = Math.max(minScale, Math.min(maxScale, camera.getScale() + step))
  if (target === camera.getScale()) return
  const bounds = viewport.value.getBoundingClientRect()
  camera.zoomToPoint(target, {
    clientX: bounds.left + bounds.width / 2,
    clientY: bounds.top + bounds.height / 2,
  })
}
function resetCamera() {
  dismiss()
  camera?.reset({ animate: false })
}
function panWithKeyboard(event) {
  if (event.target !== viewport.value) return
  const offsets = {
    ArrowLeft: [64, 0],
    ArrowRight: [-64, 0],
    ArrowUp: [0, 64],
    ArrowDown: [0, -64],
  }
  if (offsets[event.key]) {
    event.preventDefault()
    dismiss()
    camera?.pan(offsets[event.key][0] / scale.value, offsets[event.key][1] / scale.value, {
      relative: true,
    })
  } else if (['+', '=', '-', '0'].includes(event.key)) {
    event.preventDefault()
    if (event.key === '0') resetCamera()
    else zoomBy(event.key === '-' ? -0.25 : 0.25)
  }
}
function startGesture(event) {
  if (event.button !== 0 || !camera) return
  if (!activePointers.size) suppressClick = false
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  pointerDown = true
  if (activePointers.size > 1) suppressClick = true
  dismiss()
  viewport.value.focus({ preventScroll: true })
  camera.handleDown(event)
}
function moveGesture(event) {
  const start = activePointers.get(event.pointerId)
  if (!start) return
  // a drag or pinch must not trigger the click emitted when the pointer is released
  if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) {
    suppressClick = true
    dragging.value = true
  }
  camera.handleMove(event)
}
function endGesture(event) {
  if (!activePointers.has(event.pointerId)) return
  camera.handleUp(event)
  activePointers.delete(event.pointerId)
  if (event.type === 'pointercancel') suppressClick = true
  if (!activePointers.size) {
    pointerDown = false
    dragging.value = false
  }
}
function cancelGestures() {
  for (const pointerId of activePointers.keys()) {
    endGesture(new PointerEvent('pointercancel', { pointerId }))
  }
}
function wheelCamera(event) {
  if (!camera) return
  dismiss()
  event.preventDefault()
  if (event.ctrlKey || event.metaKey) {
    camera.zoomWithWheel(event)
    return
  }
  let unit = 1
  if (event.deltaMode === 1) unit = 16
  else if (event.deltaMode === 2) unit = viewport.value.clientHeight
  const x = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX
  const y = event.shiftKey && !event.deltaX ? 0 : event.deltaY
  camera.pan((-x * unit) / scale.value, (-y * unit) / scale.value, { relative: true })
}
function cameraChanged(event) {
  scale.value = event.detail.scale
  placeCard()
}
function resizeCamera() {
  cancelAnimationFrame(resizeFrame)
  resizeFrame = requestAnimationFrame(() => {
    const pan = camera.getPan()
    camera.pan(pan.x, pan.y)
    placeCard()
  })
}
onMounted(() => {
  // panzoom owns drag, pinch, focal zoom and boundary math for the town canvas
  camera = Panzoom(world.value, {
    canvas: true,
    cursor: 'grab',
    contain: 'outside',
    minScale,
    maxScale,
    animate: false,
    noBind: true,
    overflow: 'clip',
    handleStartEvent: (event) => event.preventDefault(),
  })
  world.value.addEventListener('panzoomchange', cameraChanged)
  viewport.value.addEventListener('wheel', wheelCamera, { passive: false })
  document.addEventListener('pointermove', moveGesture)
  document.addEventListener('pointerup', endGesture)
  document.addEventListener('pointercancel', endGesture)
  document.addEventListener('pointerleave', cancelGestures)
  window.addEventListener('blur', cancelGestures)
  resizeObserver = new ResizeObserver(resizeCamera)
  resizeObserver.observe(viewport.value)
})
onBeforeUnmount(() => {
  cancelClose()
  cancelAnimationFrame(resizeFrame)
  resizeObserver?.disconnect()
  cancelGestures()
  document.removeEventListener('pointermove', moveGesture)
  document.removeEventListener('pointerup', endGesture)
  document.removeEventListener('pointercancel', endGesture)
  document.removeEventListener('pointerleave', cancelGestures)
  window.removeEventListener('blur', cancelGestures)
  viewport.value.removeEventListener('wheel', wheelCamera)
  world.value.removeEventListener('panzoomchange', cameraChanged)
  camera?.destroy()
})
</script>

<template>
  <section class="town-map" aria-label="Explore Sharlock Town">
    <div class="map-toolbar">
      <div class="map-location">
        <PixelIcon name="map" :size="22" /><span
          >SHARLOCK TOWN<small>All {{ games.length }} activities open</small></span
        >
      </div>
      <div class="map-tools">
        <label class="map-jump" for="find-building"
          >Jump to
          <select id="find-building" :value="selectedId || ''" @change="findBuilding">
            <option value="">Choose a building</option>
            <option v-for="game in games" :key="game.id" :value="game.id">{{ game.name }}</option>
          </select></label
        >
        <div class="map-zoom-controls" role="group" aria-label="Map zoom">
          <button
            class="pixel-button zoom-step"
            type="button"
            aria-label="Zoom out"
            :disabled="scale <= minScale + 0.001"
            @click="zoomBy(-0.25)"
          >
            −
          </button>
          <output aria-label="Map zoom level" aria-live="off"
            >{{ Math.round(scale * 100) }}%</output
          >
          <button
            class="pixel-button zoom-step"
            type="button"
            aria-label="Zoom in"
            :disabled="scale >= maxScale - 0.001"
            @click="zoomBy(0.25)"
          >
            +
          </button>
          <button class="pixel-button reset-view" type="button" @click="resetCamera">
            Reset view
          </button>
        </div>
      </div>
      <TownAudio :suspended="soundSuspended" />
    </div>
    <div
      ref="frame"
      class="map-frame"
      @pointerleave="scheduleClose"
      @focusout="focusLeft"
      @keydown.esc.stop.prevent="dismiss(true)"
    >
      <div
        ref="viewport"
        class="town-viewport"
        :class="{ 'is-dragging': dragging }"
        tabindex="0"
        role="region"
        aria-label="Interactive town map"
        aria-describedby="map-instructions"
        @keydown="panWithKeyboard"
        @pointerdown="startGesture"
        @dragstart.prevent
      >
        <div
          ref="world"
          class="town-world"
          :style="{ width: `${TOWN_SIZE.width}px`, height: `${TOWN_SIZE.height}px` }"
        >
          <TownScenery />
          <ul class="town-buildings" aria-label="Game buildings">
            <li
              v-for="game in games"
              :key="game.id"
              class="town-building"
              :style="{ left: `${game.building.x}px`, top: `${game.building.y}px` }"
            >
              <button
                :ref="
                  (element) =>
                    element
                      ? buildingButtons.set(game.id, element)
                      : buildingButtons.delete(game.id)
                "
                type="button"
                class="building-button"
                :class="{ 'building-selected': selectedId === game.id }"
                :aria-label="`Explore ${game.name}`"
                :aria-expanded="selectedId === game.id"
                :aria-haspopup="game.activation === 'direct' ? 'dialog' : undefined"
                :aria-controls="selectedId === game.id ? `game-card-${game.id}` : undefined"
                @pointerenter="pointerReveal($event, game)"
                @pointerleave="scheduleClose"
                @focus="focusReveal(game)"
                @click="selectBuilding($event, game)"
              >
                <TownBuildingArt :type="game.building.type" /><span class="building-name">{{
                  game.name
                }}</span>
              </button>
            </li>
          </ul>
        </div>
      </div>
      <GameInfoCard
        v-if="selectedGame"
        ref="infoCard"
        :game="selectedGame"
        :style="cardStyle"
        @close="dismiss(true)"
        @pointerenter="cancelClose"
        @pointerleave="scheduleClose"
      />
    </div>
    <p id="map-instructions" class="visually-hidden">
      Drag or swipe to pan. Pinch or use +/− to zoom. Keyboard: arrows to pan, +/− to zoom, 0 to
      reset.
    </p>
  </section>
</template>
