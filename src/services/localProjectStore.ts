import type { ChatDraft } from '../app/chatTypes'
import { migrateChatDraft } from './draftStore'
import { openApplicationDatabase, requestResult, STORE_NAMES, transactionComplete } from './indexedDatabase'

export interface LocalProjectRecord {
  id: string
  title: string
  draft: ChatDraft
  createdAt: number
  updatedAt: number
  openedAt: number
}

export interface ProjectCheckpointRecord {
  id: string
  projectId: string
  draft: ChatDraft
  createdAt: number
  reason: 'interval' | 'destructive' | 'switch'
}

interface AppMetadataRecord {
  key: 'activeProjectId'
  value: string
}

const ACTIVE_PROJECT_KEY = 'activeProjectId'
const MAX_CHECKPOINTS = 10
let initialProjectRequest: Promise<LocalProjectRecord> | null = null

function cloneDraft(draft: ChatDraft): ChatDraft {
  return migrateChatDraft(JSON.parse(JSON.stringify(draft)))
}

function cloneProject(record: LocalProjectRecord): LocalProjectRecord {
  return { ...record, draft: cloneDraft(record.draft) }
}

function cloneCheckpoint(record: ProjectCheckpointRecord): ProjectCheckpointRecord {
  return { ...record, draft: cloneDraft(record.draft) }
}

async function readActiveProjectId(database: IDBDatabase): Promise<string | null> {
  const transaction = database.transaction(STORE_NAMES.appMetadata, 'readonly')
  const record = await requestResult<AppMetadataRecord | undefined>(
    transaction.objectStore(STORE_NAMES.appMetadata).get(ACTIVE_PROJECT_KEY),
    '无法读取当前项目',
  )
  return record?.value ?? null
}

async function writeActiveProjectId(database: IDBDatabase, projectId: string | null): Promise<void> {
  const transaction = database.transaction(STORE_NAMES.appMetadata, 'readwrite')
  const store = transaction.objectStore(STORE_NAMES.appMetadata)
  if (projectId === null) store.delete(ACTIVE_PROJECT_KEY)
  else store.put({ key: ACTIVE_PROJECT_KEY, value: projectId } satisfies AppMetadataRecord)
  await transactionComplete(transaction, '无法保存当前项目')
}

async function readProject(database: IDBDatabase, id: string): Promise<LocalProjectRecord | null> {
  const transaction = database.transaction(STORE_NAMES.projects, 'readonly')
  const record = await requestResult<LocalProjectRecord | undefined>(
    transaction.objectStore(STORE_NAMES.projects).get(id),
    '无法读取本地项目',
  )
  return record ? cloneProject(record) : null
}

async function putProject(database: IDBDatabase, record: LocalProjectRecord): Promise<void> {
  const transaction = database.transaction(STORE_NAMES.projects, 'readwrite')
  transaction.objectStore(STORE_NAMES.projects).put(record)
  await transactionComplete(transaction, '无法保存本地项目')
}

export async function listProjects(): Promise<LocalProjectRecord[]> {
  const database = await openApplicationDatabase()
  const transaction = database.transaction(STORE_NAMES.projects, 'readonly')
  const records = await requestResult<LocalProjectRecord[]>(
    transaction.objectStore(STORE_NAMES.projects).getAll(),
    '无法读取本地项目列表',
  )
  return records.map(cloneProject).sort((left, right) => right.openedAt - left.openedAt || right.updatedAt - left.updatedAt)
}

export async function getActiveProject(): Promise<LocalProjectRecord | null> {
  const database = await openApplicationDatabase()
  const id = await readActiveProjectId(database)
  return id ? readProject(database, id) : null
}

async function ensureInitialProjectInternal(draft: ChatDraft, now: number): Promise<LocalProjectRecord> {
  const database = await openApplicationDatabase()
  const activeId = await readActiveProjectId(database)
  if (activeId) {
    const active = await readProject(database, activeId)
    if (active) return active
  }
  const existing = await listProjects()
  if (existing[0]) {
    await writeActiveProjectId(database, existing[0].id)
    return existing[0]
  }
  return createProject(draft, now)
}

export async function ensureInitialProject(draft: ChatDraft, now = Date.now()): Promise<LocalProjectRecord> {
  const request = initialProjectRequest ?? ensureInitialProjectInternal(draft, now)
  initialProjectRequest = request
  try {
    return cloneProject(await request)
  } finally {
    if (initialProjectRequest === request) initialProjectRequest = null
  }
}

export async function createProject(draft: ChatDraft, now = Date.now()): Promise<LocalProjectRecord> {
  const database = await openApplicationDatabase()
  const copy = cloneDraft(draft)
  const record: LocalProjectRecord = {
    id: crypto.randomUUID(),
    title: copy.title,
    draft: copy,
    createdAt: now,
    updatedAt: now,
    openedAt: now,
  }
  await putProject(database, record)
  await writeActiveProjectId(database, record.id)
  return cloneProject(record)
}

export async function saveActiveProject(draft: ChatDraft, now = Date.now()): Promise<LocalProjectRecord> {
  const database = await openApplicationDatabase()
  const activeId = await readActiveProjectId(database)
  if (!activeId) return createProject(draft, now)
  const current = await readProject(database, activeId)
  if (!current) return createProject(draft, now)
  const copy = cloneDraft(draft)
  const next = { ...current, title: copy.title, draft: copy, updatedAt: now }
  await putProject(database, next)
  return cloneProject(next)
}

export async function renameProject(id: string, title: string, now = Date.now()): Promise<LocalProjectRecord> {
  const database = await openApplicationDatabase()
  const current = await readProject(database, id)
  if (!current) throw new Error('找不到要重命名的本地项目')
  const normalized = title.trim() || '未命名项目'
  const next = { ...current, title: normalized, draft: { ...current.draft, title: normalized }, updatedAt: now }
  await putProject(database, next)
  return cloneProject(next)
}

export async function duplicateProject(id: string, now = Date.now()): Promise<LocalProjectRecord> {
  const database = await openApplicationDatabase()
  const source = await readProject(database, id)
  if (!source) throw new Error('找不到要复制的本地项目')
  return createProject({ ...source.draft, title: `${source.title} - 副本` }, now)
}

export async function switchProject(id: string, currentDraft: ChatDraft, now = Date.now()): Promise<LocalProjectRecord> {
  const database = await openApplicationDatabase()
  const target = await readProject(database, id)
  if (!target) throw new Error('找不到要打开的本地项目')
  const activeId = await readActiveProjectId(database)
  if (activeId && activeId !== id) {
    const active = await readProject(database, activeId)
    if (active) {
      const copy = cloneDraft(currentDraft)
      await putProject(database, { ...active, title: copy.title, draft: copy, updatedAt: now })
    }
  }
  const opened = { ...target, openedAt: now }
  await putProject(database, opened)
  await writeActiveProjectId(database, id)
  return cloneProject(opened)
}

export async function deleteProject(id: string): Promise<void> {
  const database = await openApplicationDatabase()
  const activeId = await readActiveProjectId(database)
  const transaction = database.transaction([STORE_NAMES.projects, STORE_NAMES.projectCheckpoints], 'readwrite')
  transaction.objectStore(STORE_NAMES.projects).delete(id)
  const checkpoints = transaction.objectStore(STORE_NAMES.projectCheckpoints).index('projectId').openCursor(IDBKeyRange.only(id))
  checkpoints.onsuccess = () => {
    const cursor = checkpoints.result
    if (!cursor) return
    cursor.delete()
    cursor.continue()
  }
  await transactionComplete(transaction, '无法删除本地项目')
  if (activeId !== id) return
  const replacement = (await listProjects())[0] ?? null
  await writeActiveProjectId(database, replacement?.id ?? null)
}

export async function listCheckpoints(projectId: string): Promise<ProjectCheckpointRecord[]> {
  const database = await openApplicationDatabase()
  const transaction = database.transaction(STORE_NAMES.projectCheckpoints, 'readonly')
  const records = await requestResult<ProjectCheckpointRecord[]>(
    transaction.objectStore(STORE_NAMES.projectCheckpoints).index('projectId').getAll(IDBKeyRange.only(projectId)),
    '无法读取项目恢复点',
  )
  return records.map(cloneCheckpoint).sort((left, right) => right.createdAt - left.createdAt)
}

export async function createCheckpoint(
  projectId: string,
  draft: ChatDraft,
  reason: ProjectCheckpointRecord['reason'],
  now = Date.now(),
): Promise<ProjectCheckpointRecord> {
  const copy = cloneDraft(draft)
  const current = await listCheckpoints(projectId)
  const serialized = JSON.stringify(copy)
  if (current[0] && JSON.stringify(current[0].draft) === serialized) return current[0]

  const database = await openApplicationDatabase()
  const record: ProjectCheckpointRecord = { id: crypto.randomUUID(), projectId, draft: copy, createdAt: now, reason }
  const transaction = database.transaction(STORE_NAMES.projectCheckpoints, 'readwrite')
  const store = transaction.objectStore(STORE_NAMES.projectCheckpoints)
  store.put(record)
  for (const checkpoint of current.slice(MAX_CHECKPOINTS - 1)) store.delete(checkpoint.id)
  await transactionComplete(transaction, '无法保存项目恢复点')
  return cloneCheckpoint(record)
}

export async function restoreCheckpoint(id: string, now = Date.now()): Promise<ChatDraft> {
  const database = await openApplicationDatabase()
  const transaction = database.transaction(STORE_NAMES.projectCheckpoints, 'readonly')
  const checkpoint = await requestResult<ProjectCheckpointRecord | undefined>(
    transaction.objectStore(STORE_NAMES.projectCheckpoints).get(id),
    '无法读取项目恢复点',
  )
  if (!checkpoint) throw new Error('找不到要恢复的项目版本')
  const current = await readProject(database, checkpoint.projectId)
  if (!current) throw new Error('恢复点所属项目已经不存在')
  const copy = cloneDraft(checkpoint.draft)
  await putProject(database, { ...current, title: copy.title, draft: copy, updatedAt: now, openedAt: now })
  await writeActiveProjectId(database, checkpoint.projectId)
  return copy
}

export async function getStoredDrafts(): Promise<ChatDraft[]> {
  const projects = await listProjects()
  const checkpoints = (await Promise.all(projects.map(project => listCheckpoints(project.id)))).flat()
  return [...projects.map(project => project.draft), ...checkpoints.map(checkpoint => checkpoint.draft)].map(cloneDraft)
}
