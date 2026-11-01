<script setup>
import { computed } from 'vue'
import SafeInline from './SafeInline.vue'
import { newsDate, safeNewsLink } from '../news.js'
const props = defineProps({
  article: { type: Object, required: true },
  featured: Boolean,
  // a made-up story: no publisher name and no link out
  sample: Boolean,
})
const safeArticleUrl = computed(() => (props.sample ? null : safeNewsLink(props.article.url)))
</script>
<template>
  <article class="gazette-article" :class="{ 'gazette-featured': featured }">
    <p class="gazette-kicker">
      {{ featured ? 'THE LEAD STORY' : 'IN THE NEWS' }} ·
      {{ sample ? 'SAMPLE STORY, NOT REAL NEWS' : 'THE GUARDIAN' }}
    </p>
    <h2>
      <a v-if="safeArticleUrl" :href="safeArticleUrl" target="_blank" rel="noopener noreferrer"
        >{{ article.title }}<span class="visually-hidden"> (opens in a new tab)</span></a
      ><span v-else>{{ article.title }}</span>
    </h2>
    <p class="gazette-byline">
      <SafeInline :nodes="article.byline" /><span v-if="article.byline?.length"> · </span
      ><time :datetime="article.publishedAt">{{ newsDate(article.publishedAt, true) }} SGT</time>
    </p>
    <p v-if="article.excerpt?.length" class="gazette-excerpt">
      <SafeInline :nodes="article.excerpt" />
    </p>
    <p v-if="article.copyright" class="gazette-copyright">{{ article.copyright }}</p>
    <a
      v-if="safeArticleUrl"
      class="gazette-read"
      :href="safeArticleUrl"
      target="_blank"
      rel="noopener noreferrer"
      >Read at The Guardian ↗<span class="visually-hidden"> (opens in a new tab)</span></a
    >
  </article>
</template>
