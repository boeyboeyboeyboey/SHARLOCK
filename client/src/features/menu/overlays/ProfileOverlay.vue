<script setup>
import { computed, nextTick, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import OverlayPanel from '../OverlayPanel.vue'
import ProfilePage from '../../profile/ProfilePage.vue'
import ProgressPage from '../../progress/ProgressPage.vue'

defineEmits(['request-close'])
const route = useRoute()
const router = useRouter()
const tabs = [
  { id: 'profile', label: 'Profile' },
  { id: 'progress', label: 'Progress' },
]
const active = computed(() => (route.query.tab === 'progress' ? 'progress' : 'profile'))
const tabButtons = ref([])

function select(id) {
  if (id !== active.value) router.replace({ path: '/profile', query: { tab: id } })
}
// arrow keys move between tabs, selection follows focus
async function onKey(event, index) {
  const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key]
  if (!step) return
  event.preventDefault()
  const next = (index + step + tabs.length) % tabs.length
  select(tabs[next].id)
  await nextTick()
  tabButtons.value[next]?.focus()
}
</script>

<template>
  <OverlayPanel title="Profile & progress" @request-close="$emit('request-close')">
    <template #tabs>
      <div class="overlay-tabs" role="tablist" aria-label="Profile and progress">
        <button
          v-for="(tab, index) in tabs"
          :id="`profile-tab-${tab.id}`"
          :key="tab.id"
          :ref="(el) => (tabButtons[index] = el)"
          type="button"
          role="tab"
          class="overlay-tab"
          :data-testid="`profile-tab-${tab.id}`"
          :aria-selected="String(active === tab.id)"
          :aria-controls="`profile-panel-${tab.id}`"
          :tabindex="active === tab.id ? 0 : -1"
          @click="select(tab.id)"
          @keydown="onKey($event, index)"
        >
          {{ tab.label }}
        </button>
      </div>
    </template>
    <div :id="`profile-panel-${active}`" role="tabpanel" :aria-labelledby="`profile-tab-${active}`">
      <ProfilePage v-if="active === 'profile'" embedded />
      <ProgressPage v-else embedded />
    </div>
  </OverlayPanel>
</template>
