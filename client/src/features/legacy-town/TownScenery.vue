<script setup>
import { bargesMarkup, groundMarkup, lampsMarkup, lifeMarkup, propsMarkup } from './townArt.js'
const ground = groundMarkup()
const props = propsMarkup()
const lamps = lampsMarkup()
const barges = bargesMarkup()
const life = lifeMarkup()
// z-index follows the foot of each image so lower sprites overlap higher ones
const trees = [
  { x: 0, y: 230 },
  { x: 0, y: 470 },
  { x: 0, y: 650 },
  { x: 0, y: 725 },
  { x: 80, y: 735 },
  { x: 300, y: 735 },
  { x: 1056, y: 250 },
  { x: 1056, y: 420 },
  { x: 1056, y: 500 },
]
const bushes = [
  { x: 176, y: 470 },
  { x: 176, y: 640 },
  { x: 70, y: 470 },
  { x: 960, y: 395 },
  { x: 1000, y: 530 },
  { x: 900, y: 335 },
  { x: 200, y: 750 },
  { x: 700, y: 640 },
  { x: 1056, y: 770 },
]
const zFor = (y, h) => Math.round(y + h)
</script>
<template>
  <!-- ground, props and lamps are static trusted svg from townArt.js -->
  <!-- eslint-disable vue/no-v-html -->
  <div class="town-scenery" aria-hidden="true">
    <svg
      class="town-ground"
      width="1120"
      height="800"
      viewBox="0 0 280 200"
      shape-rendering="crispEdges"
      v-html="ground"
    />
    <svg
      class="town-barges"
      width="1120"
      height="800"
      viewBox="0 0 280 200"
      shape-rendering="crispEdges"
      v-html="barges"
    />
    <div class="town-props" v-html="props" />
    <div class="town-life" v-html="life" />
    <img
      v-for="(tree, index) in trees"
      :key="`tree-${index}`"
      class="pixel-tree"
      src="/images/town/tree.svg"
      width="64"
      height="80"
      alt=""
      :style="{ left: `${tree.x}px`, top: `${tree.y}px`, zIndex: zFor(tree.y, 80) }"
    />
    <img
      v-for="(bush, index) in bushes"
      :key="`bush-${index}`"
      class="pixel-bush"
      src="/images/town/bush.svg"
      width="64"
      height="40"
      alt=""
      :style="{ left: `${bush.x}px`, top: `${bush.y}px`, zIndex: zFor(bush.y, 40) }"
    />
    <svg
      class="town-lamps"
      width="1120"
      height="800"
      viewBox="0 0 280 200"
      shape-rendering="crispEdges"
      v-html="lamps"
    />
  </div>
</template>
