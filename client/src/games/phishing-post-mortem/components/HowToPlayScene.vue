<script setup>
defineProps({
  step: { type: Number, default: 0 },
  reducedMotion: { type: Boolean, default: false },
})
</script>

<template>
  <div class="scene" :class="{ 'is-static': reducedMotion }" aria-hidden="true">
    <div class="scene-stage">
      <div class="scene-deck">
        <div class="scene-card is-first">
          <p class="scene-from"><strong>From</strong> Mira, People team</p>
          <p class="scene-address">&lt;mira@aurora.example&gt;</p>
          <p class="scene-subject">Friday lunch menu</p>
          <span class="scene-stamp is-trusted">Trusted</span>
        </div>
        <div class="scene-card is-second">
          <p class="scene-from">
            <strong>From</strong>
            <span class="scene-sender">Aurora IT it@aurora-support.example</span>
          </p>
          <p class="scene-address">Goes to: login.aurora-verify.example</p>
          <p class="scene-subject">Action required</p>
          <span class="scene-stamp is-reported">Reported</span>
        </div>
      </div>
      <div class="scene-buttons">
        <span class="scene-button is-report">Report</span>
        <span class="scene-button is-trust">Trust</span>
      </div>
      <span class="scene-ripple is-on-trust"></span>
      <span class="scene-ripple is-on-report"></span>
      <span class="scene-ripple is-on-sender"></span>
      <svg class="scene-cursor" viewBox="0 0 16 22" width="18" height="24" focusable="false">
        <path
          d="M1 1v17l4.5-4.2 3 6.7 3-1.4-3-6.6H15z"
          fill="#fff"
          stroke="#1f2933"
          stroke-width="1.5"
          stroke-linejoin="round"
        />
      </svg>
    </div>
  </div>
</template>

<style scoped>
.scene {
  font-size: 0.85rem;
}

.scene-stage {
  position: relative;
  height: 11rem;
}

.scene-deck {
  position: absolute;
  inset: 0 0 auto;
  height: 6.4rem;
}

.scene-card {
  position: absolute;
  inset: 0;
  display: grid;
  align-content: start;
  gap: 0.15rem;
  padding: 0.5rem 0.6rem;
  overflow: hidden;
  background: var(--game-surface);
  border: 2px solid var(--game-line);
  border-radius: 6px;
}

.scene-card p {
  margin: 0;
}

.scene-address {
  color: var(--game-muted);
}

.scene-subject {
  font-weight: 700;
}

.scene-sender {
  padding: 0 0.2rem;
  color: var(--game-bad);
  background: var(--game-bad-soft);
  font-weight: 700;
}

.scene-card.is-first,
.scene-stamp.is-trusted {
  visibility: hidden;
}

.scene-stamp {
  position: absolute;
  right: 0.6rem;
  bottom: 0.45rem;
  padding: 0.1rem 0.5rem;
  font-weight: 700;
  color: #fff;
  border-radius: 4px;
  opacity: 0;
  transform: rotate(-8deg);
}

.scene-stamp.is-trusted {
  background: var(--game-good);
}

.scene-stamp.is-reported {
  background: var(--game-bad);
}

.scene-buttons {
  position: absolute;
  inset: auto 0 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.scene-button {
  padding: 0.5rem;
  font-weight: 700;
  color: #fff;
  text-align: center;
  border-radius: 6px;
}

.scene-button.is-report {
  background: var(--game-bad);
}

.scene-button.is-trust {
  background: var(--game-good);
}

.scene-ripple {
  position: absolute;
  width: 2.2rem;
  height: 2.2rem;
  margin: -1.1rem 0 0 -1.1rem;
  border: 2px solid var(--game-ink);
  border-radius: 50%;
  opacity: 0;
}

.scene-ripple.is-on-trust {
  top: 88%;
  left: 75%;
}

.scene-ripple.is-on-report {
  top: 88%;
  left: 25%;
}

.scene-ripple.is-on-sender {
  top: 11%;
  left: 24%;
}

.scene-cursor {
  position: absolute;
  top: 12%;
  left: 24%;
  filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.3));
}

@media (prefers-reduced-motion: no-preference) {
  .scene:not(.is-static) .scene-stage {
    animation: scene-fade 9s linear infinite;
  }

  .scene:not(.is-static) .scene-card.is-first {
    visibility: visible;
    animation: scene-first 9s ease-in-out infinite;
  }

  .scene:not(.is-static) .scene-card.is-second {
    animation: scene-second 9s ease-in-out infinite;
  }

  .scene:not(.is-static) .scene-sender {
    animation: scene-sender 9s step-end infinite;
  }

  .scene:not(.is-static) .scene-stamp.is-trusted {
    visibility: visible;
    animation: scene-stamp-trusted 9s ease-out infinite;
  }

  .scene:not(.is-static) .scene-stamp.is-reported {
    animation: scene-stamp-reported 9s ease-out infinite;
  }

  .scene:not(.is-static) .scene-button.is-trust {
    animation: scene-press-trust 9s ease-out infinite;
  }

  .scene:not(.is-static) .scene-button.is-report {
    animation: scene-press-report 9s ease-out infinite;
  }

  .scene:not(.is-static) .scene-ripple.is-on-trust {
    animation: scene-ripple-trust 9s ease-out infinite;
  }

  .scene:not(.is-static) .scene-ripple.is-on-report {
    animation: scene-ripple-report 9s ease-out infinite;
  }

  .scene:not(.is-static) .scene-ripple.is-on-sender {
    animation: scene-ripple-sender 9s ease-out infinite;
  }

  .scene:not(.is-static) .scene-cursor {
    animation: scene-cursor 9s ease-in-out infinite;
  }
}

@keyframes scene-fade {
  0% {
    opacity: 0;
  }
  4%,
  93% {
    opacity: 1;
  }
  99%,
  100% {
    opacity: 0;
  }
}

@keyframes scene-first {
  0%,
  44% {
    opacity: 1;
    transform: translateX(0);
  }
  52%,
  100% {
    opacity: 0;
    transform: translateX(-35%);
  }
}

@keyframes scene-second {
  0%,
  44% {
    opacity: 0;
    transform: translateX(40%);
  }
  52%,
  100% {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes scene-sender {
  0%,
  65% {
    color: var(--game-ink);
    background: transparent;
  }
  66%,
  100% {
    color: var(--game-bad);
    background: var(--game-bad-soft);
  }
}

@keyframes scene-stamp-trusted {
  0%,
  23% {
    opacity: 0;
    transform: rotate(-8deg) scale(1.8);
  }
  28%,
  42% {
    opacity: 1;
    transform: rotate(-8deg) scale(1);
  }
  46%,
  100% {
    opacity: 0;
    transform: rotate(-8deg) scale(1);
  }
}

@keyframes scene-stamp-reported {
  0%,
  78% {
    opacity: 0;
    transform: rotate(-8deg) scale(1.8);
  }
  83%,
  93% {
    opacity: 1;
    transform: rotate(-8deg) scale(1);
  }
  98%,
  100% {
    opacity: 0;
    transform: rotate(-8deg) scale(1);
  }
}

@keyframes scene-press-trust {
  0%,
  20%,
  27%,
  100% {
    transform: scale(1);
  }
  23% {
    transform: scale(0.94);
  }
}

@keyframes scene-press-report {
  0%,
  58%,
  65%,
  100% {
    transform: scale(1);
  }
  61% {
    transform: scale(0.94);
  }
}

@keyframes scene-ripple-trust {
  0%,
  22% {
    opacity: 0.7;
    transform: scale(0.2);
  }
  32%,
  100% {
    opacity: 0;
    transform: scale(1.6);
  }
}

@keyframes scene-ripple-report {
  0%,
  60% {
    opacity: 0.7;
    transform: scale(0.2);
  }
  70%,
  100% {
    opacity: 0;
    transform: scale(1.6);
  }
}

@keyframes scene-ripple-sender {
  0%,
  76% {
    opacity: 0.7;
    transform: scale(0.2);
  }
  86%,
  100% {
    opacity: 0;
    transform: scale(1.6);
  }
}

@keyframes scene-cursor {
  0%,
  6% {
    top: 100%;
    left: 55%;
  }
  20%,
  46% {
    top: 88%;
    left: 75%;
  }
  57%,
  62% {
    top: 88%;
    left: 25%;
  }
  72%,
  100% {
    top: 11%;
    left: 24%;
  }
}
</style>
