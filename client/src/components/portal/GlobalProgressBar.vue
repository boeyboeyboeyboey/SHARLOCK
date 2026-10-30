<script setup>
import { computed } from 'vue'
import PixelIcon from '../town/PixelIcon.vue'
const props = defineProps({
  completed: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
})
function normalizeCount(value) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}
const totalCount = computed(() => normalizeCount(props.total))
const completedCount = computed(() => Math.min(totalCount.value, normalizeCount(props.completed)))
const percentage = computed(() =>
  totalCount.value ? Math.round((completedCount.value / totalCount.value) * 100) : 0,
)
</script>

<template>
  <section class="curriculum-progress" aria-label="Curriculum progress">
    <PixelIcon name="chart" class="progress-icon" :size="27" aria-hidden="true" />
    <div class="flex-grow-1 min-width-0">
      <div class="d-flex justify-content-between gap-3 mb-2">
        <span class="small"
          >Your learning journey
          <span class="progress-count"
            >· {{ completedCount }} of {{ totalCount }} activities</span
          ></span
        ><strong class="small">{{ percentage }}%</strong>
      </div>
      <div
        class="progress"
        role="progressbar"
        aria-label="Curriculum completion"
        :aria-valuenow="percentage"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div class="progress-bar" :style="{ width: `${percentage}%` }"></div>
      </div>
    </div>
  </section>
</template>
