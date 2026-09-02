import 'fake-indexeddb/auto'

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SAMPLE_DRAFT } from '../app/sampleDraft'
import { useChatDraft } from '../app/useChatDraft'
import { deleteProject, listProjects } from '../services/localProjectStore'
import { useProjectWorkspace } from './useProjectWorkspace'
import * as projectStore from '../services/localProjectStore'

function useHarness(now: () => number = Date.now, enabled = true) {
  const chat = useChatDraft()
  const workspace = useProjectWorkspace({
    draft: chat.draft,
    saveState: chat.saveState,
    recoverDraft: chat.recoverDraft,
    now,
    enabled,
  })
  return { ...chat, workspace }
}

describe('useProjectWorkspace', () => {
  beforeEach(() => localStorage.clear())
  afterEach(async () => {
    for (const project of await listProjects()) await deleteProject(project.id)
  })

  it('adopts the existing active draft and mirrors later successful saves to the project record', async () => {
    localStorage.setItem('chat-screenshot-generator:draft:v1', JSON.stringify({ ...SAMPLE_DRAFT, title: '原有草稿' }))
    const { result } = renderHook(() => useHarness())

    await waitFor(() => expect(result.current.workspace.status).toBe('ready'))
    expect(result.current.workspace.projects[0].draft.title).toBe('原有草稿')

    act(() => result.current.dispatch({ type: 'set-field', field: 'title', value: '已经双写' }))
    await waitFor(() => expect(result.current.saveState).toBe('saved'))
    await waitFor(() => expect(result.current.workspace.projects[0].draft.title).toBe('已经双写'))
  })

  it('updates the active project incrementally after autosave without re-reading every project', async () => {
    const list = vi.spyOn(projectStore, 'listProjects')
    const active = vi.spyOn(projectStore, 'getActiveProject')
    const { result } = renderHook(() => useHarness())
    await waitFor(() => expect(result.current.workspace.status).toBe('ready'))
    list.mockClear(); active.mockClear()

    act(() => result.current.dispatch({ type: 'set-field', field: 'title', value: '增量保存' }))
    await waitFor(() => expect(result.current.workspace.projects[0].draft.title).toBe('增量保存'))
    expect(list).not.toHaveBeenCalled()
    expect(active).not.toHaveBeenCalled()
  })

  it('does not create a project while local draft recovery is blocked', async () => {
    renderHook(() => useHarness(Date.now, false))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })
    expect(await listProjects()).toEqual([])
  })

  it('creates and switches projects while replacing the in-memory undo history', async () => {
    const { result } = renderHook(() => useHarness())
    await waitFor(() => expect(result.current.workspace.status).toBe('ready'))
    const originalId = result.current.workspace.activeProjectId!

    act(() => result.current.dispatch({ type: 'set-field', field: 'title', value: '修改过的首项目' }))
    await waitFor(() => expect(result.current.canUndo).toBe(true))
    await act(() => result.current.workspace.createNew())
    expect(result.current.draft.title).toBe('新聊天')
    expect(result.current.canUndo).toBe(false)

    await act(() => result.current.workspace.switchTo(originalId))
    expect(result.current.draft.title).toBe('修改过的首项目')
    expect(result.current.canUndo).toBe(false)
  })

  it('creates a destructive checkpoint and restores it as the current project', async () => {
    let clock = 10_000
    const now = () => clock++
    const { result } = renderHook(() => useHarness(now))
    await waitFor(() => expect(result.current.workspace.status).toBe('ready'))

    act(() => result.current.dispatch({ type: 'set-field', field: 'title', value: '恢复点内容' }))
    await waitFor(() => expect(result.current.saveState).toBe('saved'))
    await act(() => result.current.workspace.checkpointNow('destructive'))
    const checkpointId = result.current.workspace.checkpoints[0].id

    act(() => result.current.dispatch({ type: 'set-field', field: 'title', value: '后来内容' }))
    await waitFor(() => expect(result.current.draft.title).toBe('后来内容'))
    await act(() => result.current.workspace.restore(checkpointId))

    expect(result.current.draft.title).toBe('恢复点内容')
    expect(result.current.canUndo).toBe(false)
  })

  it('reports storage use and requests persistence only after an explicit action', async () => {
    const estimate = Object.assign(async () => ({ usage: 2_000, quota: 10_000 }), { called: false })
    const persist = Object.assign(async () => true, { called: false })
    const originalStorage = navigator.storage
    Object.defineProperty(navigator, 'storage', { configurable: true, value: {
      estimate: async () => { estimate.called = true; return estimate() },
      persisted: async () => false,
      persist: async () => { persist.called = true; return persist() },
    } })
    try {
      const { result } = renderHook(() => useHarness())
      await waitFor(() => expect(result.current.workspace.status).toBe('ready'))
      expect(estimate.called).toBe(true)
      expect(persist.called).toBe(false)
      await act(() => result.current.workspace.requestPersistence())
      expect(persist.called).toBe(true)
      expect(result.current.workspace.persistence).toBe('granted')
    } finally {
      Object.defineProperty(navigator, 'storage', { configurable: true, value: originalStorage })
    }
  })
})
