<script setup>
import { computed } from 'vue'
import { avatarFor } from '../../../features/auth/avatars.js'
import { MAX_PLAYERS } from '../tagRules.js'

const props = defineProps({
  players: { type: Array, default: () => [] },
  sid: { type: String, default: '' },
  className: { type: String, default: '' },
  countdownMs: { type: Number, default: null },
})
defineEmits(['ready'])

const me = computed(() => props.players.find((player) => player.sid === props.sid))
const ready = computed(() => Boolean(me.value?.ready))
const digit = computed(() =>
  props.countdownMs === null ? '' : Math.ceil(props.countdownMs / 1000),
)
</script>

<template>
  <section class="tag-panel tag-lobby" aria-labelledby="tag-lobby-title" data-testid="tag-lobby">
    <header class="tag-panel-head">
      <h1 id="tag-lobby-title">Botnet Tag</h1>
      <span class="tag-chip" :aria-label="`${players.length} of ${MAX_PLAYERS} players`"
        >{{ players.length }}/{{ MAX_PLAYERS }}</span
      >
    </header>
    <p v-if="className" class="tag-class" data-testid="tag-class">{{ className }}</p>
    <ul class="tag-cards" aria-label="Players">
      <li
        v-for="player in players"
        :key="player.sid"
        class="tag-card"
        :class="{ 'is-me': player.sid === sid }"
        data-testid="tag-player"
      >
        <img
          class="tag-avatar"
          :src="avatarFor(player.avatarId).path"
          alt=""
          width="48"
          height="48"
        />
        <span class="tag-name"
          >{{ player.username
          }}<span v-if="player.sid === sid" class="visually-hidden"> (you)</span></span
        >
        <span v-if="player.isBot" class="tag-chip is-bot">Bot</span>
        <span v-else-if="player.isStaff" class="tag-chip">Staff</span>
        <span class="tag-chip" :class="player.ready ? 'is-ready' : 'is-wait'">{{
          player.ready ? '✓ Ready' : 'Waiting'
        }}</span>
      </li>
    </ul>
    <div class="tag-countdown" aria-live="polite" data-testid="tag-countdown">
      <template v-if="countdownMs !== null"
        ><span class="visually-hidden">Starting in </span>{{ digit }}</template
      >
    </div>
    <div class="tag-foot">
      <button
        type="button"
        class="tag-btn is-primary"
        :aria-pressed="String(ready)"
        data-testid="tag-ready"
        @click="$emit('ready', !ready)"
      >
        {{ ready ? '✓ Ready' : 'Ready' }}
      </button>
    </div>
  </section>
</template>
