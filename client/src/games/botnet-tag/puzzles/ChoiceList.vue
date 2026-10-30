<script setup>
// shared single-choice radio list used by the index puzzles
defineProps({
  name: { type: String, required: true },
  modelValue: { type: Number, default: -1 },
  items: { type: Array, required: true },
})
defineEmits(['update:modelValue'])
</script>

<template>
  <ul class="pz-list" role="radiogroup">
    <li v-for="(item, i) in items" :key="i">
      <label class="pz-pick" :class="{ 'is-on': modelValue === i }">
        <input
          type="radio"
          :name="name"
          :value="i"
          :checked="modelValue === i"
          @change="$emit('update:modelValue', i)"
        />
        <slot :item="item" :index="i" />
      </label>
    </li>
  </ul>
</template>
