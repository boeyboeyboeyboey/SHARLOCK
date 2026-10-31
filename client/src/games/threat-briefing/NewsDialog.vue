<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import CyberNewsCentral from './CyberNewsCentral.vue'
import NewsTabs from './components/NewsTabs.vue'
import OwaspTopTen from './components/OwaspTopTen.vue'
import NewsAudio from './components/NewsAudio.vue'
import { useNewsLocation } from './composables/useNewsLocation.js'
import PixelIcon from '../../components/town/PixelIcon.vue'
import './news.css'

defineEmits(['request-close'])
const dialog = ref(null)
const heading = ref(null)
const audioMessage = ref('')
const { location, update } = useNewsLocation()
onMounted(() => {
  dialog.value.showModal()
  heading.value.focus({ preventScroll: true })
})
onBeforeUnmount(() => dialog.value?.close())
</script>
<template>
  <dialog
    id="news-dialog"
    ref="dialog"
    class="news-dialog"
    aria-labelledby="gazette-heading"
    aria-modal="true"
    @cancel.prevent="$emit('request-close')"
    @wheel.self.prevent
    @touchmove.self.prevent
  >
    <div class="gazette-topbar">
      <span><PixelIcon name="news" :size="20" /><span>THE DAILY BRIEFING</span></span>
      <div class="gazette-actions">
        <NewsAudio @status="audioMessage = $event" />
        <button
          type="button"
          class="gazette-button gazette-close"
          aria-label="Close newspaper"
          @click="$emit('request-close')"
        >
          Close <PixelIcon name="close" :size="16" />
        </button>
      </div>
    </div>
    <p v-if="audioMessage" id="times-audio-status" class="gazette-audio-status" role="status">
      {{ audioMessage }}
    </p>
    <header class="gazette-masthead">
      <img
        src="/images/town/capybara-mint.svg"
        width="96"
        height="72"
        alt="Your capybara newsstand vendor"
      />
      <div>
        <h1 id="gazette-heading" ref="heading" data-news-heading tabindex="-1">
          The Sharlock Times
        </h1>
      </div>
      <PixelIcon class="gazette-seal" name="news" :size="52" />
    </header>
    <NewsTabs :active-tab="location.tab" @update:tab="update({ tab: $event })" />
    <section
      id="times-panel-news"
      role="tabpanel"
      aria-labelledby="times-tab-news"
      tabindex="0"
      :hidden="location.tab !== 'news'"
    >
      <CyberNewsCentral v-if="location.tab === 'news'" :location="location" :update="update" />
    </section>
    <section
      id="times-panel-owasp"
      role="tabpanel"
      aria-labelledby="times-tab-owasp"
      tabindex="0"
      :hidden="location.tab !== 'owasp'"
    >
      <OwaspTopTen v-if="location.tab === 'owasp'" />
    </section>
  </dialog>
</template>
