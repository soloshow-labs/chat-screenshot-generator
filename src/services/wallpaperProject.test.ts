import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
import { SAMPLE_DRAFT } from '../app/sampleDraft'
import { getMediaAsset, saveMediaAsset } from './mediaAssetStore'
import { importProject, serializeProject } from './projectFile'

it('round-trips image wallpaper through project assets with a remapped ID', async () => {
  const asset = await saveMediaAsset(new File(['wallpaper'], 'wallpaper.png', { type: 'image/png' }), { width: 430, height: 744 })
  const wallpaper = { type: 'image' as const, media: { assetId: asset.id, fileName: asset.fileName, mimeType: asset.mimeType, width: 430, height: 744 } }
  const json = await serializeProject({ ...SAMPLE_DRAFT, messages: [], wallpaper })
  const envelope = JSON.parse(json)
  expect(envelope.assets).toHaveLength(1)

  const imported = await importProject(json)
  expect(imported.wallpaper).toMatchObject({ type: 'image', media: { fileName: 'wallpaper.png', width: 430, height: 744 } })
  const importedId = imported.wallpaper && imported.wallpaper.type === 'image' ? imported.wallpaper.media.assetId : ''
  expect(importedId).not.toBe(asset.id)
  expect(await getMediaAsset(importedId)).not.toBeNull()
})

it('rejects a wallpaper project whose referenced asset is absent', async () => {
  const wallpaper = { type: 'image' as const, media: { assetId: 'missing', fileName: 'wallpaper.png', mimeType: 'image/png', width: 430, height: 744 } }
  await expect(importProject(JSON.stringify({
    fileType: 'chat-screenshot-project', formatVersion: 1, exportedAt: '2026-08-31T00:00:00.000Z',
    draft: { ...SAMPLE_DRAFT, messages: [], wallpaper }, assets: [],
  }))).rejects.toThrow(/媒体|素材/)
})
