import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SAMPLE_DRAFT } from '../app/sampleDraft'
import { createMessage } from '../app/messageFactory'
import * as mediaStore from './mediaAssetStore'
import { importProject, serializeProject, getProjectExportWarning, estimateProjectExportSize, MAX_PROJECT_FILE_BYTES } from './projectFile'

function readBlob(blob: Blob): Promise<string> {
  return new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.readAsDataURL(blob) })
}

async function fixture() {
  const asset = await mediaStore.saveMediaAsset(new File([new Uint8Array([0, 1, 254, 255])], 'clip.wav', { type: 'audio/wav' }), { durationSeconds: 2 })
  const media = { assetId: asset.id, fileName: 'clip.wav', mimeType: 'audio/wav', durationSeconds: 2, sizeBytes: 4, expired: false, posterDataUrl: null }
  const message = createMessage('self', { kind: 'voice', media })
  const draft = { ...SAMPLE_DRAFT, messages: [message, createMessage('p2', { kind: 'file', media })], captureStartMessageId: message.id }
  return { asset, draft, json: await serializeProject(draft) }
}

afterEach(() => vi.restoreAllMocks())
describe('portable project files', () => {
  it('imports an independently created neutral project envelope', async () => {
    const imported = await importProject(JSON.stringify({
      fileType: 'chat-screenshot-project',
      formatVersion: 1,
      exportedAt: '2026-08-31T00:00:00.000Z',
      draft: { ...SAMPLE_DRAFT, title: '新格式项目', messages: [] },
      assets: [],
    }))
    expect(imported.title).toBe('新格式项目')
    expect(imported.messages).toEqual([])
  })
  it('round-trips shared binary with independently editable display sizes', async () => {
    const { draft } = await fixture()
    draft.messages[0].media = { ...draft.messages[0].media!, sizeBytes: 8 }
    draft.messages[1].media = { ...draft.messages[1].media!, sizeBytes: 99 }
    const imported = await importProject(await serializeProject(draft))
    expect(imported.messages.map(message => message.media!.sizeBytes)).toEqual([8, 99])
    expect(imported.messages[0].media!.assetId).toBe(imported.messages[1].media!.assetId)
    const asset = (await mediaStore.getMediaAsset(imported.messages[0].media!.assetId))!
    expect(asset.sizeBytes).toBe(4)
    expect(await readBlob(asset.blob)).toBe('data:audio/wav;base64,AAH+/w==')
  })
  it('round-trips real binary, shared references, capture IDs and all attachment metadata', async () => {
    const { asset, draft, json } = await fixture()
    const envelope = JSON.parse(json)
    expect(Object.keys(envelope).sort()).toEqual(['assets', 'draft', 'exportedAt', 'fileType', 'formatVersion'])
    expect(envelope.fileType).toBe('chat-screenshot-project')
    expect(envelope.assets).toHaveLength(1)
    expect(envelope.assets[0].dataUrl).toBe('data:audio/wav;base64,AAH+/w==')
    const imported = await importProject(json)
    expect(imported.participants[0].id).not.toBe('self')
    expect(imported.messages[0].id).not.toBe(draft.messages[0].id)
    expect(imported.captureStartMessageId).toBe(imported.messages[0].id)
    expect(imported.messages[0].participantId).toBe(imported.participants[0].id)
    const newId = imported.messages[0].media!.assetId
    expect(newId).not.toBe(asset.id)
    expect(imported.messages[1].media!.assetId).toBe(newId)
    expect(imported.messages[0].media).toEqual({ ...draft.messages[0].media, assetId: newId })
    await mediaStore.cleanupUnreferencedMediaAssets(new Set())
    const loaded = await mediaStore.getMediaAsset(newId)
    expect(await readBlob(loaded!.blob)).toBe('data:audio/wav;base64,AAH+/w==')
    expect(loaded).toMatchObject({ durationSeconds: 2, sizeBytes: 4, expired: false })
  })
  it.each(['fileType', 'version', 'missing', 'duplicate', 'base64', 'mime', 'draft', 'extra', 'mismatch'])('rejects %s before any writes', async issue => {
    const { json } = await fixture()
    const envelope = JSON.parse(json)
    if (issue === 'fileType') envelope.fileType = 'unrelated-project'
    if (issue === 'version') envelope.formatVersion = 2
    if (issue === 'missing') envelope.assets = []
    if (issue === 'duplicate') envelope.assets.push(envelope.assets[0])
    if (issue === 'base64') envelope.assets[0].dataUrl = 'data:audio/wav;base64,AAH!'
    if (issue === 'mime') envelope.assets[0].mimeType = 'text/html;broken'
    if (issue === 'draft') envelope.draft.messages[0].participantId = 'missing'
    if (issue === 'extra') envelope.assets.push({ ...envelope.assets[0], originalAssetId: 'unused' })
    if (issue === 'mismatch') envelope.assets[0].dataUrl = 'data:image/png;base64,AAH+/w=='
    const save = vi.spyOn(mediaStore, 'saveMediaAsset')
    await expect(importProject(JSON.stringify(envelope))).rejects.toThrow()
    expect(save).not.toHaveBeenCalled()
  })
  it('rolls back only its own assets if persistence fails halfway', async () => {
    const { asset, json } = await fixture()
    const envelope = JSON.parse(json)
    envelope.assets.push({ ...envelope.assets[0], originalAssetId: 'second' })
    envelope.draft.messages[1].media.assetId = 'second'
    const originalSave = mediaStore.saveMediaAsset
    let written = ''
    let count = 0
    vi.spyOn(mediaStore, 'saveMediaAsset').mockImplementation(async (...args) => {
      if (++count === 2) throw new Error('Quota exceeded')
      const record = await originalSave(...args); written = record.id; return record
    })
    await expect(importProject(JSON.stringify(envelope))).rejects.toThrow(/Quota exceeded/)
    expect(await mediaStore.getMediaAsset(written)).toBeNull()
    expect(await mediaStore.getMediaAsset(asset.id)).not.toBeNull()
  })
  it('releases abandoned import pins when deletion fails so later cleanup can recover', async () => {
    const { json } = await fixture()
    const envelope = JSON.parse(json)
    envelope.assets.push({ ...envelope.assets[0], originalAssetId: 'second' })
    envelope.draft.messages[1].media.assetId = 'second'
    const save = mediaStore.saveMediaAsset
    let written = '', count = 0
    vi.spyOn(mediaStore, 'saveMediaAsset').mockImplementation(async (...args) => {
      if (++count === 2) throw new Error('Quota exceeded')
      const result = await save(...args); written = result.id; return result
    })
    vi.spyOn(mediaStore, 'deleteMediaAsset').mockRejectedValue(new Error('temporary deletion failure'))
    await expect(importProject(JSON.stringify(envelope))).rejects.toThrow(/清理失败/)
    await mediaStore.cleanupUnreferencedMediaAssets(new Set())
    expect(await mediaStore.getMediaAsset(written)).toBeNull()
  })
  it('canonicalizes unknown MIME types, refuses missing export media and reports large export warning', async () => {
    const asset = await mediaStore.saveMediaAsset(new File(['unknown'], 'unknown.bin'))
    const draft = { ...SAMPLE_DRAFT, messages: [createMessage('self', { kind: 'file', media: { assetId: asset.id, fileName: 'unknown.bin', mimeType: '' } })] }
    const imported = await importProject(await serializeProject(draft))
    expect(imported.messages[0].media?.mimeType).toBe('application/octet-stream')
    expect(getProjectExportWarning(60 * 1024 * 1024)).toEqual(expect.any(String))
    expect(getProjectExportWarning(10)).toBeNull()
    draft.messages[0].media!.assetId = 'not-there'
    await expect(serializeProject(draft)).rejects.toThrow(/媒体|素材/)
  })
  it('round-trips 12 MiB binary and estimates size without overflowing Base64 validator stack', async () => {
    const asset = await mediaStore.saveMediaAsset(new File([new Uint8Array(12 * 1024 * 1024)], 'large.bin', { type: 'application/octet-stream' }))
    const draft = { ...SAMPLE_DRAFT, messages: [createMessage('self', { kind: 'file', media: { assetId: asset.id, fileName: asset.fileName, mimeType: asset.mimeType } })] }
    const estimate = await estimateProjectExportSize(draft)
    const json = await serializeProject(draft)
    expect(estimate).toBeGreaterThanOrEqual(new Blob([json]).size)
    const restored = await importProject(json)
    const restoredAsset = (await mediaStore.getMediaAsset(restored.messages[0].media!.assetId))!
    expect(restoredAsset.blob.size).toBe(12582912)
    expect(await readBlob(restoredAsset.blob)).toBe(`data:application/octet-stream;base64,${'A'.repeat(16777216)}`)
  })
  it('rejects oversized input before parsing or decoding', async () => {
    await expect(importProject(' '.repeat(MAX_PROJECT_FILE_BYTES + 1))).rejects.toThrow(/150 MB/)
  })
  it.each(['https://example.com/avatar.png', 'javascript:alert(1)', 'data:image/png;base64,AB=='])('rejects nonportable or invalid avatar %s without writes', async avatar => {
    const { json } = await fixture()
    const envelope = JSON.parse(json)
    envelope.draft.participants[0].avatarDataUrl = avatar
    const save = vi.spyOn(mediaStore, 'saveMediaAsset')
    await expect(importProject(JSON.stringify(envelope))).rejects.toThrow()
    expect(save).not.toHaveBeenCalled()
  })
  describe.each(['poster', 'thumbnail', 'contact avatar'] as const)('%s inline image', field => {
    it.each(['A', 'AB==', 'AAB='])('rejects invalid Base64 %s before persistence', async payload => {
      const { asset, json } = await fixture()
      const envelope = JSON.parse(json)
      const image = `data:image/png;base64,${payload}`
      if (field === 'poster') envelope.draft.messages[0].media.posterDataUrl = image
      if (field === 'thumbnail') envelope.draft.messages.push(createMessage('self', { kind: 'link', link: { title: 'test', description: '', url: '', thumbnailDataUrl: image } }))
      if (field === 'contact avatar') envelope.draft.messages.push(createMessage('self', { kind: 'contact', contactCard: { name: 'test', description: '', avatarDataUrl: image } }))
      const save = vi.spyOn(mediaStore, 'saveMediaAsset')
      await expect(importProject(JSON.stringify(envelope))).rejects.toThrow(/Base64/)
      expect(save).not.toHaveBeenCalled()
      expect(await mediaStore.getMediaAsset(asset.id)).not.toBeNull()
    })
  })
})
