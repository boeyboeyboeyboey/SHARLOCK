<script setup>
import { computed, ref } from 'vue'
import PixelIcon from '../town/PixelIcon.vue'
const props = defineProps({
  achievements: { type: Array, default: () => [] },
  // not yet earned badges (id, name, description); never counted as recent
  locked: { type: Array, default: () => [] },
})

const RECENT_COUNT = 2
// newest first when badges carry an earnedAt date, otherwise the given order is kept
const ordered = computed(() =>
  [...props.achievements].sort(
    (a, b) => (Date.parse(b.earnedAt) || 0) - (Date.parse(a.earnedAt) || 0),
  ),
)
const recent = computed(() => ordered.value.slice(0, RECENT_COUNT))
const past = computed(() => ordered.value.slice(RECENT_COUNT))

const dialog = ref(null)
function openPast() {
  if (typeof dialog.value?.showModal === 'function') dialog.value.showModal()
  else dialog.value?.setAttribute('open', '')
}
function closePast() {
  if (dialog.value?.open && typeof dialog.value.close === 'function') dialog.value.close()
  else dialog.value?.removeAttribute('open')
}
</script>

<template>
  <section class="trophy-case" aria-labelledby="trophy-heading">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Little wins. Lasting skills.</p>
        <h2 id="trophy-heading">Your trophy case</h2>
      </div>
      <button v-if="past.length" type="button" class="btn btn-secondary" @click="openPast">
        See past achievements ({{ past.length }})
      </button>
      <PixelIcon v-else name="trophy" :size="32" aria-hidden="true" />
    </div>
    <ul v-if="recent.length" class="achievement-list">
      <li v-for="badge in recent" :key="badge.id" class="achievement-badge">
        <div class="badge-art">
          <PixelIcon :name="badge.icon" :size="64" />
        </div>
        <div>
          <h3>{{ badge.name }}</h3>
          <p>{{ badge.description }}</p>
        </div>
      </li>
    </ul>
    <p v-else class="empty-trophies">
      Your first badge is waiting. Complete a case to begin your collection.
    </p>

    <template v-if="locked.length">
      <h3 id="locked-heading" class="locked-heading">Still to find</h3>
      <ul class="achievement-list" aria-labelledby="locked-heading">
        <li
          v-for="badge in locked"
          :key="badge.id"
          class="achievement-badge achievement-badge--locked"
        >
          <div class="badge-art">
            <PixelIcon name="lock" :size="64" />
          </div>
          <div>
            <h4>{{ badge.name }}</h4>
            <p class="locked-label">Locked</p>
            <p>{{ badge.description }}</p>
          </div>
        </li>
      </ul>
    </template>

    <dialog
      v-if="past.length"
      ref="dialog"
      class="past-achievements"
      aria-labelledby="past-heading"
    >
      <div class="past-achievements__card">
        <div class="section-heading">
          <h2 id="past-heading">Past achievements</h2>
          <button type="button" class="btn btn-secondary" @click="closePast">Close</button>
        </div>
        <ul class="achievement-list">
          <li v-for="badge in past" :key="badge.id" class="achievement-badge">
            <div class="badge-art">
              <PixelIcon :name="badge.icon" :size="64" />
            </div>
            <div>
              <h3>{{ badge.name }}</h3>
              <p>{{ badge.description }}</p>
            </div>
          </li>
        </ul>
      </div>
    </dialog>
  </section>
</template>

<style scoped>
.locked-heading {
  margin-top: 2rem;
  font-size: 1.25rem;
}
.achievement-badge--locked {
  border-style: dashed;
}
.achievement-badge--locked h4 {
  margin-top: 1rem;
  font-size: 1rem;
}
.achievement-badge--locked .badge-art {
  opacity: 0.6;
}
.locked-label {
  font-family: var(--font-pixel);
  font-weight: 700;
  margin-bottom: 0.25rem;
}
</style>
