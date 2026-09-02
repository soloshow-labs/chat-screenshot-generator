import { zipSync } from 'fflate'
import type { StagedSnapshot } from './snapshotQueue'

function uniqueFilename(filename: string, occurrence: number): string {
  if (occurrence === 1) return filename
  const dot = filename.lastIndexOf('.')
  return dot > 0 ? `${filename.slice(0, dot)}-${occurrence}${filename.slice(dot)}` : `${filename}-${occurrence}`
}

export async function createSnapshotZip(items: StagedSnapshot[]): Promise<Blob> {
  if (!items.length) throw new Error('暂存盘中没有可下载的图片')
  const occurrences = new Map<string, number>()
  const files: Record<string, Uint8Array> = {}
  for (const item of items) {
    const count = (occurrences.get(item.filename) ?? 0) + 1
    occurrences.set(item.filename, count)
    files[uniqueFilename(item.filename, count)] = new Uint8Array(await item.blob.arrayBuffer())
  }
  return new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' })
}
