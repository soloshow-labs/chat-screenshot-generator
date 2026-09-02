import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useContactLibrary } from './useContactLibrary'

const store = vi.hoisted(() => ({
  listContacts: vi.fn(),
  saveContact: vi.fn(),
  deleteContact: vi.fn(),
  listGroupPresets: vi.fn(),
  saveGroupPreset: vi.fn(),
  deleteGroupPreset: vi.fn(),
}))

vi.mock('../services/libraryStore', () => store)

beforeEach(() => {
  Object.values(store).forEach((mock) => mock.mockReset())
  store.listContacts.mockResolvedValue([])
  store.listGroupPresets.mockResolvedValue([])
  store.saveContact.mockImplementation(async (value) => value)
  store.deleteContact.mockResolvedValue(undefined)
  store.saveGroupPreset.mockImplementation(async (value) => value)
  store.deleteGroupPreset.mockResolvedValue(undefined)
})

describe('useContactLibrary', () => {
  it('loads and refreshes after successful mutations', async () => {
    const contact = { id: 'contact-1', name: '阿花', avatarDataUrl: null, updatedAt: 1 }
    store.listContacts.mockResolvedValueOnce([]).mockResolvedValueOnce([contact])
    const { result } = renderHook(() => useContactLibrary())

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.addContact(contact)
    })
    expect(store.saveContact).toHaveBeenCalledWith(contact)
    expect(result.current.contacts).toEqual([contact])
  })

  it('exposes a Chinese storage error', async () => {
    store.listContacts.mockRejectedValue(new Error('数据库不可用'))
    const { result } = renderHook(() => useContactLibrary())

    await waitFor(() => expect(result.current.error).toBe('数据库不可用'))
    expect(result.current.loading).toBe(false)
  })
})
