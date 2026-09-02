import 'fake-indexeddb/auto'

import { describe, expect, it, vi } from 'vitest'

import {
  deleteMediaAsset,
  getMediaAsset,
  saveMediaAsset,
  adoptMediaAssets,
  releaseMediaAssets,
  cleanupUnreferencedMediaAssets,
} from './mediaAssetStore'

function readBlob(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}

describe('mediaAssetStore', () => {
  it.each(['adoption', 'new snapshot', 'adoption and new snapshot'] as const)(
    'rolls back a queued deletion when %s arrives before cleanup commits',
    async (interruption) => {
      const saved = await saveMediaAsset(new File(['retained bytes'], 'mid-transaction.png'))
      releaseMediaAssets([saved.id])
      const originalDelete = IDBCursor.prototype.delete
      let newerCleanup = Promise.resolve()
      let intercepted = false
      // Forward the real deletion. Only schedule the competing operation after
      // IndexedDB has queued that delete, before the readwrite transaction commits.
      const spy = vi.spyOn(IDBCursor.prototype, 'delete').mockImplementation(function (this: IDBCursor) {
        const request = originalDelete.call(this)
        if (this.key === saved.id && !intercepted) {
          intercepted = true
          queueMicrotask(() => {
            if (interruption !== 'new snapshot') adoptMediaAssets([saved.id])
            if (interruption !== 'adoption') newerCleanup = cleanupUnreferencedMediaAssets(new Set([saved.id]))
          })
        }
        return request
      })
      try {
        await cleanupUnreferencedMediaAssets(new Set())
        await newerCleanup
        const loaded = await getMediaAsset(saved.id)
        expect(loaded).not.toBeNull()
        expect(await readBlob(loaded!.blob)).toHaveLength(14)
      } finally {
        spy.mockRestore()
        releaseMediaAssets([saved.id])
        await deleteMediaAsset(saved.id)
      }
    },
  )

  it('does not release a newer adoption from an in-flight cleanup snapshot', async () => {
    const saved = await saveMediaAsset(new File(['x'], 'race.png'))
    const cleanup = cleanupUnreferencedMediaAssets(new Set([saved.id]))
    adoptMediaAssets([saved.id])
    await cleanup
    await cleanupUnreferencedMediaAssets(new Set())
    expect(await getMediaAsset(saved.id)).not.toBeNull()
    releaseMediaAssets([saved.id])
    await deleteMediaAsset(saved.id)
  })

  it('ignores an older cleanup when a newer snapshot references an asset', async () => {
    const saved = await saveMediaAsset(new File(['x'], 'race.png'))
    releaseMediaAssets([saved.id])
    await Promise.all([
      cleanupUnreferencedMediaAssets(new Set()),
      cleanupUnreferencedMediaAssets(new Set([saved.id])),
    ])
    expect(await getMediaAsset(saved.id)).not.toBeNull()
    await deleteMediaAsset(saved.id)
  })

  it('saves, reads, and deletes a media blob', async () => {
    const file = new File([new Uint8Array([7, 8, 9])], 'voice.wav', {
      type: 'audio/wav',
    })

    const saved = await saveMediaAsset(file, { durationSeconds: 3.2 })
    expect(await indexedDB.databases()).toContainEqual({ name: 'chat-screenshot-generator', version: 2 })
    const loaded = await getMediaAsset(saved.id)

    expect(loaded).not.toBeNull()
    expect(loaded?.fileName).toBe('voice.wav')
    expect(loaded?.mimeType).toBe('audio/wav')
    expect(loaded?.durationSeconds).toBe(3.2)
    expect([...(await readBlob(loaded!.blob))]).toEqual([7, 8, 9])

    await deleteMediaAsset(saved.id)
    expect(await getMediaAsset(saved.id)).toBeNull()
    expect(await getMediaAsset('missing-asset')).toBeNull()
  })
})
