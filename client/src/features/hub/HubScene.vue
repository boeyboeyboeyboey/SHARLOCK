<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { GRAPHICS_TO_TIER } from './scenes/shared/quality.js'
import HubMinimap from './HubMinimap.vue'
import ControlsHint from './ControlsHint.vue'
import { isInteractKey } from './controls.js'
import NpcDialogue from './NpcDialogue.vue'
import { useNpcDialogue } from './useNpcDialogue.js'
import { npcs } from './scenes/wharf/npcs.js'
import { announceChange } from './announce.js'
import LoreIntro from './intro/LoreIntro.vue'
import { useLoreIntro } from './intro/useLoreIntro.js'
import { decidePerf, perfRecord, writePerf } from './perfWatch.js'
import { getDeviceCheck } from './deviceCheck.js'
import { isSolidHud } from './glass.js'

const props = defineProps({
  games: { type: Array, required: true },
  inputPaused: { type: Boolean, default: false },
  // fills its parent instead of sitting in a framed box
  fill: { type: Boolean, default: false },
  // the Graphics setting: auto, high, medium or low; changing it rebuilds the hub
  quality: { type: String, default: 'auto' },
  // an explicit 3d choice means a struggling device is never switched to the 2d map
  explicit3d: { type: Boolean, default: false },
  // equipped wardrobe ids for Sharlock, read once when the hub builds
  wardrobe: { type: Object, default: null },
})
const emit = defineEmits(['enter', 'failed', 'slow'])
const TIER_TO_GRAPHICS = Object.fromEntries(Object.entries(GRAPHICS_TO_TIER).map(([setting, tier]) => [tier, setting]))

const isDev = import.meta.env.DEV
const returnKey = 'sharlock.hubReturn'
const stage = ref(null)
const pad = ref(null)
const knob = ref(null)
const jumpBtn = ref(null)
const destList = ref(null)
const view = reactive({
  ready: false,
  failed: false,
  selected: null,
  nearDoor: null,
  nearNpc: null,
  mode: 'explore',
  engine: null,
  fps: 0,
  drawCalls: 0,
  lowering: false,
  player: null,
})
let hub = null
let gone = false

const lore = useLoreIntro()
const introPlaying = lore.playing
// the intro covers the hub, so its input is paused the same way as for the Times
const paused = computed(() => props.inputPaused || introPlaying.value)
const motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
const reducedMotion = ref(Boolean(motionQuery?.matches))
const onMotionChange = (event) => {
  reducedMotion.value = event.matches
}

function onIntroDone() {
  lore.finish()
  nextTick(() => stage.value?.querySelector('canvas')?.focus())
}

const selectedGame = computed(() => props.games.find((game) => game.id === view.selected) ?? null)
// while the hub loads or after it fails, the buttons still lead somewhere
const canEnter = computed(() => Boolean(selectedGame.value) && (!view.ready || view.mode === 'explore'))
// games are covered by the page wipe, so only the newspaper dialog and the first load need the veil
const faded = computed(
  () =>
    (!view.ready && !view.failed) ||
    (view.selected === 'threat-briefing' && (view.mode === 'entering' || view.mode === 'panel')),
)
// the live region carries load and failure text first, then one message per selection change
const announcement = ref('')
let announceTimer = null
const status = computed(() => {
  if (view.failed) return '3D view unavailable. Choose a destination below.'
  if (!view.ready) return view.lowering ? 'Lowering graphics for smoother play' : 'Loading the wharf'
  return announcement.value
})
const devStats = computed(() => (isDev && view.ready ? `Engine ${view.engine}, ${view.fps} fps, ${view.drawCalls} draws` : ''))
const controlsHint = ref(null)
// the destination list starts open on wide screens and collapsed below them
const wideQuery = typeof matchMedia === 'function' ? matchMedia('(min-width: 992px)') : null
const destOpen = ref(wideQuery ? wideQuery.matches : true)
const talk = useNpcDialogue()
const talkNpc = computed(() => npcs.find((npc) => npc.id === view.nearNpc) ?? null)
const showTalk = computed(() => view.ready && view.mode === 'explore' && !paused.value && Boolean(talkNpc.value))
const talkBtn = ref(null)
const dialogue = ref(null)

function say(text) {
  announcement.value = text
  clearTimeout(announceTimer)
  announceTimer = setTimeout(() => {
    announcement.value = ''
  }, 5000)
}

async function openTalk() {
  const npc = talkNpc.value
  if (!npc || talk.open.value || !talk.begin(npc)) return
  hub?.pauseInput(true)
  say(`Talking to ${npc.name}`)
  await nextTick()
  dialogue.value?.focus()
}

// the one interact path: E talks to a nearby townsperson; discoveries hook in here later
function interact() {
  if (!showTalk.value || talk.open.value) return false
  openTalk()
  return true
}

function onInteractKey(event) {
  if (!isInteractKey(event)) return
  if (paused.value || view.mode !== 'explore') return
  if (interact()) event.preventDefault()
}

function closeTalk({ restoreFocus = true } = {}) {
  if (!talk.open.value) return
  talk.close()
  hub?.pauseInput(paused.value)
  if (restoreFocus) nextTick(() => talkBtn.value?.focus())
}

function goInFromTalk() {
  const id = talk.npc.value?.gameId
  if (!id) return
  closeTalk({ restoreFocus: false })
  if (view.selected !== id) {
    view.selected = id
    hub?.select(id)
  }
  enterSelected()
}

// the conversation ends if the npc is left behind or the hub stops exploring
watch(
  () => [view.nearNpc, view.mode, paused.value],
  ([near, mode, isPaused]) => {
    if (talk.open.value && (near !== talk.npc.value.id || mode !== 'explore' || isPaused)) closeTalk({ restoreFocus: false })
  },
)

watch(
  () => [view.selected, view.nearDoor, view.mode],
  ([selected, nearDoor, mode], [pSelected, pNearDoor, pMode]) => {
    const text = announceChange(
      { selected: pSelected, nearDoor: pNearDoor, mode: pMode },
      { selected, nearDoor, mode },
      (id) => props.games.find((game) => game.id === id)?.name,
    )
    if (!text) return
    say(text)
  },
)

function sync(state) {
  view.ready = state.ready
  view.selected = state.selected
  view.nearDoor = state.nearDoor
  view.nearNpc = state.nearNpc
  view.mode = state.mode
  view.engine = state.engine
  view.fps = state.fps
  view.drawCalls = state.drawCalls
  if (state.ready) view.lowering = false
}

// choosing the selected destination again deselects it
function choose(id) {
  if (view.mode !== 'explore') return
  const origin = document.activeElement
  const next = view.selected === id ? null : id
  view.selected = next
  hub?.select(next)
  // below the wide breakpoint the list gets out of the way once a place is picked
  if (next && !wideQuery?.matches) destOpen.value = false
  moveFocusAfterPick(origin, next, id)
}

// a pick made from the list or the map moves focus to Enter, but only when focus was on that control
async function moveFocusAfterPick(origin, next, id) {
  if (!(origin instanceof HTMLElement)) return
  const fromPicker = Boolean(destList.value?.contains(origin) || origin.closest('.hub-map-root'))
  const fromEnter = origin.matches('[data-testid="enter"]')
  if (!next && fromEnter) {
    // the Enter button leaves with the pick, so focus goes back to the list
    await focusDestination(id)
    return
  }
  if (!next || !fromPicker) return
  await nextTick()
  const enter = stage.value?.parentElement?.querySelector('[data-testid="enter"]')
  if (enter && !enter.disabled && view.selected === next) enter.focus()
}

// the engine writes the player's spot into its shared state every frame; the map samples it at 10 Hz
let mapTimer = null
function samplePlayer() {
  const at = hub?.state?.player
  if (!at) return
  const last = view.player
  if (!last || Math.abs(last.x - at.x) > 0.05 || Math.abs(last.z - at.z) > 0.05 || Math.abs(last.heading - at.heading) > 0.03) {
    view.player = { x: at.x, z: at.z, heading: at.heading }
  }
}

function onEscape(event) {
  if (event.key !== 'Escape' || event.defaultPrevented) return
  const target = event.target
  if (target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return
  if (paused.value) return
  // a handled escape is marked so the site menu does not also open
  if (talk.open.value) {
    event.preventDefault()
    closeTalk()
    return
  }
  if (view.mode !== 'explore' || !view.selected) return
  event.preventDefault()
  choose(view.selected)
}

function rememberDoor(id) {
  // the newspaper opens over the hub, so nothing needs restoring after it
  if (id === 'threat-briefing') return
  try {
    sessionStorage.setItem(returnKey, id)
  } catch {
    // storage can be blocked
  }
}

function takeDoor() {
  try {
    const id = sessionStorage.getItem(returnKey)
    sessionStorage.removeItem(returnKey)
    return props.games.some((game) => game.id === id) ? id : null
  } catch {
    return null
  }
}

async function enterSelected() {
  const game = selectedGame.value
  if (!game) return
  rememberDoor(game.id)
  if (view.failed || !hub || !view.ready) {
    emit('enter', game)
    return
  }
  // swoop to the door first, then hand over to the router
  const started = await hub.enter(game.id)
  if (started && !gone) emit('enter', game)
}

function pauseFromProp(value) {
  hub?.pauseInput(value || talk.open.value)
  if (value) hub?.back()
}

let createHub = null
// a rebuild must not let the previous hub's late state overwrite the new one
let generation = 0
// the tier the runtime watch stepped down to; only used while the setting is auto
const watchedTier = ref(null)
// opaque hud panels on the low tier
const solidHud = computed(() =>
  isSolidHud({ quality: props.quality, watchedTier: watchedTier.value, deviceTier: getDeviceCheck().tier }),
)

function onPerf({ fps, tier }) {
  const decision = decidePerf({ tier, fps, explicit3d: props.explicit3d })
  // a healthy result keeps whatever an earlier visit remembered
  const record = perfRecord(decision)
  if (record) writePerf(record)
  if (decision.action === 'lower') {
    watchedTier.value = decision.tier
    view.lowering = true
    rebuildHub()
  } else if (decision.action === 'switch-2d') {
    emit('slow')
  }
}

async function mountHub(resume = null) {
  const mine = ++generation
  if (!createHub) {
    // babylon loads only when the hub mounts, so no other page pays for it
    try {
      ;({ createHub } = await import('./engine.js'))
    } catch (error) {
      console.error('hub engine failed to load', error)
      if (!gone) view.failed = true
      return
    }
  }
  if (gone || mine !== generation) return
  // dev overrides (renderer, tier, mirror) only apply outside a production build
  const params = isDev ? new URLSearchParams(location.search) : new URLSearchParams()
  const returnDoor = takeDoor()
  const next = createHub({
    container: stage.value,
    joystick: { el: pad.value, knob: knob.value, jump: jumpBtn.value },
    params,
    spawnAt: returnDoor,
    quality: props.quality === 'auto' && watchedTier.value ? TIER_TO_GRAPHICS[watchedTier.value] : props.quality,
    watch: props.quality === 'auto',
    resumeAt: resume,
    wardrobe: props.wardrobe,
    onPerf: (result) => {
      if (mine === generation) onPerf(result)
    },
    onState: (state) => {
      if (mine === generation) sync(state)
    },
  })
  hub = next
  if (paused.value) pauseFromProp(true)
  if (view.selected) next.select(view.selected)
  next.ready.then(
    () => {
      // coming back from a game puts focus on that destination's list button
      const active = document.activeElement
      const idle = !active || active === document.body || active.tagName === 'H1'
      if (returnDoor && !gone && mine === generation && idle) focusDestination(returnDoor)
    },
    () => {
      if (!gone && mine === generation) view.failed = true
    },
  )
}

function rebuildHub() {
  const resume = hub?.position?.() ?? null
  hub?.dispose()
  hub = null
  view.ready = false
  view.failed = false
  view.mode = 'explore'
  mountHub(resume)
}

onMounted(() => {
  window.addEventListener('keydown', onEscape)
  window.addEventListener('keydown', onInteractKey)
  motionQuery?.addEventListener?.('change', onMotionChange)
  if (!lore.hasSeen()) lore.start()
  mapTimer = setInterval(samplePlayer, 100)
  mountHub()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEscape)
  window.removeEventListener('keydown', onInteractKey)
  motionQuery?.removeEventListener?.('change', onMotionChange)
  gone = true
  clearInterval(mapTimer)
  clearTimeout(announceTimer)
  hub?.dispose()
  hub = null
})

watch(paused, pauseFromProp)
watch(() => props.quality, () => {
  watchedTier.value = null
  view.lowering = false
  rebuildHub()
})
watch(
  () => view.failed,
  (failed) => {
    if (failed) emit('failed')
  },
)

async function focusDestination(id) {
  destOpen.value = true
  await nextTick()
  destList.value?.querySelector(`[data-testid="dest-${id}"]`)?.focus()
}

function showControls() {
  controlsHint.value?.show()
}

defineExpose({
  focusDestination,
  showControls,
  interact,
  resetCamera: () => hub?.resetCamera(),
})
</script>

<template>
  <section
    class="hub-scene"
    :class="{ 'is-fill': fill, 'hub-solid': solidHud }"
    aria-label="Thames Wharf"
  >
    <div ref="stage" class="hub-stage"></div>
    <div class="hub-fade" :class="{ on: faded }" aria-hidden="true"></div>
    <div class="hub-hud">
      <slot></slot>
      <p
        class="hub-status hub-glass"
        data-testid="hub-status"
        role="status"
        aria-live="polite"
        :class="{ 'visually-hidden': !status }"
      >
        {{ status }}
      </p>
      <p v-if="devStats" class="hub-status hub-glass" data-testid="hub-stats">{{ devStats }}</p>
    </div>
    <ControlsHint ref="controlsHint" :held="introPlaying" />
    <div class="hub-dock">
      <nav class="hub-dest hub-glass" aria-label="Destinations">
        <button
          type="button"
          class="btn btn-secondary btn-sm hub-glass-btn hub-destinations-toggle"
          data-testid="destinations-toggle"
          aria-controls="hub-dest-list"
          :aria-expanded="String(destOpen)"
          @click="destOpen = !destOpen"
        >
          Destinations
          <span aria-hidden="true">{{ destOpen ? '▾' : '▸' }}</span>
        </button>
        <ul v-show="destOpen" id="hub-dest-list" ref="destList" class="hub-dest-list">
          <li v-for="game in games" :key="game.id">
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              :data-testid="`dest-${game.id}`"
              :aria-pressed="String(view.selected === game.id)"
              @click="choose(game.id)"
            >
              {{ game.name }}
            </button>
          </li>
        </ul>
      </nav>
      <NpcDialogue
        v-if="talk.open.value && talk.npc.value"
        ref="dialogue"
        class="hub-talk-panel"
        :name="talk.npc.value.name"
        :line="talk.line.value"
        :last="talk.isLast.value"
        :can-enter="talk.npc.value.kind === 'game'"
        @next="talk.next()"
        @enter="goInFromTalk"
        @close="closeTalk()"
      />
      <div v-if="selectedGame || showTalk" class="hub-actions hub-glass">
        <button
          v-if="showTalk"
          ref="talkBtn"
          type="button"
          class="btn btn-secondary hub-talk hub-glass-btn"
          data-testid="talk"
          :aria-expanded="String(talk.open.value)"
          @click="openTalk"
        >
          Talk to {{ talkNpc.name }}
        </button>
        <button
          v-if="selectedGame"
          type="button"
          class="btn btn-primary hub-enter hub-glass-btn hub-glass-btn-primary"
          data-testid="enter"
          :disabled="!canEnter"
          @click="enterSelected"
        >
          Enter {{ selectedGame.name }}
        </button>
      </div>
    </div>
    <HubMinimap
      v-if="view.ready && !paused"
      :games="games"
      :player="view.player"
      :selected="view.selected"
      @choose="choose"
    />
    <div ref="pad" class="hub-joystick" aria-hidden="true"><div ref="knob" class="hub-joystick-knob"></div></div>
    <button ref="jumpBtn" type="button" class="hub-jump" data-testid="hub-jump">Jump</button>
    <LoreIntro
      v-if="introPlaying"
      :reduced-motion="reducedMotion"
      :ready="view.ready"
      @done="onIntroDone"
    />
  </section>
</template>

<style scoped>
.hub-scene {
  position: relative;
  width: 100%;
  height: min(76dvh, 760px);
  min-height: 420px;
  overflow: hidden;
  border: 3px solid var(--town-edge);
  background: #2a2036;
  box-shadow: var(--shadow-pixel);
}
.hub-stage {
  position: absolute;
  inset: 0;
}
.hub-stage :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  outline: none;
}
.hub-stage :deep(canvas:focus-visible) {
  outline: 3px solid var(--accent-primary);
  outline-offset: -3px;
}
.hub-fade {
  position: absolute;
  inset: 0;
  background: #1b1426;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.45s ease;
}
.hub-fade.on {
  opacity: 0.85;
}
.hub-hud {
  position: absolute;
  top: 8px;
  left: 8px;
  display: grid;
  justify-items: start;
  gap: 8px;
  max-width: calc(100% - 16px);
  pointer-events: none;
}
.hub-hud > :deep(*) {
  pointer-events: auto;
}
.hub-status {
  margin: 0;
  padding: 4px 10px;
  font-size: 13px;
}
.hub-status[hidden] {
  display: none;
}
.hub-dock {
  display: contents;
}
.hub-dest {
  position: absolute;
  top: 8px;
  right: 8px;
  max-width: min(260px, calc(100% - 16px));
  max-height: calc(100% - 16px);
  overflow-y: auto;
  padding: 6px;
}
.hub-destinations-toggle {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.hub-dest-list {
  display: grid;
  gap: 4px;
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
}
.hub-dest-list .btn {
  width: 100%;
  text-align: left;
}
.hub-dest-list .btn[aria-pressed='true'] {
  background: var(--accent-primary);
  box-shadow: inset 0 0 0 2px var(--town-edge);
}
.hub-actions {
  position: absolute;
  left: 50%;
  bottom: 16px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  transform: translateX(-50%);
  max-width: calc(100% - 32px);
  padding: 6px;
}
.hub-talk-panel {
  position: absolute;
  left: 50%;
  bottom: 72px;
  transform: translateX(-50%);
}
.hub-joystick {
  position: absolute;
  left: 16px;
  bottom: 16px;
  display: none;
  place-items: center;
  width: 120px;
  height: 120px;
  border: 2px solid rgb(243 238 221 / 55%);
  border-radius: 50%;
  background: rgb(20 32 46 / 45%);
  touch-action: none;
}
.hub-jump {
  position: absolute;
  left: 152px;
  bottom: 28px;
  display: none;
  width: 64px;
  height: 64px;
  align-items: center;
  justify-content: center;
  border: 2px solid rgb(243 238 221 / 55%);
  border-radius: 50%;
  background: rgb(20 32 46 / 70%);
  color: var(--hub-glass-ink);
  font-weight: 700;
  touch-action: none;
}
.hub-joystick-knob {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: rgb(243 238 221 / 85%);
  box-shadow: 0 2px 8px rgb(0 0 0 / 35%);
}
.hub-jump:focus-visible {
  outline: 3px solid var(--hub-glass-focus);
  outline-offset: 3px;
}
@media (pointer: coarse) {
  .hub-joystick {
    display: grid;
  }
  .hub-jump {
    display: inline-flex;
  }
}
@media (max-width: 575.98px) {
  /* destinations and Enter stack along the bottom edge, the HUD sits at the top */
  .hub-dock {
    position: absolute;
    right: 8px;
    bottom: 8px;
    left: 8px;
    display: flex;
    flex-direction: column-reverse;
    gap: 8px;
    pointer-events: none;
  }
  .hub-dest {
    position: static;
    max-width: none;
    max-height: 34dvh;
    padding: 4px;
    pointer-events: auto;
  }
  .hub-dest-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .hub-dest-list .btn {
    min-height: 44px;
    font-size: 13px;
    line-height: 1.2;
  }
  .hub-actions {
    position: static;
    align-self: center;
    max-width: 100%;
    transform: none;
    pointer-events: auto;
  }
  .hub-talk-panel {
    position: static;
    width: 100%;
    transform: none;
  }
  /* the left column holds the toolbar, status and Reset camera, so the pad moves under the Map button on the right */
  .hub-joystick {
    bottom: auto;
    top: 116px;
    right: 8px;
    left: auto;
    width: 96px;
    height: 96px;
  }
  /* under the pad on the right edge, above the Map button */
  .hub-jump {
    top: 222px;
    right: 24px;
    bottom: auto;
    left: auto;
    width: 56px;
    height: 56px;
  }
}
@media (min-width: 768px) and (min-height: 600px) {
  .hub-scene {
    flex: 1 1 auto;
    height: auto;
  }
}
.hub-scene.is-fill {
  height: 100%;
  min-height: 0;
  border: 0;
  box-shadow: none;
}
@media (prefers-reduced-motion: reduce) {
  .hub-fade {
    transition: none;
  }
}
@media (forced-colors: active) {
  .hub-joystick,
  .hub-jump {
    border-color: CanvasText;
    background: Canvas;
    color: CanvasText;
  }
  .hub-joystick-knob {
    background: CanvasText;
    box-shadow: none;
  }
}
</style>

<!-- smoked glass for every hud panel in the hub; unscoped so the children and the Dashboard slot share it, and the custom properties stay on the hub root -->
<style>
.hub-scene {
  --hub-glass-bg: rgb(20 32 46 / 72%);
  --hub-glass-solid: #14202e;
  --hub-glass-edge: rgb(243 238 221 / 28%);
  --hub-glass-ink: #f3eedd;
  --hub-glass-muted: #c9c5b6;
  --hub-glass-blur: 12px;
  --hub-glass-shadow: 0 8px 26px rgb(0 0 0 / 40%);
  --hub-glass-radius: 10px;
  --hub-glass-focus: #ffd479;
  --hub-glass-btn: rgb(255 255 255 / 8%);
  --hub-glass-btn-hover: rgb(255 255 255 / 16%);
  --hub-glass-btn-active: rgb(255 255 255 / 24%);
  --hub-glass-filter: blur(var(--hub-glass-blur)) saturate(1.15);
}
/* opaque fallbacks only swap the fill and drop the blur */
.hub-scene.hub-solid {
  --hub-glass-bg: var(--hub-glass-solid);
  --hub-glass-filter: none;
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .hub-scene {
    --hub-glass-bg: var(--hub-glass-solid);
    --hub-glass-filter: none;
  }
}
@media (prefers-reduced-transparency: reduce) {
  .hub-scene {
    --hub-glass-bg: var(--hub-glass-solid);
    --hub-glass-filter: none;
  }
}
@media (forced-colors: active) {
  .hub-scene {
    --hub-glass-bg: Canvas;
    --hub-glass-ink: CanvasText;
    --hub-glass-muted: CanvasText;
    --hub-glass-edge: ButtonBorder;
    --hub-glass-focus: Highlight;
    --hub-glass-shadow: none;
    --hub-glass-btn: ButtonFace;
    --hub-glass-btn-hover: ButtonFace;
    --hub-glass-btn-active: ButtonFace;
    --hub-glass-filter: none;
  }
}
.hub-scene .hub-glass {
  border: 1px solid var(--hub-glass-edge);
  border-radius: var(--hub-glass-radius);
  background: var(--hub-glass-bg);
  color: var(--hub-glass-ink);
  box-shadow: var(--hub-glass-shadow);
  -webkit-backdrop-filter: var(--hub-glass-filter);
  backdrop-filter: var(--hub-glass-filter);
}
.hub-scene .hub-glass a:not(.btn) {
  color: var(--hub-glass-ink);
  text-decoration-color: var(--hub-glass-muted);
}
.portal-shell .hub-scene .hub-glass-btn {
  min-height: 40px;
  border: 1px solid var(--hub-glass-edge);
  border-radius: calc(var(--hub-glass-radius) - 2px);
  background: var(--hub-glass-btn);
  color: var(--hub-glass-ink);
  box-shadow: none;
  font-size: 13px;
  font-weight: 600;
  transform: none;
  transition: background-color 0.12s;
}
.portal-shell .hub-scene .hub-glass-btn:hover {
  border-color: var(--hub-glass-edge);
  background: var(--hub-glass-btn-hover);
  color: var(--hub-glass-ink);
  box-shadow: none;
  transform: none;
}
.portal-shell .hub-scene .hub-glass-btn:active {
  border-color: var(--hub-glass-edge);
  background: var(--hub-glass-btn-active);
  color: var(--hub-glass-ink);
  box-shadow: none;
  transform: none;
}
/* a button that stands alone over the scene carries its own glass */
.portal-shell .hub-scene .hub-glass-btn.hub-glass {
  background: var(--hub-glass-bg);
  box-shadow: 0 4px 14px rgb(0 0 0 / 35%);
}
.portal-shell .hub-scene .hub-glass-btn.hub-glass:hover,
.portal-shell .hub-scene .hub-glass-btn.hub-glass:active {
  background: color-mix(in srgb, var(--hub-glass-ink) 16%, var(--hub-glass-bg));
  box-shadow: 0 4px 14px rgb(0 0 0 / 35%);
}
.portal-shell .hub-scene .hub-glass-btn:focus-visible {
  outline: 3px solid var(--hub-glass-focus);
  outline-offset: 2px;
  box-shadow: none;
}
.portal-shell .hub-scene .hub-glass-btn:disabled {
  opacity: 0.55;
}
.portal-shell .hub-scene .hub-glass-btn-primary {
  border-color: var(--hub-glass-ink);
  background: var(--hub-glass-ink);
  color: var(--hub-glass-solid);
  font-weight: 700;
}
.portal-shell .hub-scene .hub-glass-btn-primary:hover,
.portal-shell .hub-scene .hub-glass-btn-primary:active {
  border-color: var(--hub-glass-ink);
  background: var(--hub-glass-ink);
  color: var(--hub-glass-solid);
  filter: brightness(0.9);
}
.portal-shell .hub-scene .hub-glass-btn-primary:active {
  filter: brightness(0.8);
}
@media (forced-colors: active) {
  .portal-shell .hub-scene .hub-glass-btn-primary,
  .portal-shell .hub-scene .hub-glass-btn-primary:hover,
  .portal-shell .hub-scene .hub-glass-btn-primary:active {
    border-color: ButtonText;
    background: ButtonFace;
    color: ButtonText;
    filter: none;
  }
}
@media (pointer: coarse), (max-width: 575.98px) {
  .portal-shell .hub-scene .hub-glass-btn {
    min-height: 44px;
  }
}
</style>
