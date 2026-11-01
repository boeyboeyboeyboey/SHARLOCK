<script setup>
import { computed } from 'vue'
import { floorsFor, formatLabel, nameOf } from '../clearanceTower.js'

const props = defineProps({
  level: { type: Object, required: true },
  policy: { type: Object, required: true },
  currentEvent: { type: Object, default: null },
  shownEvents: { type: Array, default: () => [] },
})

const floors = computed(() => floorsFor(props.level, props.policy))

const activeAgents = computed(() => new Set(reachedSteps.value.map((step) => step.agent)))

// steps a blocked chain never reached did not visit anyone's room
const reachedSteps = computed(() =>
  (props.currentEvent?.steps ?? []).filter((step) => step.allowed !== null),
)

// a leak or tampering marks the file at the end of its chain
const flaggedFiles = computed(() => {
  const flags = {}
  for (const event of props.shownEvents) {
    const lastStep = event.steps[event.steps.length - 1]
    if (event.outcome === 'leaked') flags[lastStep.file] = 'Leaked'
    if (event.outcome === 'tampered') flags[lastStep.file] = 'Tampered'
  }
  return flags
})

function visitsTo(fileId) {
  return reachedSteps.value
    .map((step, order) => ({ ...step, order }))
    .filter((step) => step.file === fileId)
}

function fileLabel(fileId) {
  if (props.level.model !== 'blp') return ''
  return formatLabel(props.level, props.policy.objectLabels[fileId])
}

function roomClass(fileId) {
  return {
    'is-visited': visitsTo(fileId).length > 0,
    'is-flagged': Boolean(flaggedFiles.value[fileId]),
  }
}
</script>

<template>
  <section class="clear-tower" aria-label="Tower floor plan">
    <ol class="clear-floors">
      <li v-for="floor in floors" :key="floor.id" class="clear-floor" data-testid="clear-floor">
        <span class="clear-floor-name">{{ floor.name }}</span>
        <div class="clear-rooms">
          <span v-if="!floor.rooms.length" class="clear-room is-empty">Empty floor</span>
          <div
            v-for="file in floor.rooms"
            :key="file.id"
            class="clear-room"
            :class="roomClass(file.id)"
            :data-testid="flaggedFiles[file.id] ? 'clear-flagged-room' : undefined"
          >
            <span class="clear-room-name">{{ file.name }}</span>
            <span v-if="fileLabel(file.id)" class="clear-tag">{{ fileLabel(file.id) }}</span>
            <span v-if="flaggedFiles[file.id]" class="clear-flag">{{ flaggedFiles[file.id] }}</span>
            <span
              v-for="visit in visitsTo(file.id)"
              :key="`${currentEvent.id}-${visit.order}`"
              class="clear-visitor"
              data-testid="clear-visitor"
              :class="visit.allowed ? 'is-allowed' : 'is-denied'"
            >
              {{ nameOf(level.agents, visit.agent) }} {{ visit.action }}s
              <strong class="clear-stamp">{{ visit.allowed ? 'Allowed' : 'Blocked' }}</strong>
            </span>
          </div>
        </div>
      </li>
    </ol>
    <div class="clear-lobby">
      <span class="clear-floor-name">Lobby</span>
      <ul class="clear-agents">
        <li
          v-for="agent in level.agents"
          :key="agent.id"
          class="clear-agent"
          :class="{ 'is-active': activeAgents.has(agent.id) }"
          :aria-current="activeAgents.has(agent.id) ? 'true' : undefined"
        >
          <span class="clear-agent-figure" aria-hidden="true"></span>
          <span>{{ agent.name }}</span>
          <span v-if="agent.label" class="clear-tag">{{ formatLabel(level, agent.label) }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>
