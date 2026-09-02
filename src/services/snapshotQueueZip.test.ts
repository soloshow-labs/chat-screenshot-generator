import { expect, it } from 'vitest'
import { createSnapshotZip } from './snapshotQueueZip'

it('packages staged blobs with unique filenames', async () => {
  const archive = await createSnapshotZip([
    { id: '1', filename: 'chat.png', blob: new Blob(['one'], { type: 'image/png' }), objectUrl: 'blob:1', createdAt: 1 },
    { id: '2', filename: 'chat.png', blob: new Blob(['two'], { type: 'image/png' }), objectUrl: 'blob:2', createdAt: 2 },
  ])
  expect(archive.type).toBe('application/zip')
  expect(archive.size).toBeGreaterThan(6)
})
