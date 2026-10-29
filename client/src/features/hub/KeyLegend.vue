<script setup>
defineProps({ open: { type: Boolean, default: false } })
const emit = defineEmits(['update:open'])
const keys = [
  ['WASD / arrows', 'move'],
  ['Space', 'jump'],
  ['Q / E', 'rotate'],
  ['R', 'reset camera'],
  ['Enter', 'go in'],
  ['Esc', 'deselect'],
]
</script>

<template>
  <div class="hub-keys">
    <button
      type="button"
      class="btn btn-secondary btn-sm hub-glass-btn hub-glass"
      data-testid="hub-keys"
      aria-controls="hub-keys-list"
      :aria-expanded="String(open)"
      @click="emit('update:open', !open)"
    >
      Keys
    </button>
    <ul v-show="open" id="hub-keys-list" class="hub-keys-list hub-glass" data-testid="hub-keys-list">
      <li v-for="[key, action] in keys" :key="key">
        <kbd>{{ key }}</kbd> {{ action }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.hub-keys {
  display: grid;
  justify-items: start;
  gap: 4px;
}
.hub-keys-list {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 8px 12px;
  font-size: 13px;
  list-style: none;
}
.hub-keys-list kbd {
  padding: 0 5px;
  border: 1px solid var(--hub-glass-edge);
  border-radius: 4px;
  background: var(--hub-glass-btn);
  color: inherit;
  font: inherit;
}
</style>
