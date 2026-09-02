import 'fake-indexeddb/auto'
import { afterEach, expect, it, vi } from 'vitest'
import { SAMPLE_DRAFT } from '../app/sampleDraft'
import { createMessage } from '../app/messageFactory'
import { createQuoteSnapshot } from '../utils/messageQuote'
import { importProject, serializeProject } from './projectFile'
import * as mediaStore from './mediaAssetStore'
import { migrateChatDraft } from './draftStore'

afterEach(() => vi.restoreAllMocks())
async function fixture() {
  const asset = await mediaStore.saveMediaAsset(new File([new Uint8Array([0, 1])], 'quote.png', { type: 'image/png' }), { width: 40, height: 20 })
  const source = createMessage('self', { id: 'source', kind: 'image', media: { assetId: asset.id, fileName: 'quote.png', mimeType: 'image/png', width: 40, height: 20 } })
  const reply = createMessage('p2', { id: 'reply', text: '引用', quote: createQuoteSnapshot(source, SAMPLE_DRAFT.participants[0]) })
  return { asset, source, reply, draft: { ...SAMPLE_DRAFT, messages: [source, reply] } }
}

it('exports shared image once and maps quote-only binary, message source and capture IDs on import', async () => {
  const { source, reply, draft } = await fixture()
  draft.captureEndMessageId = reply.id
  const json = await serializeProject(draft)
  expect(JSON.parse(json).assets).toHaveLength(1)
  const imported = await importProject(json)
  expect(imported.messages[1].quote?.sourceMessageId).toBe(imported.messages[0].id)
  expect(imported.messages[1].quote?.media?.assetId).toBe(imported.messages[0].media?.assetId)
  expect(imported.messages[0].media?.assetId).not.toBe(source.media?.assetId)
  expect(imported.captureEndMessageId).toBe(imported.messages[1].id)
  const quoteOnly = { ...draft, messages: [{ ...reply, quote: { ...reply.quote!, sourceMessageId: null } }] }
  const quoteJson = await serializeProject(quoteOnly)
  expect(JSON.parse(quoteJson).assets).toHaveLength(1)
  const restored = await importProject(quoteJson)
  const id = restored.messages[0].quote!.media!.assetId
  expect(id).not.toBe(source.media?.assetId)
  await mediaStore.cleanupUnreferencedMediaAssets(new Set())
  expect((await mediaStore.getMediaAsset(id))?.blob.size).toBe(2)
})

it('normalizes only absent source IDs while rejecting self references and malformed quote fields before writes', async () => {
  const { draft } = await fixture()
  const envelope = JSON.parse(await serializeProject(draft))
  envelope.draft.messages[1].quote.sourceMessageId = 'deleted'
  expect((await importProject(JSON.stringify(envelope))).messages[1].quote?.sourceMessageId).toBeNull()
  for (const patch of [{ sourceMessageId: 'reply' }, { sourceMessageId: 42 }, { kind: 'video' }, { media: null }, { text: 'not-empty' }, { senderName: null }]) {
    const invalid = structuredClone(envelope)
    Object.assign(invalid.draft.messages[1].quote, patch)
    const save = vi.spyOn(mediaStore, 'saveMediaAsset')
    await expect(importProject(JSON.stringify(invalid))).rejects.toThrow()
    expect(save).not.toHaveBeenCalled()
    save.mockRestore()
  }
})

it('validates every shared attachment position on export/import instead of last-map-entry only', async () => {
  const { draft } = await fixture()
  const envelope = JSON.parse(await serializeProject(draft))
  draft.messages[1].quote!.media!.mimeType = 'image/jpeg'
  await expect(serializeProject(draft)).rejects.toThrow(/MIME/)
  envelope.draft.messages[1].quote.media.mimeType = 'image/jpeg'
  const save = vi.spyOn(mediaStore, 'saveMediaAsset')
  await expect(importProject(JSON.stringify(envelope))).rejects.toThrow(/MIME/)
  expect(save).not.toHaveBeenCalled()
})

it('strictly validates schema3 quote image metadata and text snapshot shape', () => {
  const quote = { sourceMessageId: null, senderName: '小明', kind: 'image', text: '', media: { assetId: 'a', fileName: 'a.png', mimeType: 'image/png', width: 20, height: 40 } }
  for (const patch of [{ assetId: '' }, { mimeType: 'image/svg+xml' }, { width: 0 }, { height: Infinity }, { fileName: null }]) {
    expect(() => migrateChatDraft({ ...SAMPLE_DRAFT, messages: [{ ...SAMPLE_DRAFT.messages[0], quote: { ...quote, media: { ...quote.media, ...patch } } }] })).toThrow()
  }
  expect(() => migrateChatDraft({ ...SAMPLE_DRAFT, messages: [{ ...SAMPLE_DRAFT.messages[0], quote: { ...quote, kind: 'text' } }] })).toThrow()
})
