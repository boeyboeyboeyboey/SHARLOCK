<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useAuthStore } from '../../auth/store.js'
import { equipWardrobeItem, getWardrobe, safeError } from '../api.js'
import { SLOTS, SLOT_LABELS, WARDROBE_LOOK } from '../../../data/wardrobeLook.js'

const auth = useAuthStore()
const items = ref([])
const equipped = ref({})
const loading = ref(true)
const loadError = ref(null)
const notice = ref('')
const saveError = ref('')
const pendingSlot = ref(null)
const version = ref(0)
let controller = null

const itemsFor = (slot) => items.value.filter((item) => item.slot === slot)
const chip = (id) => WARDROBE_LOOK[id]?.hex ?? null

async function load() {
  controller?.abort()
  controller = new AbortController()
  loading.value = true
  loadError.value = null
  try {
    const loaded = await getWardrobe({ signal: controller.signal })
    items.value = loaded.items
    equipped.value = loaded.equipped
  } catch (error) {
    if (controller.signal.aborted) return
    loadError.value = safeError(error)
  } finally {
    if (!controller.signal.aborted) loading.value = false
  }
}

async function choose(slot, item) {
  if (!item.unlocked || pendingSlot.value || equipped.value[slot] === item.id) return
  pendingSlot.value = slot
  notice.value = ''
  saveError.value = ''
  try {
    const saved = await equipWardrobeItem(slot, item.id)
    equipped.value = saved
    auth.setWardrobe(saved)
    notice.value = `${item.name} equipped.`
  } catch (error) {
    saveError.value = safeError(error).message
    // re-render the radios so the native selection returns to the saved item
    version.value += 1
  } finally {
    pendingSlot.value = null
  }
}

onMounted(load)
onBeforeUnmount(() => controller?.abort())
</script>

<template>
  <section class="wardrobe" aria-labelledby="wardrobe-heading" data-testid="wardrobe">
    <h2 id="wardrobe-heading">Wardrobe</h2>
    <p v-if="loading" role="status">Loading your wardrobe…</p>
    <div v-else-if="loadError" class="preview-notice" role="alert">
      <p>{{ loadError.message }}</p>
      <button class="btn btn-secondary" type="button" @click="load">Try again</button>
    </div>
    <template v-else>
      <fieldset
        v-for="slot in SLOTS"
        :key="`${slot}-${version}`"
        class="wardrobe__slot"
        :aria-busy="pendingSlot === slot"
      >
        <legend>{{ SLOT_LABELS[slot] }}</legend>
        <label
          v-for="item in itemsFor(slot)"
          :key="item.id"
          class="wardrobe__choice"
          :class="{ 'wardrobe__choice--locked': !item.unlocked }"
        >
          <input
            type="radio"
            class="wardrobe__input"
            :name="`wardrobe-${slot}`"
            :value="item.id"
            :checked="equipped[slot] === item.id"
            :disabled="!item.unlocked"
            @change="choose(slot, item)"
          />
          <span
            class="wardrobe__chip"
            :class="{ 'wardrobe__chip--none': !chip(item.id) }"
            :style="chip(item.id) ? { backgroundColor: chip(item.id) } : null"
            aria-hidden="true"
          ></span>
          <span class="wardrobe__name">{{ item.name }}</span>
          <small v-if="!item.unlocked" class="wardrobe__lock">
            Locked: earn {{ item.unlockedByName }}
          </small>
        </label>
      </fieldset>
    </template>
    <p class="wardrobe__live" role="status" aria-live="polite">{{ notice }}</p>
    <p v-if="saveError" class="wardrobe__error" role="alert">{{ saveError }}</p>
  </section>
</template>
