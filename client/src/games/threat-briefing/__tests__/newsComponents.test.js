import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import CyberNewsCentral from '../CyberNewsCentral.vue'
import NewsArticle from '../components/NewsArticle.vue'
import NewsFilters from '../components/NewsFilters.vue'
import NewsPagination from '../components/NewsPagination.vue'
import NewsStatus from '../components/NewsStatus.vue'
import NewsTabs from '../components/NewsTabs.vue'
import { fetchEdition } from '../news.js'

vi.mock('../news.js', async (original) => ({ ...(await original()), fetchEdition: vi.fn() }))

let wrapper
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }))
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

const story = (over = {}) => ({
  id: 'one',
  title: 'A headline',
  url: 'https://www.theguardian.com/one',
  publishedAt: '2026-10-31T01:00:00.000Z',
  byline: [{ type: 'text', text: 'A reporter' }],
  excerpt: [{ type: 'text', text: 'An excerpt' }],
  copyright: '',
  ...over,
})

describe('NewsArticle', () => {
  it('credits the publisher and opens the story in a new tab', () => {
    wrapper = mount(NewsArticle, { props: { article: story() } })
    expect(wrapper.text()).toContain('THE GUARDIAN')
    const read = wrapper.findAll('a').find((link) => link.text().includes('Read at The Guardian'))
    expect(read.attributes('target')).toBe('_blank')
    expect(read.attributes('rel')).toBe('noopener noreferrer')
  })

  it('shows an unsafe link as a plain title with no way out', () => {
    wrapper = mount(NewsArticle, { props: { article: story({ url: 'javascript:alert(1)' }) } })
    expect(wrapper.find('a').exists()).toBe(false)
    expect(wrapper.get('h2').text()).toBe('A headline')
  })

  it('labels a sample story, names no publisher and links nowhere even if handed a url', () => {
    wrapper = mount(NewsArticle, { props: { article: story(), sample: true } })
    expect(wrapper.text()).toContain('SAMPLE STORY, NOT REAL NEWS')
    expect(wrapper.text()).not.toMatch(/guardian/i)
    expect(wrapper.find('a').exists()).toBe(false)
  })
})

describe('NewsStatus', () => {
  it('does not call a sample edition an update', () => {
    wrapper = mount(NewsStatus, {
      props: { sample: true, fetchedAt: '2026-10-31T01:00:00.000Z', canRefresh: true },
    })
    expect(wrapper.text()).toContain('No live stories right now.')
    expect(wrapper.text()).not.toContain('Updated')
  })

  it('still reports a real edition', () => {
    wrapper = mount(NewsStatus, {
      props: { fetchedAt: '2026-10-31T01:00:00.000Z', canRefresh: true },
    })
    expect(wrapper.text()).toContain('Updated')
  })
})

describe('NewsFilters', () => {
  const props = { section: 'cybersecurity', range: 'week', canRefresh: true }

  it('marks the current section and reports a change', async () => {
    wrapper = mount(NewsFilters, { props })
    const buttons = wrapper.get('[role="group"]').findAll('button')
    expect(buttons[0].attributes('aria-pressed')).toBe('true')
    await buttons[1].trigger('click')
    expect(wrapper.emitted('update:section')).toEqual([['technology']])
  })

  it('reports the range, the search text and a refresh', async () => {
    wrapper = mount(NewsFilters, { props })
    await wrapper.get('select').setValue('month')
    expect(wrapper.emitted('update:range')).toEqual([['month']])
    await wrapper.get('input[type="search"]').setValue('passkey')
    expect(wrapper.emitted('update:query')).toEqual([['passkey']])
    const refresh = wrapper.findAll('button').find((b) => b.text() === 'Check for updates')
    await refresh.trigger('click')
    expect(wrapper.emitted('refresh')).toHaveLength(1)
  })

  it('will not refresh while it is not allowed', () => {
    wrapper = mount(NewsFilters, { props: { ...props, canRefresh: false } })
    const refresh = wrapper.findAll('button').find((b) => b.text() === 'Check for updates')
    expect(refresh.attributes('disabled')).toBeDefined()
  })
})

describe('NewsPagination', () => {
  it('stays away with a single page', () => {
    wrapper = mount(NewsPagination, { props: { page: 1, pageCount: 1 } })
    expect(wrapper.find('nav').exists()).toBe(false)
  })

  it('disables the ends and marks the current page', async () => {
    wrapper = mount(NewsPagination, { props: { page: 1, pageCount: 3 } })
    expect(
      wrapper.get('[aria-label="Previous newspaper page"]').attributes('disabled'),
    ).toBeDefined()
    expect(wrapper.get('[aria-label="Newspaper page 1"]').attributes('aria-current')).toBe('page')
    expect(
      wrapper.get('[aria-label="Newspaper page 2"]').attributes('aria-current'),
    ).toBeUndefined()
    await wrapper.get('[aria-label="Next newspaper page"]').trigger('click')
    await wrapper.get('[aria-label="Newspaper page 3"]').trigger('click')
    expect(wrapper.emitted('update:page')).toEqual([[2], [3]])
  })
})

describe('NewsTabs', () => {
  it('selects the current tab and reports a click', async () => {
    wrapper = mount(NewsTabs, { props: { activeTab: 'news' } })
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs[0].attributes('aria-selected')).toBe('true')
    expect(tabs[1].attributes('tabindex')).toBe('-1')
    await tabs[1].trigger('click')
    expect(wrapper.emitted('update:tab')).toEqual([['owasp']])
  })

  it('moves focus with the arrows and Home and End without selecting', async () => {
    wrapper = mount(NewsTabs, { props: { activeTab: 'news' }, attachTo: document.body })
    const tabs = wrapper.findAll('[role="tab"]')
    tabs[0].element.focus()
    await tabs[0].trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(tabs[1].element)
    await tabs[1].trigger('keydown', { key: 'Home' })
    expect(document.activeElement).toBe(tabs[0].element)
    await tabs[0].trigger('keydown', { key: 'End' })
    expect(document.activeElement).toBe(tabs[1].element)
    expect(wrapper.emitted('update:tab')).toBeUndefined()
  })
})

describe('CyberNewsCentral', () => {
  const edition = (over = {}) => ({
    provider: 'The Guardian',
    section: 'cybersecurity',
    range: 'week',
    dateKey: '2026-10-31',
    articles: [story()],
    fetchedAt: new Date().toISOString(),
    freshUntil: new Date(Date.now() + 60000).toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    refreshAvailableAt: new Date(Date.now() + 60000).toISOString(),
    stale: false,
    partial: false,
    ...over,
  })
  async function render(data) {
    fetchEdition.mockResolvedValue(data)
    wrapper = mount(CyberNewsCentral, {
      props: {
        location: ref({ section: 'cybersecurity', range: 'week', query: '', page: 1 }).value,
        update: vi.fn(),
      },
    })
    await flushPromises()
  }

  it('attributes a live edition to its publisher', async () => {
    await render(edition())
    expect(wrapper.find('[data-testid="news-sample-label"]').exists()).toBe(false)
    expect(wrapper.get('img[alt="Powered by The Guardian"]').attributes('alt')).toBeTruthy()
    expect(wrapper.text()).toContain('Full articles open in a new tab.')
  })

  it('says plainly when the edition is a sample, with no publisher logo or attribution', async () => {
    await render(
      edition({
        provider: 'Sample edition',
        sample: true,
        articles: [story({ id: 'sample/x', url: '' })],
      }),
    )
    expect(wrapper.get('[data-testid="news-sample-label"]').text()).toBe(
      'Sample edition. These stories are made up for this project. This is not real news.',
    )
    expect(wrapper.find('img[alt="Powered by The Guardian"]').exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/guardian/i)
    expect(wrapper.text()).not.toContain('Full articles open in a new tab.')
    expect(wrapper.findAll('a')).toHaveLength(0)
  })
})
