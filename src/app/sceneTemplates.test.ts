import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { PNG } from 'pngjs'
import { SCENE_TEMPLATES, createSceneTemplate } from './sceneTemplates'
import { isChatDraft } from '../services/draftStore'
import { cleanupUnreferencedMediaAssets, getMediaAsset } from '../services/mediaAssetStore'
import * as mediaStore from '../services/mediaAssetStore'

describe('scene templates', () => {
  it('creates six valid editable scenes with fresh IDs and now-relative timestamps', async () => {
    expect(SCENE_TEMPLATES).toHaveLength(6)
    for (const template of SCENE_TEMPLATES) {
      const first = await createSceneTemplate(template.id, new Date('2026-08-31T02:00:00Z'))
      const second = await createSceneTemplate(template.id, new Date('2026-09-01T02:00:00Z'))
      expect(isChatDraft(first)).toBe(true)
      expect(first.messages.length).toBeGreaterThan(0)
      expect(first.participants.filter(p => p.isSelf)).toHaveLength(1)
      expect(second.participants[0].id).not.toBe(first.participants[0].id)
      expect(second.messages[0].id).not.toBe(first.messages[0].id)
      expect(+new Date(second.messages[0].sentAt) - +new Date(first.messages[0].sentAt)).toBe(86400000)
    }
  })
  it('includes actual locally generated PNG and playable mono PCM WAV with protected records', async () => {
    const draft = await createSceneTemplate('mixed', new Date('2026-08-31T02:00:00Z'))
    await cleanupUnreferencedMediaAssets(new Set())
    for (const kind of ['image', 'voice']) {
      const message = draft.messages.find(m => m.kind === kind)!
      const record = await getMediaAsset(message.media!.assetId)
      expect(record).not.toBeNull()
      const bytes = await new Promise<Uint8Array>(resolve => { const r = new FileReader(); r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer)); r.readAsArrayBuffer(record!.blob) })
      if (kind === 'image') {
        expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
        const png = PNG.sync.read(Buffer.from(bytes))
        expect([png.width, png.height]).toEqual([96, 64])
      }
      else {
        expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF')
        expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WAVE')
        expect(bytes.length).toBe(16044)
        const view = new DataView(bytes.buffer)
        expect(view.getUint16(20, true)).toBe(1)
        expect(view.getUint16(22, true)).toBe(1)
        expect(view.getUint32(24, true)).toBe(8000)
        expect(view.getUint32(40, true)).toBe(16000)
        expect([...bytes.slice(44)].some(byte => byte > 0)).toBe(true)
        expect(message.media!.durationSeconds).toBe(1)
      }
    }
    expect((await createSceneTemplate('dark-long')).outputMode).toBe('long')
    await expect(createSceneTemplate('unknown')).rejects.toThrow()
    await expect(createSceneTemplate('direct', new Date('bad'))).rejects.toThrow()
  })
  it.each([false, true])('rolls back its image if voice save fails, even after deletion failure=%s', async deletionFails => {
    const existing = await mediaStore.saveMediaAsset(new File(['keep'], 'keep.bin'))
    const save = mediaStore.saveMediaAsset
    let written = '', calls = 0
    const spy = vi.spyOn(mediaStore, 'saveMediaAsset').mockImplementation(async (...args) => {
      if (++calls === 2) throw new Error('Quota exceeded')
      const result = await save(...args); written = result.id; return result
    })
    if (deletionFails) vi.spyOn(mediaStore, 'deleteMediaAsset').mockRejectedValue(new Error('temporary deletion failure'))
    try {
      await expect(createSceneTemplate('mixed')).rejects.toThrow(/Quota exceeded/)
      if (deletionFails) await cleanupUnreferencedMediaAssets(new Set())
      expect(await mediaStore.getMediaAsset(written)).toBeNull()
      expect(await mediaStore.getMediaAsset(existing.id)).not.toBeNull()
    } finally { spy.mockRestore(); vi.restoreAllMocks() }
  })
})
