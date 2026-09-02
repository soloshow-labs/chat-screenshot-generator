import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type Dispatch } from 'react'
import { type ChatAction } from './chatReducer'
import type { ChatDraft, Message } from './chatTypes'
import { createHistory, historyDrafts as getHistoryDrafts, historyReducer, historyMessages as getHistoryMessages } from './chatHistory'
import { SAMPLE_DRAFT } from './sampleDraft'
import { loadDraft, resetDraft, saveDraft, type DraftStorage, type SaveResult } from '../services/draftStore'

export type SaveState = 'saved' | 'saving' | 'error'

function cloneSampleDraft(): ChatDraft {
  return JSON.parse(JSON.stringify(SAMPLE_DRAFT)) as ChatDraft
}

function readDraft(storage?: DraftStorage): { draft: ChatDraft; recoveryError: Error | null } {
  try { return { draft: loadDraft(storage ?? window.localStorage), recoveryError: null } }
  catch (error) { return { draft: cloneSampleDraft(), recoveryError: error instanceof Error ? error : new Error('无法读取本地草稿') } }
}

export function useChatDraft(storage?: DraftStorage): {
  draft: ChatDraft
  dispatch: Dispatch<ChatAction>
  saveState: SaveState
  reset: () => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  historyMessages: Message[]
  historyDrafts: ChatDraft[]
  recoveryError: Error | null
  retryRecovery: () => void
  recoverDraft: (draft: ChatDraft) => SaveResult
} {
  const [initial] = useState(() => readDraft(storage))
  const [recoveryError, setRecoveryError] = useState(initial.recoveryError)
  const recoveryBlocked = useRef(Boolean(initial.recoveryError))
  const [history, historyDispatch] = useReducer(historyReducer, initial.draft, createHistory)
  const draft = history.present
  const dispatch: Dispatch<ChatAction> = useCallback(action => { if (!recoveryBlocked.current) historyDispatch({ type: 'edit', action, timestamp: Date.now() }) }, [])
  const historyMessages = useMemo(() => getHistoryMessages(history), [history])
  const historyDrafts = useMemo(() => getHistoryDrafts(history), [history])
  const [saveState, setSaveState] = useState<SaveState>(initial.recoveryError ? 'error' : 'saved')
  const firstRender = useRef(true)

  useEffect(() => {
    if (recoveryError) return
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    setSaveState('saving')
    const timer = window.setTimeout(() => {
      try {
        const result = saveDraft(storage ?? window.localStorage, draft)
        setSaveState(result.ok ? 'saved' : 'error')
      } catch { setSaveState('error') }
    }, 400)
    return () => window.clearTimeout(timer)
  }, [draft, storage, recoveryError])

  function retryRecovery() {
    const loaded = readDraft(storage)
    setRecoveryError(loaded.recoveryError)
    recoveryBlocked.current = Boolean(loaded.recoveryError)
    if (!loaded.recoveryError) {
      firstRender.current = true
      historyDispatch({ type: 'recover', draft: loaded.draft })
      setSaveState('saved')
    }
  }

  function recoverDraft(candidate: ChatDraft): SaveResult {
    let result: SaveResult
    try { result = saveDraft(storage ?? window.localStorage, candidate) }
    catch (error) { result = { ok: false, error: error instanceof Error ? error : new Error('恢复草稿保存失败') } }
    if (!result.ok) { setSaveState('error'); return result }
    firstRender.current = true
    historyDispatch({ type: 'recover', draft: candidate })
    recoveryBlocked.current = false
    setRecoveryError(null)
    setSaveState('saved')
    return result
  }

  function reset() {
    if (recoveryBlocked.current) return
    try {
      resetDraft(storage ?? window.localStorage)
      dispatch({ type: 'replace-draft', draft: cloneSampleDraft() })
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }

  return { draft, dispatch, saveState, reset, recoveryError, retryRecovery, recoverDraft, undo: () => { if (!recoveryBlocked.current) historyDispatch({ type: 'undo' }) }, redo: () => { if (!recoveryBlocked.current) historyDispatch({ type: 'redo' }) }, canUndo: !recoveryError && history.past.length > 0, canRedo: !recoveryError && history.future.length > 0, historyMessages, historyDrafts }
}
