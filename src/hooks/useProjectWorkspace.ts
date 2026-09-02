import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { ChatDraft } from '../app/chatTypes'
import type { SaveState } from '../app/useChatDraft'
import { SAMPLE_DRAFT } from '../app/sampleDraft'
import type { SaveResult } from '../services/draftStore'
import {
  createCheckpoint,
  createProject,
  deleteProject,
  duplicateProject,
  ensureInitialProject,
  getActiveProject,
  listCheckpoints,
  listProjects,
  renameProject,
  restoreCheckpoint,
  saveActiveProject,
  switchProject,
  type LocalProjectRecord,
  type ProjectCheckpointRecord,
} from '../services/localProjectStore'

const CHECKPOINT_INTERVAL_MS = 5 * 60 * 1_000

export type ProjectWorkspaceStatus = 'loading' | 'ready' | 'saving' | 'error'
export type PersistenceState = 'unsupported' | 'prompt' | 'granted' | 'denied'

export interface ProjectWorkspace {
  status: ProjectWorkspaceStatus
  error: string | null
  projects: LocalProjectRecord[]
  activeProjectId: string | null
  checkpoints: ProjectCheckpointRecord[]
  storageUsage: number | null
  storageQuota: number | null
  persistence: PersistenceState
  createNew: () => Promise<void>
  switchTo: (id: string) => Promise<void>
  rename: (id: string, title: string) => Promise<void>
  duplicate: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
  checkpointNow: (reason: ProjectCheckpointRecord['reason']) => Promise<void>
  restore: (checkpointId: string) => Promise<void>
  replaceCurrent: (draft: ChatDraft) => Promise<void>
  requestPersistence: () => Promise<void>
  refresh: () => Promise<void>
}

interface UseProjectWorkspaceOptions {
  draft: ChatDraft
  saveState: SaveState
  recoverDraft: (draft: ChatDraft) => SaveResult
  now?: () => number
  enabled?: boolean
}

function newProjectDraft(): ChatDraft {
  return {
    ...JSON.parse(JSON.stringify(SAMPLE_DRAFT)) as ChatDraft,
    title: '新聊天',
    messages: [],
    captureStartMessageId: null,
    captureEndMessageId: null,
    screenScrollTop: 0,
  }
}

export function useProjectWorkspace({ draft, saveState, recoverDraft, now = Date.now, enabled = true }: UseProjectWorkspaceOptions): ProjectWorkspace {
  const [status, setStatus] = useState<ProjectWorkspaceStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [projects, setProjects] = useState<LocalProjectRecord[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [checkpoints, setCheckpoints] = useState<ProjectCheckpointRecord[]>([])
  const [storageUsage, setStorageUsage] = useState<number | null>(null)
  const [storageQuota, setStorageQuota] = useState<number | null>(null)
  const [persistence, setPersistence] = useState<PersistenceState>('unsupported')
  const mounted = useRef(true)
  const initialized = useRef(false)
  const operation = useRef(false)
  const latestDraft = useRef(draft)
  const lastCheckpointAt = useRef(0)
  const lastCheckpointDraft = useRef<string | null>(null)

  useLayoutEffect(() => { latestDraft.current = draft }, [draft])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  const readStorageState = useCallback(async () => {
    if (!navigator.storage) return
    const estimate = await navigator.storage.estimate?.()
    if (mounted.current && estimate) {
      setStorageUsage(estimate.usage ?? null)
      setStorageQuota(estimate.quota ?? null)
    }
    if (typeof navigator.storage.persisted === 'function') {
      const persisted = await navigator.storage.persisted()
      if (mounted.current) setPersistence(persisted ? 'granted' : typeof navigator.storage.persist === 'function' ? 'prompt' : 'unsupported')
    }
  }, [])

  const refresh = useCallback(async () => {
    const [nextProjects, active] = await Promise.all([listProjects(), getActiveProject()])
    const nextCheckpoints = active ? await listCheckpoints(active.id) : []
    if (!mounted.current) return
    setProjects(nextProjects)
    setActiveProjectId(active?.id ?? null)
    setCheckpoints(nextCheckpoints)
    await readStorageState().catch(() => undefined)
  }, [readStorageState])

  useEffect(() => {
    if (!enabled) return undefined
    let current = true
    void (async () => {
      try {
        const active = await ensureInitialProject(latestDraft.current, now())
        if (!current || !mounted.current) return
        initialized.current = true
        lastCheckpointDraft.current = JSON.stringify(active.draft)
        lastCheckpointAt.current = active.updatedAt
        await refresh()
        if (current && mounted.current) setStatus('ready')
      } catch (cause) {
        if (current && mounted.current) {
          setError(cause instanceof Error ? cause.message : '本地项目功能暂不可用')
          setStatus('error')
        }
      }
    })()
    return () => { current = false }
  }, [enabled, now, refresh])

  useEffect(() => {
    if (!enabled || !initialized.current || saveState !== 'saved' || operation.current) return
    let current = true
    setStatus('saving')
    void (async () => {
      try {
        const timestamp = now()
        const saved = await saveActiveProject(draft, timestamp)
        const serialized = JSON.stringify(draft)
        let intervalCheckpoint: ProjectCheckpointRecord | null = null
        if (timestamp - lastCheckpointAt.current >= CHECKPOINT_INTERVAL_MS && serialized !== lastCheckpointDraft.current) {
          intervalCheckpoint = await createCheckpoint(saved.id, draft, 'interval', timestamp)
          lastCheckpointAt.current = timestamp
          lastCheckpointDraft.current = serialized
        }
        if (!current || !mounted.current) return
        setError(null)
        setProjects(existing => {
          const next = existing.some(project => project.id === saved.id)
            ? existing.map(project => project.id === saved.id ? saved : project)
            : [saved, ...existing]
          return [...next].sort((left, right) => right.openedAt - left.openedAt || right.updatedAt - left.updatedAt)
        })
        setActiveProjectId(saved.id)
        if (intervalCheckpoint) {
          setCheckpoints(existing => [intervalCheckpoint!, ...existing.filter(checkpoint => checkpoint.id !== intervalCheckpoint!.id)].slice(0, 10))
        }
        void readStorageState().catch(() => undefined)
        if (current && mounted.current) setStatus('ready')
      } catch (cause) {
        if (current && mounted.current) {
          setError(cause instanceof Error ? cause.message : '本地项目保存失败')
          setStatus('error')
        }
      }
    })()
    return () => { current = false }
  }, [draft, enabled, now, readStorageState, saveState])

  const run = useCallback(async (work: () => Promise<void>) => {
    if (operation.current) return
    operation.current = true
    setStatus('saving')
    setError(null)
    try {
      await work()
      await refresh()
      if (mounted.current) setStatus('ready')
    } catch (cause) {
      if (mounted.current) {
        setError(cause instanceof Error ? cause.message : '本地项目操作失败')
        setStatus('error')
      }
      throw cause
    } finally {
      operation.current = false
    }
  }, [refresh])

  const checkpointNow = useCallback(async (reason: ProjectCheckpointRecord['reason']) => {
    const snapshot = latestDraft.current
    await run(async () => {
      const active = await getActiveProject()
      if (!active) throw new Error('当前没有可保存的本地项目')
      const timestamp = now()
      await createCheckpoint(active.id, snapshot, reason, timestamp)
      lastCheckpointAt.current = timestamp
      lastCheckpointDraft.current = JSON.stringify(snapshot)
    })
  }, [now, run])

  const createNew = useCallback(async () => {
    await run(async () => {
      const active = await getActiveProject()
      if (active) await createCheckpoint(active.id, latestDraft.current, 'switch', now())
      const created = await createProject(newProjectDraft(), now())
      const result = recoverDraft(created.draft)
      if (!result.ok) throw result.error
    })
  }, [now, recoverDraft, run])

  const switchTo = useCallback(async (id: string) => {
    if (id === activeProjectId) return
    await run(async () => {
      const active = await getActiveProject()
      if (active) await createCheckpoint(active.id, latestDraft.current, 'switch', now())
      const target = await switchProject(id, latestDraft.current, now())
      const result = recoverDraft(target.draft)
      if (!result.ok) throw result.error
    })
  }, [activeProjectId, now, recoverDraft, run])

  const rename = useCallback(async (id: string, title: string) => {
    await run(async () => {
      const renamed = await renameProject(id, title, now())
      if (id === activeProjectId) {
        const result = recoverDraft(renamed.draft)
        if (!result.ok) throw result.error
      }
    })
  }, [activeProjectId, now, recoverDraft, run])

  const duplicate = useCallback(async (id: string) => {
    await run(async () => {
      const created = await duplicateProject(id, now())
      const result = recoverDraft(created.draft)
      if (!result.ok) throw result.error
    })
  }, [now, recoverDraft, run])

  const remove = useCallback(async (id: string) => {
    await run(async () => {
      await deleteProject(id)
      if (id !== activeProjectId) return
      const active = await getActiveProject()
      if (!active) throw new Error('至少需要保留一个本地项目')
      const result = recoverDraft(active.draft)
      if (!result.ok) throw result.error
    })
  }, [activeProjectId, recoverDraft, run])

  const restore = useCallback(async (checkpointId: string) => {
    await run(async () => {
      const active = await getActiveProject()
      if (active) await createCheckpoint(active.id, latestDraft.current, 'destructive', now())
      const restored = await restoreCheckpoint(checkpointId, now())
      const result = recoverDraft(restored)
      if (!result.ok) throw result.error
    })
  }, [now, recoverDraft, run])

  const replaceCurrent = useCallback(async (nextDraft: ChatDraft) => {
    await run(async () => {
      const active = await getActiveProject()
      if (!active) throw new Error('当前没有可替换的本地项目')
      await createCheckpoint(active.id, latestDraft.current, 'destructive', now())
      const result = recoverDraft(nextDraft)
      if (!result.ok) throw result.error
      await saveActiveProject(nextDraft, now())
    })
  }, [now, recoverDraft, run])

  const requestPersistence = useCallback(async () => {
    if (typeof navigator.storage?.persist !== 'function') {
      setPersistence('unsupported')
      return
    }
    const granted = await navigator.storage.persist()
    if (mounted.current) setPersistence(granted ? 'granted' : 'denied')
  }, [])

  return {
    status,
    error,
    projects,
    activeProjectId,
    checkpoints,
    storageUsage,
    storageQuota,
    persistence,
    createNew,
    switchTo,
    rename,
    duplicate,
    remove,
    checkpointNow,
    restore,
    replaceCurrent,
    requestPersistence,
    refresh,
  }
}
