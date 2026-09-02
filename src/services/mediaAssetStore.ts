import {
  openApplicationDatabase,
  requestResult,
  STORE_NAMES,
  transactionComplete,
} from './indexedDatabase'

export interface MediaAssetMetadata {
  mimeType?: string
  width?: number
  height?: number
  durationSeconds?: number
  sizeBytes?: number
  expired?: boolean
  posterDataUrl?: string | null
}

// Saved/imported records are pinned before dispatch. Adoption transfers the pin
// to committed draft/history ownership; release abandons an uncommitted upload.
const protectedAssets = new Map<string, symbol>()
let cleanupGeneration = 0
let activeCleanup: { transaction: IDBTransaction; cancelled: boolean } | null = null

function cancelActiveCleanup(): void {
  const active = activeCleanup
  if (!active) return
  try {
    // Generation checks cannot undo queued deletes. Abort rolls the entire
    // readwrite transaction back if a new owner/snapshot arrives before commit.
    active.transaction.abort()
    active.cancelled = true
  } catch (error) {
    // A transaction may have committed before its completion callback runs.
    if (!(error instanceof DOMException) || error.name !== 'InvalidStateError') throw error
  }
}

/**
 * Single pending-operation owner per ID: uploads/imports receive fresh IDs.
 * Re-adoption renews that owner's pin; this is not a multi-owner lease API.
 * Cancellation may release only IDs exclusively owned by that operation.
 */
export function adoptMediaAssets(ids: Iterable<string>): void {
  ++cleanupGeneration
  cancelActiveCleanup()
  for (const id of ids) protectedAssets.set(id, Symbol(id))
}
export function releaseMediaAssets(ids: Iterable<string>): void {
  for (const id of ids) protectedAssets.delete(id)
}

export interface MediaAssetRecord extends MediaAssetMetadata {
  id: string
  blob: Blob
  fileName: string
  mimeType: string
  createdAt: number
}

interface StoredMediaAssetRecord extends Omit<MediaAssetRecord, 'blob'> {
  data: ArrayBuffer
}

function readFile(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(new Error('无法读取媒体文件'))
    reader.readAsArrayBuffer(file)
  })
}

export async function saveMediaAsset(
  file: File,
  metadata: MediaAssetMetadata = {},
): Promise<MediaAssetRecord> {
  const data = await readFile(file)
  const database = await openApplicationDatabase()
  const transaction = database.transaction(STORE_NAMES.mediaAssets, 'readwrite')
  const record: MediaAssetRecord = {
    id: crypto.randomUUID(),
    blob: file,
    fileName: file.name,
    mimeType: metadata.mimeType ?? file.type,
    createdAt: Date.now(),
    sizeBytes: file.size,
    ...metadata,
  }

  adoptMediaAssets([record.id])

  const storedRecord: StoredMediaAssetRecord = {
    ...record,
    data,
  }
  delete (storedRecord as Partial<MediaAssetRecord>).blob
  transaction.objectStore(STORE_NAMES.mediaAssets).put(storedRecord)
  try {
    await transactionComplete(transaction, '无法保存媒体素材')
  } catch (error) {
    releaseMediaAssets([record.id])
    throw error
  }
  return record
}

export async function getMediaAsset(id: string): Promise<MediaAssetRecord | null> {
  const database = await openApplicationDatabase()
  const transaction = database.transaction(STORE_NAMES.mediaAssets, 'readonly')
  const request = transaction.objectStore(STORE_NAMES.mediaAssets).get(id)
  const record = await requestResult<StoredMediaAssetRecord | undefined>(
    request,
    '无法读取媒体素材',
  )
  if (!record) return null

  const { data, ...metadata } = record
  return {
    ...metadata,
    blob: new Blob([data], { type: record.mimeType }),
  }
}

export async function deleteMediaAsset(id: string): Promise<void> {
  const database = await openApplicationDatabase()
  const transaction = database.transaction(STORE_NAMES.mediaAssets, 'readwrite')
  transaction.objectStore(STORE_NAMES.mediaAssets).delete(id)
  await transactionComplete(transaction, '无法删除媒体素材')
  releaseMediaAssets([id])
}

export async function cleanupUnreferencedMediaAssets(
  referencedAssetIds: ReadonlySet<string>,
): Promise<void> {
  const generation = ++cleanupGeneration
  cancelActiveCleanup()
  const protectionsAtStart = new Map(protectedAssets)
  const database = await openApplicationDatabase()
  if (generation !== cleanupGeneration) return
  const transaction = database.transaction(STORE_NAMES.mediaAssets, 'readwrite')
  const cleanup = { transaction, cancelled: false }
  activeCleanup = cleanup
  const request = transaction.objectStore(STORE_NAMES.mediaAssets).openCursor()

  request.onsuccess = () => {
    const cursor = request.result
    if (!cursor) return
    if (generation !== cleanupGeneration) return
    const id = String(cursor.key)
    // First observed reference completes adoption. Never unpin before the
    // cleanup snapshot actually contains the committed reference.
    if (referencedAssetIds.has(id)) {
      if (protectedAssets.get(id) === protectionsAtStart.get(id)) releaseMediaAssets([id])
    } else if (!protectedAssets.has(id)) cursor.delete()
    cursor.continue()
  }

  try {
    await transactionComplete(transaction, '无法清理媒体素材')
  } catch (error) {
    if (!cleanup.cancelled) throw error
  } finally {
    if (activeCleanup === cleanup) activeCleanup = null
  }
}
