<script setup>
import { computed, nextTick, ref, toRefs, watch } from 'vue'
import NewsArticle from './components/NewsArticle.vue'
import NewsFilters from './components/NewsFilters.vue'
import NewsPagination from './components/NewsPagination.vue'
import NewsStatus from './components/NewsStatus.vue'
import { useCyberNews } from './composables/useCyberNews.js'
import { searchEdition } from './composables/useNewsLocation.js'
import { newsDate } from './news.js'

const props = defineProps({
  location: { type: Object, required: true },
  update: { type: Function, required: true },
})
const { location } = toRefs(props)
const section = computed(() => location.value.section)
const range = computed(() => location.value.range)
const update = (changes) => props.update(changes)
const { edition, loading, error, stale, refreshAt, canRefresh, refresh } = useCyberNews(
  section,
  range,
)
const resultsHeading = ref(null)
const filtered = computed(() => searchEdition(edition.value?.articles || [], location.value.query))
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / 10)))
const page = computed(() => Math.min(location.value.page, pageCount.value))
const articles = computed(() => filtered.value.slice((page.value - 1) * 10, page.value * 10))
watch([edition, pageCount], () => {
  if (edition.value && location.value.page > pageCount.value) update({ page: pageCount.value })
})
async function changePage(number) {
  await update({ page: number })
  await nextTick()
  resultsHeading.value?.focus()
}
</script>
<template>
  <div class="gazette-edition">
    <div class="gazette-edition-line">
      <span>INDEPENDENT CURIOSITY · SHARLOCK TOWN</span
      ><span>{{ edition ? newsDate(edition.dateKey) : 'YOUR WINDOW ON THE DIGITAL WORLD' }}</span
      ><span>FREE TO EXPLORE</span>
    </div>
    <NewsFilters
      :section="section"
      :range="range"
      :query="location.query"
      :loading="loading"
      :can-refresh="canRefresh"
      @update:section="update({ section: $event })"
      @update:range="update({ range: $event })"
      @update:query="update({ query: $event })"
      @refresh="refresh"
    />
    <NewsStatus
      :loading="loading"
      :error="error"
      :stale="stale"
      :partial="edition?.partial"
      :fetched-at="edition?.fetchedAt"
      :refresh-available-at="refreshAt"
      :can-refresh="canRefresh"
      :sample="edition?.sample"
      @retry="refresh"
    />
    <p v-if="edition?.sample" class="gazette-sample" data-testid="news-sample-label">
      <strong>Sample edition.</strong> These stories are made up for this project. This is not real
      news.
    </p>
    <section :aria-busy="loading" aria-labelledby="gazette-results-heading">
      <div class="gazette-results-line">
        <h2 id="gazette-results-heading" ref="resultsHeading" tabindex="-1">
          {{
            section === 'cybersecurity'
              ? 'Cybersecurity dispatches'
              : 'From the world of technology'
          }}
        </h2>
        <span v-if="edition"
          >{{ filtered.length }} {{ filtered.length === 1 ? 'story' : 'stories' }} · Page
          {{ page }} of {{ pageCount }}</span
        >
      </div>
      <div v-if="loading && !edition" class="gazette-loading" aria-hidden="true">
        <span>PRESS ROOM</span>
        <p>Gathering the latest dispatches</p>
        <div></div>
        <div></div>
        <div></div>
      </div>
      <div v-else-if="edition && !filtered.length" class="gazette-empty">
        <img src="/images/town/capybara-mint.svg" width="128" height="96" alt="" />
        <h3>{{ location.query ? 'No matching dispatches' : 'A quiet news desk' }}</h3>
        <p>
          {{
            location.query
              ? 'Try another word, or clear the search to see this edition.'
              : 'No stories were returned for this section and date range. Try the past 30 days or check again later.'
          }}
        </p>
        <button
          v-if="location.query"
          type="button"
          class="gazette-button"
          @click="update({ query: '' })"
        >
          Clear search</button
        ><button
          v-else-if="range === 'week'"
          type="button"
          class="gazette-button"
          @click="update({ range: 'month' })"
        >
          Browse older stories
        </button>
      </div>
      <div v-else class="gazette-grid">
        <NewsArticle
          v-for="(article, index) in articles"
          :key="article.id"
          :article="article"
          :featured="page === 1 && index === 0"
          :sample="edition.sample"
        />
      </div>
      <NewsPagination :page="page" :page-count="pageCount" @update:page="changePage" />
    </section>
    <footer class="gazette-footer">
      <p>
        Up to 50 latest stories per section and date range. Search covers this edition. All dates
        use Singapore time.{{ edition?.sample ? '' : ' Full articles open in a new tab.' }}
      </p>
      <a
        v-if="edition && !edition.sample"
        href="https://www.theguardian.com"
        target="_blank"
        rel="noopener noreferrer"
        class="gazette-provider"
        ><img
          src="https://static.guim.co.uk/sys-images/Guardian/Pix/pictures/2010/03/01/poweredbyguardianBLACK.png"
          alt="Powered by The Guardian"
          width="150"
          height="45"
        /><span class="visually-hidden"> (opens in a new tab)</span></a
      ><span>CURIOUS MINDS MAKE A SAFER TOWN</span>
    </footer>
  </div>
</template>
