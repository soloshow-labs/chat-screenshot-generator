import 'fake-indexeddb/auto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SAMPLE_DRAFT } from '../app/sampleDraft'
import type { ChatDraft } from '../app/chatTypes'

async function seedVersionOneDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('chat-screenshot-generator', 1)
    request.onupgradeneeded = () => {
      const database = request.result
      for (const name of ['mediaAssets', 'contacts', 'groupPresets']) database.createObjectStore(name, { keyPath: 'id' })
      request.transaction!.objectStore('mediaAssets').put({
        id: 'version-one-media',
        data: new Uint8Array([7, 8, 9]).buffer,
        fileName: 'before-upgrade.png',
        mimeType: 'image/png',
        createdAt: 1,
        sizeBytes: 3,
      })
    }
    request.onsuccess = () => { request.result.close(); resolve() }
    request.onerror = () => reject(request.error)
  })
}

describe('localProjectStore', () => {
  beforeAll(seedVersionOneDatabase)

  afterAll(async () => {
    const { listProjects, deleteProject } = await import('./localProjectStore')
    for (const project of await listProjects()) await deleteProject(project.id)
  })

  it('upgrades a version 1 database without losing media and creates the first project from the active draft', async () => {
    const { ensureInitialProject, listProjects } = await import('./localProjectStore')
    const { getMediaAsset } = await import('./mediaAssetStore')
    const { DATABASE_VERSION, STORE_NAMES } = await import('./indexedDatabase')

    const initial = await ensureInitialProject(SAMPLE_DRAFT, 100)
    expect(initial.draft.title).toBe(SAMPLE_DRAFT.title)
    expect((await ensureInitialProject({ ...SAMPLE_DRAFT, title: '不应覆盖' }, 200)).id).toBe(initial.id)
    expect(await listProjects()).toHaveLength(1)
    expect(await getMediaAsset('version-one-media')).toEqual(expect.objectContaining({ fileName: 'before-upgrade.png', sizeBytes: 3 }))
    expect(DATABASE_VERSION).toBe(2)
    expect(Object.values(STORE_NAMES)).toEqual(expect.arrayContaining(['projects', 'projectCheckpoints', 'appMetadata']))
  })

  it('creates only one initial project when strict-mode initialization overlaps', async () => {
    const { deleteProject, ensureInitialProject, listProjects } = await import('./localProjectStore')
    for (const project of await listProjects()) await deleteProject(project.id)

    const [first, second] = await Promise.all([
      ensureInitialProject({ ...SAMPLE_DRAFT, title: '并发初始化' }, 250),
      ensureInitialProject({ ...SAMPLE_DRAFT, title: '并发初始化' }, 250),
    ])

    expect(first.id).toBe(second.id)
    expect(await listProjects()).toHaveLength(1)
  })

  it('creates, renames, duplicates, switches and deletes independently cloned projects', async () => {
    const {
      createProject,
      deleteProject,
      duplicateProject,
      getActiveProject,
      listProjects,
      renameProject,
      switchProject,
    } = await import('./localProjectStore')

    const created = await createProject({ ...SAMPLE_DRAFT, title: '第二个项目' }, 300)
    const renamed = await renameProject(created.id, '重新命名', 400)
    expect(renamed.title).toBe('重新命名')
    expect(renamed.draft.title).toBe('重新命名')

    const duplicate = await duplicateProject(created.id, 500)
    expect(duplicate.id).not.toBe(created.id)
    expect(duplicate.title).toBe('重新命名 - 副本')
    expect(duplicate.draft.messages).not.toBe(renamed.draft.messages)

    const switched = await switchProject(created.id, { ...SAMPLE_DRAFT, title: '切换前保存' }, 600)
    expect(switched.id).toBe(created.id)
    expect((await getActiveProject())?.id).toBe(created.id)
    expect((await listProjects()).some(project => project.draft.title === '切换前保存')).toBe(true)

    await deleteProject(duplicate.id)
    expect((await listProjects()).some(project => project.id === duplicate.id)).toBe(false)
  })

  it('saves active changes and keeps only ten distinct checkpoints newest first', async () => {
    const {
      createCheckpoint,
      getActiveProject,
      listCheckpoints,
      saveActiveProject,
    } = await import('./localProjectStore')

    const active = await getActiveProject()
    expect(active).not.toBeNull()
    const saved = await saveActiveProject({ ...active!.draft, title: '当前保存值' }, 700)
    expect(saved.draft.title).toBe('当前保存值')

    for (let index = 0; index < 12; index++) {
      const draft = { ...SAMPLE_DRAFT, title: `v${index}` } as ChatDraft
      await createCheckpoint(active!.id, draft, 'interval', 800 + index)
    }
    await createCheckpoint(active!.id, { ...SAMPLE_DRAFT, title: 'v11' }, 'interval', 900)

    expect((await listCheckpoints(active!.id)).map(item => item.draft.title)).toEqual([
      'v11', 'v10', 'v9', 'v8', 'v7', 'v6', 'v5', 'v4', 'v3', 'v2',
    ])
  })

  it('restores checkpoints as validated clones and enumerates every retained draft', async () => {
    const {
      createCheckpoint,
      getActiveProject,
      getStoredDrafts,
      listCheckpoints,
      restoreCheckpoint,
    } = await import('./localProjectStore')

    const active = await getActiveProject()
    const checkpoint = await createCheckpoint(active!.id, { ...SAMPLE_DRAFT, title: '可以恢复' }, 'destructive', 1_000)
    const restored = await restoreCheckpoint(checkpoint.id, 1_100)
    restored.messages.push({ ...restored.messages[0], id: 'mutation' })

    expect((await listCheckpoints(active!.id))[0].draft.messages).toHaveLength(SAMPLE_DRAFT.messages.length)
    expect((await getStoredDrafts()).some(draft => draft.title === '可以恢复')).toBe(true)
  })
})
