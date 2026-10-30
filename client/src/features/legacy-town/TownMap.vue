<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import Panzoom from '@panzoom/panzoom'
import { TOWN_SIZE } from '../../data/gameCatalog.js'
import { clampPan, fitScale, panToCenter, stepZoom, viewCenter } from './townZoom.js'
import { sharlockMarkup, townFindMarkup, townNpcMarkup } from './townArt.js'
import { createTownWalk, doorPoint } from './townWalk.js'
import { useTownWalker } from './useTownWalker.js'
import { useTownNpcs } from './useTownNpcs.js'
import { useTownPresence } from './useTownPresence.js'
import { fixedNpcBlocks, footBlock, TALK_RANGE, townFinds, townNpcs } from './townNpcs.js'
import NpcDialogue from '../hub/NpcDialogue.vue'
import { advanceTalk, useNpcDialogue } from '../hub/useNpcDialogue.js'
import { useDiscoveries } from '../hub/discoveries.js'
import { isEnterKey, isInteractKey, isSprintKey } from '../hub/controls.js'
import PixelIcon from '../../components/town/PixelIcon.vue'
import TownScenery from './TownScenery.vue'
import TownBuildingArt from './TownBuildingArt.vue'
import GameInfoCard from './GameInfoCard.vue'
import { useTownControls } from '../menu/townControls.js'

const emit = defineEmits(['activate'])
const props = defineProps({
  games: { type: Array, required: true },
  // an overlay or dialog is open over the town, so walking keys are ignored
  paused: { type: Boolean, default: false },
})
const controls = useTownControls()
const frame = ref(null)
const viewport = ref(null)
const world = ref(null)
const scale = ref(1)
const dragging = ref(false)
// the floor is the scale at which the whole town fits the viewport
const minScale = ref(1)
const maxScale = 2
let correcting = false
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
let following = true
let camCenter = null
const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const npcState = useTownNpcs({
  npcs: townNpcs,
  target: () => ({ x: walker.x.value, y: walker.y.value }),
  paused: () => props.paused || talk.open.value,
  reducedMotion,
})
const walk = createTownWalk(props.games, {
  fixed: fixedNpcBlocks,
  dynamic: () => npcState.list.value.map((npc) => footBlock(npc.x, npc.y)),
})
const talk = useNpcDialogue()
const discoveries = useDiscoveries()
const dialogue = ref(null)
const talkNote = ref('')
const npcArt = Object.fromEntries(townNpcs.map((npc) => [npc.id, townNpcMarkup(npc.style)]))
const npcDefs = new Map(townNpcs.map((npc) => [npc.id, npc]))
const findArt = townFindMarkup()
const walker = useTownWalker({ walk, reducedMotion, afterMove: stepCamera })
// classmates are ghosts: drawn only, never added to the walk blocks
const classmates = useTownPresence({
  getPlayer: () => ({ x: walker.x.value, y: walker.y.value }),
  reducedMotion,
})
const heroMarkup = computed(() => sharlockMarkup(walker.facing.value, walker.frame.value))
const doorGame = computed(() => (props.paused || nearTalk.value ? null : walker.doorGame.value))
const nearTalk = computed(() => {
  if (props.paused) return null
  const here = { x: walker.x.value, y: walker.y.value }
  let best = null
  let bestDistance = TALK_RANGE
  const consider = (kind, def, x, y) => {
    const distance = Math.hypot(here.x - x, here.y - y)
    if (distance < bestDistance) {
      best = { kind, def, x, y }
      bestDistance = distance
    }
  }
  for (const npc of npcState.list.value) consider('npc', npcDefs.get(npc.id), npc.x, npc.y)
  for (const find of townFinds) consider('find', find, find.x, find.y)
  return best
})
const talkStyle = computed(() => ({
  left: `${nearTalk.value.x}px`,
  top: `${nearTalk.value.y - 44}px`,
}))
const talkLabel = computed(() =>
  nearTalk.value.kind === 'find'
    ? `Look at ${nearTalk.value.def.name}`
    : `Talk to ${nearTalk.value.def.name}`,
)
const doorStyle = computed(() => {
  const door = doorPoint(doorGame.value)
  return { left: `${door.x}px`, top: `${door.y - 40}px` }
})

function cancelClose() {
  clearTimeout(closeTimer)
}
function placeCard() {
  const button = buildingButtons.get(selectedId.value)
  const card = infoCard.value?.$el
  if (!button || !frame.value || !card) return
  if (frame.value.clientWidth < 640) {
    // leave room for the zoom stack at the bottom right
    cardStyle.value = { left: '12px', right: '68px', bottom: '12px' }
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
  camCenter = null
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
function openBuilding(game) {
  if (game.activation === 'direct') {
    dismiss()
    emit('activate', game.route)
  } else reveal(game, true)
}
async function openTalk() {
  const near = nearTalk.value
  if (!near || talk.open.value) return
  dismiss()
  if (near.kind === 'find') {
    talk.begin({ ...near.def, kind: 'discovery' })
    const first = discoveries.mark(near.def.id)
    talkNote.value = first
      ? `Discovery ${discoveries.count.value} of ${discoveries.total}: ${near.def.name}`
      : near.def.name
  } else {
    talk.begin(near.def)
    talkNote.value = `Talking to ${near.def.name}`
  }
  await nextTick()
  dialogue.value?.focus()
}
function closeTalk(restoreFocus = true) {
  if (!talk.open.value) return
  talk.close()
  talkNote.value = ''
  if (restoreFocus) viewport.value?.focus({ preventScroll: true })
}
function goInFromTalk() {
  const game = props.games.find((item) => item.id === talk.npc.value?.gameId)
  closeTalk(false)
  if (game) openBuilding(game)
}
watch(
  () => [nearTalk.value?.def.id, props.paused],
  ([id, isPaused]) => {
    if (talk.open.value && (id !== talk.npc.value.id || isPaused)) closeTalk(false)
  },
)
function selectBuilding(event, game) {
  if (suppressClick && event.detail !== 0) return
  openBuilding(game)
}
// the menu's Places list calls this through the shared town controls
function jumpTo(id) {
  const game = props.games.find((item) => item.id === id)
  if (!game) return
  const door = doorPoint(game)
  walker.placeAt(door.x, door.y + 8)
  following = true
  camCenter = null
  centerBuilding(game)
  reveal(game, true)
}
// eases the one panzoom camera towards sharlock; true while it still needs frames
function stepCamera(dt) {
  if (!following || !camera || !viewport.value) return false
  const view = viewSize()
  const zoom = camera.getScale()
  const here = { x: walker.x.value, y: walker.y.value }
  camCenter ??= viewCenter(clampPan(camera.getPan(), zoom, view, TOWN_SIZE), zoom, view, TOWN_SIZE)
  const k = reducedMotion() ? 1 : 1 - Math.exp(-dt * 7)
  const want = {
    x: camCenter.x + (here.x - camCenter.x) * k,
    y: camCenter.y + (here.y - camCenter.y) * k,
  }
  const pan = clampPan(panToCenter(want, zoom, view, TOWN_SIZE), zoom, view, TOWN_SIZE)
  camera.pan(pan.x, pan.y, { force: true, animate: false })
  const next = viewCenter(pan, zoom, view, TOWN_SIZE)
  const shifted = Math.hypot(next.x - camCenter.x, next.y - camCenter.y)
  camCenter = next
  return shifted > 0.3 && Math.hypot(here.x - next.x, here.y - next.y) > 0.5
}
function releaseCamera() {
  following = false
  camCenter = null
}
function walkingKey(event) {
  if (props.paused || event.defaultPrevented) return
  // E steps on or closes an open conversation, even with focus inside its dialog
  if (talk.open.value && isInteractKey(event)) {
    event.preventDefault()
    advanceTalk(talk, closeTalk)
    return
  }
  if (
    event.target?.closest?.(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"], dialog, .game-info-card',
    )
  )
    return
  if (document.querySelector('[aria-modal="true"], dialog[open]')) return
  if (isSprintKey(event)) {
    walker.startSprint()
    return
  }
  if (isInteractKey(event) && nearTalk.value) {
    event.preventDefault()
    openTalk()
    return
  }
  if (isInteractKey(event) || isEnterKey(event)) {
    if (!doorGame.value) return
    event.preventDefault()
    openBuilding(doorGame.value)
    return
  }
  if (walker.keyDown(event)) {
    event.preventDefault()
    if (!following) {
      following = true
      camCenter = null
    }
    if (!pinned) dismiss()
  }
}
function walkingKeyUp(event) {
  walker.keyUp(event)
}
function groundClick(event) {
  if (suppressClick || props.paused || !world.value) return
  if (event.target.closest?.('.building-button, .town-door-prompt')) return
  const bounds = world.value.getBoundingClientRect()
  const ratio = bounds.width / TOWN_SIZE.width
  if (!ratio) return
  following = true
  camCenter = null
  walker.walkTo((event.clientX - bounds.left) / ratio, (event.clientY - bounds.top) / ratio)
}
function viewSize() {
  return { width: viewport.value?.clientWidth ?? 0, height: viewport.value?.clientHeight ?? 0 }
}
function zoomStep(direction) {
  if (!camera) return
  camCenter = null
  const target = stepZoom(camera.getScale(), direction, minScale.value)
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
  following = true
  camCenter = null
  stepCamera(1)
}
function zoomWithKeyboard(event) {
  if (event.target !== viewport.value) return
  if (['+', '=', '-', '0'].includes(event.key)) {
    event.preventDefault()
    if (event.key === '0') resetCamera()
    else zoomStep(event.key === '-' ? -1 : 1)
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
    releaseCamera()
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
  releaseCamera()
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
function applyTransform(elem, { x, y, scale: current }) {
  const clamped = clampPan({ x, y }, current, viewSize(), TOWN_SIZE)
  elem.style.transform = `scale(${current}) translate(${clamped.x}px, ${clamped.y}px)`
}
function cameraChanged(event) {
  scale.value = event.detail.scale
  const { x, y } = event.detail
  const clamped = clampPan({ x, y }, event.detail.scale, viewSize(), TOWN_SIZE)
  // keep panzoom's own pan in step with the clamped transform that is already on screen
  if (!correcting && (Math.abs(clamped.x - x) > 0.5 || Math.abs(clamped.y - y) > 0.5)) {
    correcting = true
    camera.pan(clamped.x, clamped.y, { force: true, animate: false })
    requestAnimationFrame(() => (correcting = false))
  }
  placeCard()
}
function syncFloor() {
  if (!camera || !viewport.value) return
  const fit = fitScale(viewSize(), TOWN_SIZE)
  minScale.value = fit
  camera.setOptions({ minScale: fit, startScale: Math.max(1, fit) })
  if (camera.getScale() < fit - 0.001) camera.zoom(fit, { animate: false, force: true })
  // a new viewport size can leave the old pan off the world, so pull it back in
  const pan = camera.getPan()
  const clamped = clampPan(pan, camera.getScale(), viewSize(), TOWN_SIZE)
  if (Math.abs(clamped.x - pan.x) > 0.5 || Math.abs(clamped.y - pan.y) > 0.5)
    camera.pan(clamped.x, clamped.y, { force: true, animate: false })
}
function resizeCamera() {
  cancelAnimationFrame(resizeFrame)
  resizeFrame = requestAnimationFrame(() => {
    if (!camera) return
    syncFloor()
    camCenter = null
    const pan = camera.getPan()
    camera.pan(pan.x, pan.y, { force: true })
    placeCard()
  })
}
onMounted(() => {
  // panzoom owns drag, pinch, focal zoom and boundary math for the town canvas
  camera = Panzoom(world.value, {
    canvas: true,
    cursor: 'grab',
    minScale: minScale.value,
    maxScale,
    setTransform: applyTransform,
    animate: false,
    noBind: true,
    overflow: 'clip',
    handleStartEvent: (event) => event.preventDefault(),
  })
  world.value.addEventListener('panzoomchange', cameraChanged)
  syncFloor()
  window.addEventListener('keydown', walkingKey)
  npcState.start()
  classmates.start()
  window.addEventListener('keyup', walkingKeyUp)
  viewport.value.addEventListener('wheel', wheelCamera, { passive: false })
  document.addEventListener('pointermove', moveGesture)
  document.addEventListener('pointerup', endGesture)
  document.addEventListener('pointercancel', endGesture)
  document.addEventListener('pointerleave', cancelGestures)
  window.addEventListener('blur', cancelGestures)
  window.addEventListener('blur', walker.clearKeys)
  resizeObserver = new ResizeObserver(resizeCamera)
  resizeObserver.observe(viewport.value)
  if (controls?.jumpTo) controls.jumpTo.value = jumpTo
})
onBeforeUnmount(() => {
  if (controls?.jumpTo?.value === jumpTo) controls.jumpTo.value = null
  cancelClose()
  cancelAnimationFrame(resizeFrame)
  walker.dispose()
  npcState.dispose()
  classmates.dispose()
  window.removeEventListener('keydown', walkingKey)
  window.removeEventListener('keyup', walkingKeyUp)
  resizeObserver?.disconnect()
  cancelGestures()
  document.removeEventListener('pointermove', moveGesture)
  document.removeEventListener('pointerup', endGesture)
  document.removeEventListener('pointercancel', endGesture)
  document.removeEventListener('pointerleave', cancelGestures)
  window.removeEventListener('blur', cancelGestures)
  window.removeEventListener('blur', walker.clearKeys)
  viewport.value.removeEventListener('wheel', wheelCamera)
  world.value.removeEventListener('panzoomchange', cameraChanged)
  camera?.destroy()
  camera = null
})
</script>

<template>
  <section class="town-map" aria-label="Explore Sharlock Town">
    <div class="map-zoom-controls" role="group" aria-label="Map zoom">
      <button
        class="pixel-button zoom-step"
        type="button"
        aria-label="Zoom in"
        :disabled="scale >= maxScale - 0.001"
        @click="zoomStep(1)"
      >
        +
      </button>
      <output aria-label="Map zoom level" aria-live="off">{{ Math.round(scale * 100) }}%</output>
      <button
        class="pixel-button zoom-step"
        type="button"
        aria-label="Zoom out"
        :disabled="scale <= minScale + 0.001"
        @click="zoomStep(-1)"
      >
        −
      </button>
      <button
        class="pixel-button zoom-step reset-view"
        type="button"
        aria-label="Reset view"
        @click="resetCamera"
      >
        <PixelIcon name="map" :size="20" />
      </button>
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
        @keydown="zoomWithKeyboard"
        @click="groundClick"
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
              :style="{
                left: `${game.building.x}px`,
                top: `${game.building.y}px`,
                zIndex: game.building.y + 200,
              }"
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
          <!-- townsfolk, finds and sharlock are trusted static svg from townArt.js -->
          <!-- eslint-disable vue/no-v-html -->
          <div
            v-for="npc in npcState.list.value"
            :key="npc.id"
            class="town-npc"
            :data-testid="`town-npc-${npc.id}`"
            :data-frame="npc.frame"
            :style="{ left: `${npc.x}px`, top: `${npc.y}px`, zIndex: Math.round(npc.y) + 1 }"
            aria-hidden="true"
          >
            <div
              class="town-npc-flip"
              :class="{ 'is-left': npc.facing === 'left' }"
              v-html="npcArt[npc.id]"
            />
          </div>
          <div
            v-for="find in townFinds"
            :key="find.id"
            class="town-find"
            :class="{ 'is-found': discoveries.has(find.id) }"
            :data-testid="`town-find-${find.id}`"
            :style="{ left: `${find.x}px`, top: `${find.y}px`, zIndex: Math.round(find.y) + 1 }"
            aria-hidden="true"
          >
            <div
              class="town-npc-flip"
              :class="{ 'is-left': find.facing === 'left' }"
              v-html="find.kind === 'npc' ? npcArt[find.id] : findArt"
            />
          </div>
          <div
            v-for="peer in classmates.list.value"
            :key="peer.sid"
            class="town-npc town-peer"
            data-testid="town-peer"
            :data-username="peer.username"
            :data-frame="peer.frame"
            :style="{ left: `${peer.x}px`, top: `${peer.y}px`, zIndex: Math.round(peer.y) + 1 }"
            aria-hidden="true"
          >
            <div
              class="town-npc-flip"
              :class="{ 'is-left': peer.facing === 'left' }"
              v-html="peer.markup"
            />
            <span class="town-peer-name"
              >{{ peer.username }}{{ peer.staff ? ' (staff)' : '' }}</span
            >
          </div>
          <div
            class="town-hero"
            data-testid="town-player"
            :data-facing="walker.facing.value"
            :data-moving="walker.moving.value"
            :data-sprint="walker.sprintState.value"
            :style="{
              left: `${walker.x.value}px`,
              top: `${walker.y.value}px`,
              zIndex: Math.round(walker.y.value) + 1,
            }"
            aria-hidden="true"
          >
            <div
              class="town-hero-flip"
              :class="{ 'is-left': walker.facing.value === 'left' }"
              v-html="heroMarkup"
            />
          </div>
          <!-- eslint-enable vue/no-v-html -->
          <button
            v-if="nearTalk && !talk.open.value"
            type="button"
            class="town-door-prompt"
            data-testid="talk-prompt"
            :aria-label="talkLabel"
            :style="talkStyle"
            @pointerdown.stop
            @click="openTalk"
          >
            E
          </button>
          <button
            v-if="doorGame"
            type="button"
            class="town-door-prompt"
            data-testid="door-prompt"
            :aria-label="`Enter ${doorGame.name}`"
            :style="doorStyle"
            @pointerdown.stop
            @click="openBuilding(doorGame)"
          >
            E
          </button>
        </div>
      </div>
      <NpcDialogue
        v-if="talk.open.value && talk.npc.value"
        ref="dialogue"
        class="town-talk"
        :name="talk.npc.value.name"
        :line="talk.line.value"
        :last="talk.isLast.value"
        :can-enter="talk.npc.value.kind === 'game'"
        :close-label="talk.npc.value.kind === 'discovery' ? 'Got it' : 'Bye'"
        @keydown.esc.stop.prevent="closeTalk()"
        @next="talk.next()"
        @enter="goInFromTalk"
        @close="closeTalk()"
      />
      <p class="visually-hidden" role="status">{{ talkNote }}</p>
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
      Drag or swipe to pan. Pinch or use +/− to zoom. Keyboard: WASD or arrows to walk Sharlock,
      Shift to sprint, E or Enter at a door to go in, +/− to zoom, 0 to reset view.
    </p>
  </section>
</template>
