<script setup>
import OverlayPanel from '../OverlayPanel.vue'
import { useDiscoveries } from '../../hub/discoveries.js'
import { finds } from '../../hub/scenes/wharf/finds.js'

defineEmits(['request-close'])
const discoveries = useDiscoveries()
</script>

<template>
  <OverlayPanel title="Discoveries" @request-close="$emit('request-close')">
    <p class="discoveries-count" data-testid="discoveries-count">
      Found <strong>{{ discoveries.count.value }}/{{ discoveries.total }}</strong>
    </p>
    <ul class="discoveries-list">
      <li v-for="find in finds" :key="find.id" :data-testid="`discovery-${find.id}`">
        <template v-if="discoveries.has(find.id)">
          <h3>{{ find.name }}</h3>
          <p>{{ find.lines[0] }}</p>
          <p><strong>Sharlock's note</strong></p>
          <p>{{ find.note }}</p>
        </template>
        <template v-else>
          <h3>???</h3>
          <p>Somewhere in the {{ find.pocket }}</p>
        </template>
      </li>
    </ul>
  </OverlayPanel>
</template>

<style scoped>
.discoveries-list {
  display: grid;
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.discoveries-list h3 {
  margin: 0 0 4px;
  font-size: 1rem;
}
.discoveries-list p {
  margin: 0 0 4px;
}
</style>
