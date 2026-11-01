import {
  COOLDOWN_MS,
  EDITION_LIMIT,
  FRESH_MS,
  LIFETIME_MS,
  TIMEZONE,
  NewsError,
  editionWindow,
} from './policy.js'
import { sampleEdition } from './sample.js'

// no key, or the publisher cannot be reached: with nothing cached the paper shows its labelled sample edition
const SAMPLE_WHEN = new Set(['NEWS_NOT_CONFIGURED', 'NEWS_UPSTREAM_UNAVAILABLE'])

function serializeInline(nodes) {
  return nodes.map(({ type, text, href }) => ({
    type,
    ...(text !== undefined && { text }),
    ...(href && { href }),
  }))
}

function serialize(edition, now, refreshAvailableAt) {
  return {
    provider: 'The Guardian',
    section: edition.section,
    range: edition.range,
    dateKey: edition.dateKey,
    timezone: TIMEZONE,
    window: { from: edition.window.from, to: edition.window.to },
    editionLimit: EDITION_LIMIT,
    articles: edition.articles.map(
      ({ id, title, url, publishedAt, excerpt, byline, copyright }) => ({
        id,
        title,
        url,
        publishedAt,
        excerpt: serializeInline(excerpt),
        byline: serializeInline(byline),
        copyright,
      }),
    ),
    fetchedAt: new Date(edition.fetchedAt).toISOString(),
    freshUntil: new Date(edition.freshUntil).toISOString(),
    expiresAt: new Date(edition.expiresAt).toISOString(),
    refreshAvailableAt: new Date(refreshAvailableAt).toISOString(),
    stale: new Date(edition.freshUntil).getTime() <= now,
    partial: edition.partial,
  }
}

export function createNewsService({ store, provider, now = Date.now }) {
  const pending = new Map()
  const cooldowns = new Map()
  async function refresh(edition) {
    if (!provider.configured)
      throw new NewsError(
        'NEWS_NOT_CONFIGURED',
        'The newspaper is waiting for its news connection.',
        now() + COOLDOWN_MS,
      )
    await store.reserve()
    const result = await provider.fetchEdition(edition)
    const time = now()
    const document = {
      ...edition,
      ...result,
      fetchedAt: new Date(time),
      freshUntil: new Date(time + FRESH_MS),
      expiresAt: new Date(time + LIFETIME_MS),
    }
    await store.write(document)
    return document
  }
  return {
    async get({ section, range }) {
      const edition = editionWindow(section, range, now())
      for (const [key, error] of cooldowns) if (error.retryAt <= now()) cooldowns.delete(key)
      let cached = await store.read(edition.cacheKey)
      if (cached && new Date(cached.expiresAt).getTime() <= now()) cached = null
      if (cached && new Date(cached.freshUntil).getTime() > now())
        return serialize(cached, now(), cached.freshUntil)
      try {
        if (cooldowns.has(edition.cacheKey)) throw cooldowns.get(edition.cacheKey)
        if (!pending.has(edition.cacheKey)) {
          if (pending.size >= 4)
            throw new NewsError(
              'NEWS_BUSY',
              'The news desk is busy. Please try again shortly.',
              now() + COOLDOWN_MS,
            )
          const promise = refresh(edition)
            .catch((error) => {
              const safeError =
                error instanceof NewsError
                  ? error
                  : new NewsError(
                      'NEWS_UNAVAILABLE',
                      'The newspaper could not be updated. Please try again shortly.',
                      now() + COOLDOWN_MS,
                    )
              safeError.retryAt = Math.max(safeError.retryAt || 0, now() + COOLDOWN_MS)
              cooldowns.set(edition.cacheKey, safeError)
              throw safeError
            })
            .finally(() => pending.delete(edition.cacheKey))
          pending.set(edition.cacheKey, promise)
        }
        const fresh = await pending.get(edition.cacheKey)
        return serialize(fresh, now(), fresh.freshUntil)
      } catch (error) {
        if (cached && new Date(cached.expiresAt).getTime() > now())
          return serialize(cached, now(), error.retryAt || now() + COOLDOWN_MS)
        if (SAMPLE_WHEN.has(error.code)) return sampleEdition(edition, now(), error.retryAt)
        throw error
      }
    },
  }
}
