<script setup>
import PixelIcon from '../../components/town/PixelIcon.vue'
import './destinationRow.css'

// pressed is null for a plain action row (2d Places) and a boolean for a toggle row (3d list)
defineProps({
  game: { type: Object, required: true },
  pressed: { type: Boolean, default: null },
})
</script>

<template>
  <button
    type="button"
    class="dest-row"
    :style="{ '--dest-accent': game.accent }"
    :aria-label="game.needs3d && pressed === null ? `${game.name}, needs 3D` : game.name"
    :aria-pressed="pressed === null ? undefined : String(pressed)"
  >
    <PixelIcon :name="game.icon" :size="18" aria-hidden="true" class="dest-row-icon" />
    <span class="dest-row-name" aria-hidden="true">{{ game.shortName }}</span>
    <span v-if="game.needs3d && pressed === null" class="dest-row-3d" aria-hidden="true">3D</span>
    <span v-if="pressed" class="dest-row-check" aria-hidden="true">&#10003;</span>
  </button>
</template>
