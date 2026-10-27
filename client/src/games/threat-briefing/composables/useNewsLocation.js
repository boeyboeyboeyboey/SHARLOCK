import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export function parseNewsLocation(query) {
  return {
    tab: query.tab === 'owasp' ? 'owasp' : 'news',
    section: query.section === 'technology' ? 'technology' : 'cybersecurity',
    range: query.range === 'month' ? 'month' : 'week',
    query: typeof query.q === 'string' ? query.q.slice(0, 80) : '',
    page: typeof query.page === 'string' && /^[1-5]$/.test(query.page) ? Number(query.page) : 1,
  }
}
export function newsQuery(location) {
  return {
    ...(location.tab === 'owasp' && { tab: 'owasp' }),
    ...(location.section !== 'cybersecurity' && { section: location.section }),
    ...(location.range !== 'week' && { range: location.range }),
    ...(location.query && { q: location.query }),
    ...(location.page > 1 && { page: String(location.page) }),
  }
}
export function searchEdition(articles, query) {
  const needle = query.trim().toLocaleLowerCase('en')
  return articles.filter((article) =>
    [
      article.title,
      ...(article.excerpt || []).map((node) => node.text || ''),
      ...(article.byline || []).map((node) => node.text || ''),
    ]
      .join(' ')
      .toLocaleLowerCase('en')
      .includes(needle),
  )
}
// latest intended query, so two updates before a replace commits do not read a stale route
let pendingLocation = null

export function useNewsLocation() {
  const route = useRoute()
  const router = useRouter()
  const location = computed(() => parseNewsLocation(route.query))
  watch(
    () => route.query,
    (query) => {
      if (route.name !== 'news') return
      const canonical = newsQuery(parseNewsLocation(query))
      if (JSON.stringify(query) !== JSON.stringify(canonical))
        router.replace({ name: 'news', query: canonical })
    },
    { immediate: true },
  )
  function update(changes) {
    const resetPage = ['section', 'range', 'query'].some((key) => key in changes)
    const base = pendingLocation || location.value
    const value = { ...base, ...(resetPage && { page: 1 }), ...changes }
    pendingLocation = value
    return router.replace({ name: 'news', query: newsQuery(value) }).finally(() => {
      if (pendingLocation === value) pendingLocation = null
    })
  }
  return {
    location,
    update,
    section: computed(() => location.value.section),
    range: computed(() => location.value.range),
  }
}
