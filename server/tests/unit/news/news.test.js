import { describe, expect, it, vi } from 'vitest'
import { parseInline, inlineText, safeUrl } from '../../../src/modules/news/inline.js'
import {
  editionWindow,
  FRESH_MS,
  LIFETIME_MS,
  NewsError,
  parseNewsQuery,
} from '../../../src/modules/news/policy.js'
import {
  createGuardianProvider,
  guardianSearchUrl,
  normalizeGuardian,
} from '../../../src/modules/news/providers/guardian.js'
import { createNewsService } from '../../../src/modules/news/service.js'
import { SAMPLE_PROVIDER, sampleEdition } from '../../../src/modules/news/sample.js'

const now = Date.parse('2026-09-17T16:00:00Z')
const edition = editionWindow('cybersecurity', 'week', now)
const item = (changes = {}) => ({
  id: 'technology/test-story',
  type: 'article',
  webTitle: 'Synthetic security story',
  webUrl: 'https://www.theguardian.com/technology/test-story',
  webPublicationDate: '2026-09-17T15:00:00Z',
  fields: {
    trailText: '<p>A synthetic <a href="https://example.com/context">context link</a>.</p>',
    byline: 'Test reporter',
  },
  ...changes,
})
const payload = (...items) => ({ response: { status: 'ok', results: items } })

describe('news validation and provider normalization', () => {
  it.each([
    { section: ['technology', 'cybersecurity'] },
    { range: { value: 'week' } },
    { url: 'https://example.com' },
    { section: 'all' },
    { range: '' },
    { query: 'passwords' },
  ])('rejects an unsupported query shape %j', (query) =>
    expect(() => parseNewsQuery(query)).toThrow(),
  )
  it('defines exact Singapore calendar windows across UTC midnight and month boundaries', () => {
    expect(edition.dateKey).toBe('2026-09-18')
    expect(edition.window).toEqual({
      from: '2026-09-11T16:00:00.000Z',
      to: '2026-09-18T16:00:00.000Z',
    })
    expect(editionWindow('technology', 'month', Date.parse('2026-03-01T01:00Z')).window.from).toBe(
      '2026-01-30T16:00:00.000Z',
    )
    expect(editionWindow('technology', 'week', now - 1).dateKey).toBe('2026-09-17')
  })
  it('keeps safe inline text and links without executing or returning markup', () => {
    const nodes = parseInline(
      '<p>A &amp; B <strong>report</strong><script>secret()</script><a href="javascript:alert(1)">unsafe</a><a href="/help">help</a><br><img src=x onerror=alert(1)></p>',
    )
    expect(inlineText(nodes)).toBe('A & B reportunsafehelp ')
    expect(nodes.filter((node) => node.type === 'link')).toEqual([
      { type: 'link', text: 'help', href: 'https://www.theguardian.com/help' },
    ])
    expect(JSON.stringify(nodes)).not.toMatch(/secret|onerror|javascript|<p>/)
    expect(() => parseInline('x'.repeat(16001))).toThrow()
    expect(() => parseInline('<div>'.repeat(30) + 'text' + '</div>'.repeat(30))).toThrow()
  })
  it.each([
    'javascript:alert(1)',
    'data:text/html,hi',
    'https://name:secret@example.com',
    'https://exam\nple.com',
    null,
  ])('rejects unsafe URL %s', (url) => expect(safeUrl(url)).toBeNull())
  it('filters exact bounds, future stories, duplicate IDs and unsafe articles', () => {
    const result = normalizeGuardian(
      payload(
        item(),
        item(),
        item({ id: 'future', webPublicationDate: '2026-09-18T10:00Z' }),
        item({ id: 'old', webPublicationDate: '2026-09-11T15:59:59Z' }),
        item({ id: 'boundary', webPublicationDate: edition.window.from }),
        item({ id: 'evil', webUrl: 'javascript:alert(1)' }),
      ),
      edition,
      now,
    )
    expect(result.articles.map((article) => article.id)).toEqual([
      'technology/test-story',
      'boundary',
    ])
    expect(result.partial).toBe(true)
    expect(result.articles[0].byline).toEqual([{ type: 'text', text: 'Test reporter' }])
  })
  it('rejects malformed upstream data and fixes provider URLs and requested fields', () => {
    expect(() => normalizeGuardian({}, edition, now)).toThrow()
    const url = guardianSearchUrl(edition, 'synthetic-key')
    expect(url.origin).toBe('https://content.guardianapis.com')
    expect(url.searchParams.get('tag')).toContain('technology/hacking')
    expect(url.searchParams.get('page-size')).toBe('50')
    expect(url.searchParams.get('show-fields')).not.toContain('body')
    expect(
      guardianSearchUrl({ ...edition, section: 'technology' }, 'test').searchParams.get('section'),
    ).toBe('technology')
  })
  it('bounds upstream responses and never exposes API keys in failures', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload(item())), {
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const provider = createGuardianProvider({ apiKey: 'private-key', fetchImpl, now: () => now })
    expect((await provider.fetchEdition(edition)).articles).toHaveLength(1)
    expect(fetchImpl.mock.calls[0][1].redirect).toBe('error')
    fetchImpl.mockResolvedValue(
      new Response('x'.repeat(1024 * 1024 + 1), {
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await expect(provider.fetchEdition(edition)).rejects.toMatchObject({
      code: 'NEWS_UPSTREAM_UNAVAILABLE',
    })
    fetchImpl.mockRejectedValue(new Error('https://provider/?api-key=private-key'))
    try {
      await provider.fetchEdition(edition)
    } catch (error) {
      expect(error.message).not.toContain('private-key')
    }
  })
})

describe('edition cache lifecycle', () => {
  function setup() {
    let time = now
    const documents = new Map()
    const store = {
      read: vi.fn(async (key) => documents.get(key)),
      write: vi.fn(async (value) => documents.set(value.cacheKey, value)),
      reserve: vi.fn(async () => {}),
    }
    const provider = {
      configured: true,
      fetchEdition: vi.fn(async () => ({
        articles: normalizeGuardian(payload(item()), edition, now).articles,
        partial: false,
      })),
    }
    return {
      store,
      provider,
      service: createNewsService({ store, provider, now: () => time }),
      advance: (ms) => {
        time += ms
      },
      documents,
    }
  }
  it('coalesces simultaneous reads and serves fresh cache without spending requests', async () => {
    const { service, provider, store } = setup()
    const query = parseNewsQuery({})
    const responses = await Promise.all(Array.from({ length: 8 }, () => service.get(query)))
    expect(provider.fetchEdition).toHaveBeenCalledTimes(1)
    expect(store.reserve).toHaveBeenCalledTimes(1)
    expect(responses[0].articles[0]).not.toHaveProperty('_id')
    await service.get(query)
    expect(provider.fetchEdition).toHaveBeenCalledTimes(1)
  })
  it('returns labelled stale data on failure, observes cooldown and rejects hard expiry', async () => {
    const { service, provider, advance } = setup()
    const query = parseNewsQuery({})
    await service.get(query)
    advance(FRESH_MS)
    provider.fetchEdition.mockRejectedValue(new Error('secret'))
    const stale = await service.get(query)
    expect(stale.stale).toBe(true)
    expect(stale.fetchedAt).toBe(new Date(now).toISOString())
    await service.get(query)
    expect(provider.fetchEdition).toHaveBeenCalledTimes(2)
    advance(LIFETIME_MS - FRESH_MS)
    await expect(service.get(query)).rejects.toMatchObject({ code: 'NEWS_UNAVAILABLE' })
  })
  it('does not substitute a different section or spend quota without a key', async () => {
    const { service, provider, store } = setup()
    await service.get(parseNewsQuery({}))
    provider.configured = false
    const technology = await service.get(parseNewsQuery({ section: 'technology' }))
    expect(technology).toMatchObject({ sample: true, section: 'technology' })
    expect(store.reserve).toHaveBeenCalledTimes(1)
  })
  it('serves the labelled sample without a key and never caches or counts it', async () => {
    const { service, provider, store } = setup()
    provider.configured = false
    const result = await service.get(parseNewsQuery({}))
    expect(result).toMatchObject({ sample: true, provider: SAMPLE_PROVIDER, stale: false })
    expect(result.articles.length).toBeGreaterThan(0)
    expect(store.reserve).not.toHaveBeenCalled()
    expect(store.write).not.toHaveBeenCalled()
    expect(provider.fetchEdition).not.toHaveBeenCalled()
  })
  it('serves the sample when the publisher cannot be reached and nothing is cached', async () => {
    const { service, provider, store } = setup()
    provider.fetchEdition.mockRejectedValue(
      new NewsError('NEWS_UPSTREAM_UNAVAILABLE', 'Could not reach the publisher.', now + 60000),
    )
    const result = await service.get(parseNewsQuery({}))
    expect(result.sample).toBe(true)
    expect(store.write).not.toHaveBeenCalled()
    // the cooldown still applies, so a failing publisher is not asked again at once
    await service.get(parseNewsQuery({}))
    expect(provider.fetchEdition).toHaveBeenCalledTimes(1)
  })
  it('prefers a cached edition, labelled stale, to the sample', async () => {
    const { service, provider, advance } = setup()
    const query = parseNewsQuery({})
    await service.get(query)
    advance(FRESH_MS)
    provider.fetchEdition.mockRejectedValue(
      new NewsError('NEWS_UPSTREAM_UNAVAILABLE', 'Could not reach the publisher.', now + 60000),
    )
    const result = await service.get(query)
    expect(result.stale).toBe(true)
    expect(result.sample).toBeUndefined()
    expect(result.provider).toBe('The Guardian')
  })
  it('keeps the other refusals as they were', async () => {
    const { service, provider, store } = setup()
    store.reserve.mockRejectedValue(
      new NewsError('NEWS_DAILY_LIMIT', 'Resting until tomorrow.', now + 3600000),
    )
    await expect(service.get(parseNewsQuery({}))).rejects.toMatchObject({
      code: 'NEWS_DAILY_LIMIT',
    })
    expect(provider.fetchEdition).not.toHaveBeenCalled()
  })
})

describe('sample edition content', () => {
  const editions = ['cybersecurity', 'technology'].flatMap((section) =>
    ['week', 'month'].map((range) => editionWindow(section, range, now)),
  )
  const realPublishers =
    /guardian|reuters|bbc|new york times|associated press|bloomberg|microsoft|google|apple|amazon|meta\b|owasp/i

  it.each(editions.map((edition) => [edition.section, edition.range, edition]))(
    '%s %s is labelled, inert and inside its own window',
    (_section, _range, edition) => {
      const result = sampleEdition(edition, now)
      expect(result).toMatchObject({ sample: true, provider: SAMPLE_PROVIDER })
      expect(result.articles.length).toBeGreaterThan(0)
      expect(new Set(result.articles.map((article) => article.id)).size).toBe(
        result.articles.length,
      )
      for (const article of result.articles) {
        expect(article.url).toBe('')
        const time = Date.parse(article.publishedAt)
        expect(time).toBeGreaterThanOrEqual(Date.parse(edition.window.from))
        expect(time).toBeLessThan(now)
        const inline = [...article.excerpt, ...article.byline]
        expect(inline.every((node) => node.type === 'text')).toBe(true)
        const text = [article.title, ...inline.map((node) => node.text)].join(' ')
        expect(text).not.toMatch(realPublishers)
        expect(text).not.toMatch(/https?:|www\.|<[a-z]/i)
      }
    },
  )

  it('adds older stories to the 30 day view only', () => {
    const week = sampleEdition(editionWindow('cybersecurity', 'week', now), now)
    const month = sampleEdition(editionWindow('cybersecurity', 'month', now), now)
    expect(month.articles.length).toBeGreaterThan(week.articles.length)
  })

  it('expires later than now, so the browser accepts it', () => {
    const result = sampleEdition(editionWindow('technology', 'week', now), now)
    expect(Date.parse(result.expiresAt)).toBeGreaterThan(now)
  })
})
