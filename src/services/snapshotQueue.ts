import { pngDataUrlToBlob } from './pngClipboard'

export const MAX_STAGED_SNAPSHOTS = 20
export const MAX_STAGED_SNAPSHOT_BYTES = 100 * 1024 * 1024

export interface StagedSnapshot {
  id: string
  filename: string
  blob: Blob
  objectUrl: string
  createdAt: number
}

export function stagedSnapshotBytes(items: StagedSnapshot[]): number {
  return items.reduce((total, item) => total + item.blob.size, 0)
}

export function stageSnapshot(
  items: StagedSnapshot[],
  result: { filename: string; dataUrl: string },
  now = Date.now(),
  createObjectUrl: (blob: Blob) => string = blob => URL.createObjectURL(blob),
): StagedSnapshot {
  if (items.length >= MAX_STAGED_SNAPSHOTS) throw new Error(`暂存盘最多保留 ${MAX_STAGED_SNAPSHOTS} 张图片`)
  const blob = pngDataUrlToBlob(result.dataUrl)
  if (stagedSnapshotBytes(items) + blob.size > MAX_STAGED_SNAPSHOT_BYTES) throw new Error('暂存盘总大小不能超过 100 MB')
  return { id: crypto.randomUUID(), filename: result.filename, blob, objectUrl: createObjectUrl(blob), createdAt: now }
}

export function removeStagedSnapshot(
  items: StagedSnapshot[],
  id: string,
  revokeObjectUrl: (url: string) => void = url => URL.revokeObjectURL(url),
): StagedSnapshot[] {
  const removed = items.find(item => item.id === id)
  if (removed) revokeObjectUrl(removed.objectUrl)
  return items.filter(item => item.id !== id)
}

export function clearStagedSnapshots(
  items: StagedSnapshot[],
  revokeObjectUrl: (url: string) => void = url => URL.revokeObjectURL(url),
): void {
  for (const item of items) revokeObjectUrl(item.objectUrl)
}
