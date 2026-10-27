import { describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { useNewsLocation } from '../composables/useNewsLocation.js'

const route = reactive({ name: 'news', query: { q: 'passkey' } })
const commits = []
const replace = vi.fn(({ query }) => {
  commits.push(query)
  return new Promise((resolve) =>
    setTimeout(() => {
      route.query = query
      resolve()
    }, 0),
  )
})
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ replace }) }))

describe('news location updates', () => {
  it('merges two updates made before the first replace commits', async () => {
    const { update } = useNewsLocation()
    const first = update({ query: '' })
    const second = update({ section: 'technology' })
    await Promise.all([first, second])
    expect(commits.at(-1)).toEqual({ section: 'technology' })
    expect(commits.at(-1)).not.toHaveProperty('q')
  })
})
