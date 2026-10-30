<script setup>
defineProps({
  step: { type: Number, default: 0 },
  reducedMotion: { type: Boolean, default: false },
})

const CAPTIONS = [
  'The infected chase, you run',
  'Station reached: a shield appears',
  'Close enough: the survivor turns red',
  'The timer runs down to 3:00',
]
</script>

<template>
  <div
    class="tag-howto"
    :class="[`is-step-${step}`, { 'is-static': reducedMotion }]"
    data-testid="tag-howto-scene"
  >
    <svg viewBox="0 0 200 120" class="tag-howto-arena" role="presentation">
      <rect x="4" y="4" width="192" height="112" rx="6" class="arena" />
      <rect x="150" y="18" width="30" height="22" rx="3" class="station" />
      <text x="165" y="33" class="station-label">E</text>
      <circle cx="165" cy="29" r="18" class="shield" />
      <circle cx="40" cy="80" r="7" class="bad" />
      <circle cx="100" cy="64" r="7" class="good" />
      <circle cx="100" cy="64" r="12" class="aura" />
      <text x="100" y="24" class="clock">{{ step === 3 ? '0:09' : '2:41' }}</text>
    </svg>
    <p class="tag-howto-caption">{{ CAPTIONS[step] ?? CAPTIONS[0] }}</p>
  </div>
</template>

<style scoped>
.tag-howto {
  display: grid;
  gap: 0.5rem;
}

.tag-howto-arena {
  width: 100%;
  max-height: 14rem;
  background: #0b1424;
  border-radius: 0.5rem;
}

.arena {
  fill: #101c33;
  stroke: #3a5a8c;
  stroke-width: 1.5;
}

.station {
  fill: #1f6f5c;
  stroke: #7ef0cf;
}

.station-label {
  fill: #e8fff8;
  font-size: 9px;
  text-anchor: middle;
}

.shield {
  fill: none;
  stroke: #7ef0cf;
  stroke-width: 2;
  opacity: 0;
}

.bad {
  fill: #ff5470;
}

.good {
  fill: #5cc8ff;
  transition: fill 0.4s;
}

.aura {
  fill: none;
  stroke: #ff5470;
  stroke-width: 2;
  opacity: 0;
}

.clock {
  fill: #cfe3ff;
  font-size: 11px;
  text-anchor: middle;
}

.tag-howto-caption {
  margin: 0;
  padding: 0.25rem 0.5rem;
  font-size: 0.85rem;
  border-left: 3px solid #5cc8ff;
}

/* step 0: the infected dot closes in while the survivor moves away */
.is-step-0 .bad {
  animation: chase 3s ease-in-out infinite alternate;
}

.is-step-0 .good {
  animation: flee 3s ease-in-out infinite alternate;
}

/* step 1: the survivor reaches the station and the shield shows */
.is-step-1 .good {
  animation: to-station 3s ease-in-out infinite alternate;
}

.is-step-1 .shield {
  animation: shield 3s ease-in-out infinite alternate;
}

.is-step-1 .bad {
  transform: translate(10px, -10px);
}

/* step 2: the infected dot reaches the survivor, who turns red */
.is-step-2 .bad {
  animation: reach 3s ease-in-out infinite alternate;
}

.is-step-2 .good {
  animation: infect 3s steps(1) infinite alternate;
}

.is-step-2 .aura {
  animation: shield 3s ease-in-out infinite alternate;
  stroke: #ff5470;
}

.is-step-3 .clock {
  animation: blink 1s steps(2) infinite;
}

@keyframes chase {
  to {
    transform: translate(48px, -12px);
  }
}

@keyframes flee {
  to {
    transform: translate(40px, -10px);
  }
}

@keyframes to-station {
  to {
    transform: translate(60px, -40px);
  }
}

@keyframes shield {
  50%,
  100% {
    opacity: 1;
  }
}

@keyframes reach {
  to {
    transform: translate(52px, -12px);
  }
}

@keyframes infect {
  50%,
  100% {
    fill: #ff5470;
  }
}

@keyframes blink {
  50% {
    opacity: 0.35;
  }
}

.is-static *,
.is-static *::before {
  animation: none !important;
  transition: none !important;
}

.is-static.is-step-1 .good {
  transform: translate(60px, -40px);
}

.is-static.is-step-1 .shield,
.is-static.is-step-2 .aura {
  opacity: 1;
}

.is-static.is-step-2 .good {
  fill: #ff5470;
}

.is-static.is-step-2 .bad {
  transform: translate(52px, -12px);
}

@media (prefers-reduced-motion: reduce) {
  .tag-howto *,
  .tag-howto *::before {
    animation: none !important;
    transition: none !important;
  }
}
</style>
