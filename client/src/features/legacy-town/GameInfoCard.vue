<script setup>
import { computed, ref } from 'vue'
import PixelIcon from '../../components/town/PixelIcon.vue'
const props = defineProps({ game: { type: Object, required: true } })
defineEmits(['close'])
const actionLabel = computed(() => {
  if (props.game.activation === 'direct') return 'Read the Times'
  return 'Enter activity'
})
const heading = ref(null)
defineExpose({ focus: () => heading.value?.focus({ preventScroll: true }) })
</script>
<template>
  <section
    :id="`game-card-${game.id}`"
    class="game-info-card"
    :aria-labelledby="`game-heading-${game.id}`"
  >
    <div class="game-card-header">
      <span>ACTIVITY FILE</span
      ><button
        type="button"
        class="pixel-close"
        aria-label="Close activity details"
        @click="$emit('close')"
      >
        <PixelIcon name="close" :size="16" />
      </button>
    </div>
    <div class="game-card-content">
      <h2 :id="`game-heading-${game.id}`" ref="heading" tabindex="-1">{{ game.name }}</h2>
      <span v-if="game.needs3d" class="needs-3d" role="img" aria-label="Needs 3D">3D</span>
      <p>{{ game.description }}</p>
      <div class="difficulty-row">
        <span>Difficulty</span
        ><span
          class="difficulty-stars"
          role="img"
          :aria-label="`Difficulty: ${game.difficulty} out of 3 stars`"
          ><PixelIcon
            v-for="star in 3"
            :key="star"
            name="star"
            :class="{ 'star-empty': star > game.difficulty }"
            :size="20"
        /></span>
      </div>
      <h3>Background knowledge needed</h3>
      <ul class="knowledge-list">
        <li v-for="topic in game.backgroundKnowledge" :key="topic">{{ topic }}</li>
      </ul>
      <RouterLink :to="game.route" class="pixel-button enter-activity"
        >{{ actionLabel }}<PixelIcon name="arrow" :size="16"
      /></RouterLink>
    </div>
  </section>
</template>

<style scoped>
.needs-3d {
  display: inline-block;
  margin-bottom: 6px;
  padding: 0 6px;
  border: 2px solid currentColor;
  font-size: 0.7em;
  vertical-align: middle;
}
</style>
