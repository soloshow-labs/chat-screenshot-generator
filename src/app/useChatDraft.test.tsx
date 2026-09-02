import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DraftStorage } from '../services/draftStore'
import { useChatDraft } from './useChatDraft'
import { SAMPLE_DRAFT } from './sampleDraft'
import { DRAFT_STORAGE_KEY } from '../services/draftStore'

function makeStorage(): DraftStorage {
  return {
    getItem: vi.fn().mockReturnValue(null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  }
}

describe('useChatDraft', () => {
  it.each(['{broken', JSON.stringify({ schemaVersion: 99 }), 'denied'])('blocks editing, reset and autosave when local recovery fails: %s', raw => {
    vi.useFakeTimers()
    const storage = makeStorage()
    vi.mocked(storage.getItem).mockImplementation(() => { if (raw === 'denied') throw new Error('denied'); return raw })
    const { result } = renderHook(() => useChatDraft(storage))
    expect(result.current.recoveryError).toBeInstanceOf(Error)
    expect(result.current.saveState).toBe('error')
    const original = result.current.draft
    act(() => result.current.dispatch({ type: 'set-field', field: 'title', value: 'must not save' }))
    act(() => result.current.reset())
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.draft).toBe(original)
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(storage.removeItem).not.toHaveBeenCalled()
    vi.mocked(storage.getItem).mockReturnValue(JSON.stringify({ ...SAMPLE_DRAFT, title: '重试恢复' }))
    act(() => result.current.retryRecovery())
    expect(result.current.recoveryError).toBeNull()
    expect(result.current.draft.title).toBe('重试恢复')
  })

  it('keeps recovery blocked after a failed confirmed save; succeeds only after valid replacement persists', () => {
    vi.useFakeTimers()
    const storage = makeStorage()
    vi.mocked(storage.getItem).mockReturnValue('{bad')
    vi.mocked(storage.setItem).mockImplementation(() => { throw new Error('quota') })
    const { result } = renderHook(() => useChatDraft(storage))
    const candidate = { ...SAMPLE_DRAFT, title: 'JSON 恢复' }
    act(() => { expect(result.current.recoverDraft(candidate).ok).toBe(false) })
    expect(result.current.recoveryError).not.toBeNull()
    expect(result.current.draft.title).not.toBe('JSON 恢复')
    vi.mocked(storage.setItem).mockImplementation(() => undefined)
    act(() => { expect(result.current.recoverDraft({ ...candidate, schemaVersion: 99 } as unknown as typeof candidate).ok).toBe(false) })
    act(() => { expect(result.current.recoverDraft(candidate).ok).toBe(true) })
    expect(result.current.recoveryError).toBeNull()
    expect(result.current.draft.title).toBe('JSON 恢复')
    expect(storage.setItem).toHaveBeenLastCalledWith(DRAFT_STORAGE_KEY, JSON.stringify(candidate))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces draft saves by 400ms', () => {
    vi.useFakeTimers()
    const storage = makeStorage()
    const { result } = renderHook(() => useChatDraft(storage))

    act(() => result.current.dispatch({ type: 'set-field', field: 'title', value: '已修改' }))
    expect(result.current.saveState).toBe('saving')
    expect(storage.setItem).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(399))
    expect(storage.setItem).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(storage.setItem).toHaveBeenCalledOnce()
    expect(result.current.saveState).toBe('saved')
  })

  it('keeps the in-memory draft and exposes save failures', () => {
    vi.useFakeTimers()
    const storage = makeStorage()
    vi.mocked(storage.setItem).mockImplementation(() => { throw new Error('quota') })
    const { result } = renderHook(() => useChatDraft(storage))

    act(() => result.current.dispatch({ type: 'set-field', field: 'title', value: '仍在内存' }))
    act(() => vi.advanceTimersByTime(400))
    expect(result.current.draft.title).toBe('仍在内存')
    expect(result.current.saveState).toBe('error')
  })

  it('resets both storage and in-memory data', () => {
    const storage = makeStorage()
    const { result } = renderHook(() => useChatDraft(storage))
    act(() => result.current.dispatch({ type: 'set-field', field: 'title', value: '临时标题' }))
    act(() => result.current.reset())
    expect(storage.removeItem).toHaveBeenCalledOnce()
    expect(result.current.draft.title).toBe('仙女驻凡大使馆')
  })
})
