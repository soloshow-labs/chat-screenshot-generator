import 'fake-indexeddb/auto'

import { describe, expect, it } from 'vitest'
import {
  deleteContact,
  deleteGroupPreset,
  listContacts,
  listGroupPresets,
  saveContact,
  saveGroupPreset,
} from './libraryStore'

describe('libraryStore', () => {
  it('keeps duplicate names, updates by id, and persists group snapshots', async () => {
    await saveContact({ id: 'contact-a', name: '阿花', avatarDataUrl: null, updatedAt: 100 })
    await saveContact({ id: 'contact-b', name: '阿花', avatarDataUrl: 'data:b', updatedAt: 200 })
    expect(await listContacts()).toEqual([
      { id: 'contact-b', name: '阿花', avatarDataUrl: 'data:b', updatedAt: 200 },
      { id: 'contact-a', name: '阿花', avatarDataUrl: null, updatedAt: 100 },
    ])

    await saveContact({ id: 'contact-a', name: '花姐', avatarDataUrl: null, updatedAt: 300 })
    expect((await listContacts()).find((contact) => contact.id === 'contact-a')).toEqual({
      id: 'contact-a',
      name: '花姐',
      avatarDataUrl: null,
      updatedAt: 300,
    })

    await saveGroupPreset({
      id: 'group-a',
      title: '周末球局',
      participants: [
        { id: 'self', name: '我', avatarDataUrl: null, isSelf: true },
        { id: 'friend', name: '朋友', avatarDataUrl: null, isSelf: false },
      ],
      updatedAt: 400,
    })
    expect(await listGroupPresets()).toEqual([
      expect.objectContaining({ id: 'group-a', title: '周末球局', updatedAt: 400 }),
    ])

    await deleteContact('contact-b')
    await deleteGroupPreset('group-a')
    expect((await listContacts()).map((contact) => contact.id)).toEqual(['contact-a'])
    expect(await listGroupPresets()).toEqual([])
  })
})
