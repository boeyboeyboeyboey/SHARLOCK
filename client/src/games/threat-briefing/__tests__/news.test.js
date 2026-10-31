import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import SafeInline from '../components/SafeInline.vue'
import { parseNewsLocation, newsQuery, searchEdition } from '../composables/useNewsLocation.js'
import { useCyberNews } from '../composables/useCyberNews.js'
import NewsStatus from '../components/NewsStatus.vue'
import { fetchEdition, newsStamp, safeNewsLink } from '../news.js'

vi.mock('../news.js', async (original) => ({ ...(await original()), fetchEdition: vi.fn() }))
afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('newspaper reading boundaries', () => {
  it('normalizes shareable filter state without accepting arrays or unknown values', () => {
    expect(
      parseNewsLocation({ section: ['technology'], range: 'ever', q: ['x'], page: '999' }),
    ).toEqual({ tab: 'news', section: 'cybersecurity', range: 'week', query: '', page: 1 })
    expect(
      newsQuery(
        parseNewsLocation({ section: 'technology', range: 'month', q: 'a'.repeat(100), page: '2' }),
      ),
    ).toEqual({ section: 'technology', range: 'month', q: 'a'.repeat(80), page: '2' })
    expect(newsQuery(parseNewsLocation({}))).toEqual({})
    expect(newsQuery(parseNewsLocation({ tab: 'owasp', page: '2' }))).toEqual({
      tab: 'owasp',
      page: '2',
    })
    expect(parseNewsLocation({ tab: ['owasp'] }).tab).toBe('news')
  })
  it('searches literal text in just the current edition', () => {
    const articles = [
      { title: 'A [test]', excerpt: [{ text: 'PASSWORDS' }], byline: [] },
      { title: 'Other', excerpt: [], byline: [{ text: 'Reporter' }] },
    ]
    expect(searchEdition(articles, '[')).toEqual([articles[0]])
    expect(searchEdition(articles, ' passwords ')).toEqual([articles[0]])
    expect(searchEdition(articles, 'reporter')).toEqual([articles[1]])
  })
  it('renders hostile strings as text and validates links defensively', () => {
    const wrapper = mount(SafeInline, {
      props: {
        nodes: [
          { type: 'text', text: '<img src=x onerror=alert(1)>' },
          { type: 'link', text: 'unsafe', href: 'javascript:alert(1)' },
          { type: 'link', text: 'safe', href: 'https://example.com' },
        ],
      },
    })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.findAll('a')).toHaveLength(1)
    expect(wrapper.get('a').attributes('rel')).toBe('noopener noreferrer')
    expect(safeNewsLink('https://name:secret@example.com')).toBeNull()
    wrapper.unmount()
  })
  it('cancels superseded requests, ignores late responses and clears expired editions', async () => {
    vi.useFakeTimers()
    const section = ref('cybersecurity')
    let firstResolve
    fetchEdition.mockReturnValueOnce(
      new Promise((resolve) => {
        firstResolve = resolve
      }),
    )
    let state
    const wrapper = mount({
      setup() {
        state = useCyberNews(section, ref('week'))
        return () => null
      },
    })
    const firstSignal = fetchEdition.mock.calls[0][2]
    const expiresAt = new Date(Date.now() + 2000).toISOString()
    fetchEdition.mockResolvedValueOnce({
      section: 'technology',
      range: 'week',
      articles: [],
      expiresAt,
      freshUntil: expiresAt,
      refreshAvailableAt: expiresAt,
    })
    section.value = 'technology'
    await flushPromises()
    expect(firstSignal.aborted).toBe(true)
    firstResolve({ section: 'cybersecurity', articles: [{ title: 'Wrong edition' }] })
    await flushPromises()
    expect(state.edition.value.section).toBe('technology')
    await vi.advanceTimersByTimeAsync(2100)
    expect(state.edition.value).toBeNull()
    expect(state.error.value).toContain('expired')
    const finalSignal = fetchEdition.mock.calls[1][2]
    wrapper.unmount()
    expect(finalSignal.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('edition status', () => {
  const now = Date.parse('2026-10-31T08:00:00Z')

  it('stamps today with the time only and other days with the date', () => {
    expect(newsStamp('2026-10-31T08:17:00Z', now)).toBe('04:17 pm')
    expect(newsStamp('2026-10-30T08:17:00Z', now)).toBe('30 Oct, 04:17 pm')
    expect(newsStamp('not a date', now)).toBe('')
  })

  it('folds the next update check into the one status line', () => {
    vi.useFakeTimers({ now })
    const wrapper = mount(NewsStatus, {
      props: {
        fetchedAt: '2026-10-31T08:17:00Z',
        refreshAvailableAt: Date.parse('2026-10-31T08:47:00Z'),
        canRefresh: false,
      },
    })
    expect(wrapper.text()).toBe('Updated 04:17 pm SGT · next 04:47 pm')
    expect(wrapper.find('small').exists()).toBe(false)
  })

  it('keeps the next check line beside a cached edition', () => {
    vi.useFakeTimers({ now })
    const wrapper = mount(NewsStatus, {
      props: {
        stale: true,
        fetchedAt: '2026-10-30T08:17:00Z',
        refreshAvailableAt: Date.parse('2026-10-31T08:47:00Z'),
        canRefresh: false,
      },
    })
    expect(wrapper.find('small').text()).toBe('Next update check available 04:47 pm SGT')
  })
})
