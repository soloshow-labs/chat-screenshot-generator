import { useCallback, useEffect, useRef, useState } from 'react'
import {
  deleteContact,
  deleteGroupPreset,
  listContacts,
  listGroupPresets,
  saveContact,
  saveGroupPreset,
  type ContactRecord,
  type GroupPresetRecord,
} from '../services/libraryStore'

export function useContactLibrary() {
  const [contacts, setContacts] = useState<ContactRecord[]>([])
  const [groups, setGroups] = useState<GroupPresetRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const requestRef = useRef(0)

  const refresh = useCallback(async () => {
    const requestId = ++requestRef.current
    setLoading(true)
    setError(null)
    try {
      const [nextContacts, nextGroups] = await Promise.all([
        listContacts(),
        listGroupPresets(),
      ])
      if (!mountedRef.current || requestId !== requestRef.current) return
      setContacts(nextContacts)
      setGroups(nextGroups)
    } catch (caughtError) {
      if (!mountedRef.current || requestId !== requestRef.current) return
      setError(caughtError instanceof Error ? caughtError.message : '素材库读取失败')
    } finally {
      if (mountedRef.current && requestId === requestRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    const timer = window.setTimeout(() => void refresh(), 0)
    return () => {
      window.clearTimeout(timer)
      mountedRef.current = false
      requestRef.current += 1
    }
  }, [refresh])

  const runMutation = useCallback(async (operation: () => Promise<unknown>) => {
    setError(null)
    try {
      await operation()
      await refresh()
    } catch (caughtError) {
      if (mountedRef.current) {
        setError(caughtError instanceof Error ? caughtError.message : '素材库操作失败')
        setLoading(false)
      }
    }
  }, [refresh])

  const addContact = useCallback(
    (contact: ContactRecord) => runMutation(() => saveContact(contact)),
    [runMutation],
  )
  const removeContact = useCallback(
    (id: string) => runMutation(() => deleteContact(id)),
    [runMutation],
  )
  const addGroup = useCallback(
    (group: GroupPresetRecord) => runMutation(() => saveGroupPreset(group)),
    [runMutation],
  )
  const removeGroup = useCallback(
    (id: string) => runMutation(() => deleteGroupPreset(id)),
    [runMutation],
  )

  return {
    contacts,
    groups,
    loading,
    error,
    addContact,
    removeContact,
    addGroup,
    removeGroup,
    refresh,
  }
}
