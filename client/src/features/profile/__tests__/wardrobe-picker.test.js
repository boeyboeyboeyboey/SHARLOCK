import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({ getWardrobe: vi.fn(), equipWardrobeItem: vi.fn() }))

vi.mock('../api.js', async () => {
  const actual = await vi.importActual('../api.js')
  return { ...actual, getWardrobe: mocks.getWardrobe, equipWardrobeItem: mocks.equipWardrobeItem }
})

import WardrobePicker from '../components/WardrobePicker.vue'
import { useAuthStore } from '../../auth/store.js'

const item = (id, slot, name, unlocked = true, extra = {}) => ({
  id,
  slot,
  name,
  unlocked,
  unlockedBy: null,
  unlockedByName: null,
  ...extra,
})
const catalog = () => ({
  items: [
    item('scarf-red', 'scarf', 'Red scarf'),
    item('scarf-navy', 'scarf', 'Navy scarf', false, { unlockedByName: 'Customs cleared' }),
    item('scarf-teal', 'scarf', 'Teal scarf'),
    item('hat-deerstalker', 'hat', 'Deerstalker'),
    item('monocle-gold', 'monocle', 'Gold monocle'),
    item('accessory-none', 'accessory', 'No accessory'),
  ],
  equipped: {
    scarf: 'scarf-red',
    hat: 'hat-deerstalker',
    monocle: 'monocle-gold',
    accessory: 'accessory-none',
  },
})

async function mountPicker() {
  const wrapper = mount(WardrobePicker)
  await flushPromises()
  return wrapper
}

describe('WardrobePicker', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mocks.getWardrobe.mockResolvedValue(catalog())
  })

  it('renders a group per slot with the equipped item checked', async () => {
    const wrapper = await mountPicker()
    for (const label of ['Scarf', 'Hat', 'Monocle', 'Accessory'])
      expect(wrapper.find('fieldset legend', { text: label }).exists()).toBe(true)
    expect(wrapper.findAll('fieldset')).toHaveLength(4)
    expect(wrapper.find('input[value="scarf-red"]').element.checked).toBe(true)
  })

  it('disables locked items and says what unlocks them in text', async () => {
    const wrapper = await mountPicker()
    expect(wrapper.find('input[value="scarf-navy"]').element.disabled).toBe(true)
    expect(wrapper.text()).toContain('Locked: earn Customs cleared')
  })

  it('saves a change, mirrors it into the auth store and announces it', async () => {
    const saved = { ...catalog().equipped, scarf: 'scarf-teal' }
    mocks.equipWardrobeItem.mockResolvedValue(saved)
    const auth = useAuthStore()
    const wrapper = await mountPicker()
    await wrapper.find('input[value="scarf-teal"]').setValue(true)
    await flushPromises()
    expect(mocks.equipWardrobeItem).toHaveBeenCalledWith('scarf', 'scarf-teal')
    expect(wrapper.find('.wardrobe__live').text()).toBe('Teal scarf equipped.')
    expect(wrapper.find('input[value="scarf-teal"]').element.checked).toBe(true)
    auth.user = Object.freeze({ id: 'u' })
    auth.setWardrobe(saved)
    expect(auth.user.wardrobe.scarf).toBe('scarf-teal')
  })

  it('shows an error and keeps the saved item when the save fails', async () => {
    mocks.equipWardrobeItem.mockRejectedValue(new Error('x'))
    const wrapper = await mountPicker()
    await wrapper.find('input[value="scarf-teal"]').setValue(true)
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.find('input[value="scarf-red"]').element.checked).toBe(true)
  })

  it('offers a retry when the wardrobe cannot load', async () => {
    mocks.getWardrobe.mockRejectedValueOnce(new Error('down'))
    const wrapper = await mountPicker()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('fieldset')).toHaveLength(4)
  })
})
