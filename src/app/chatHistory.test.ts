import 'fake-indexeddb/auto'
import { expect, it, vi } from 'vitest'
import { createHistory, historyReducer, historyMessages } from './chatHistory'
import { SAMPLE_DRAFT } from './sampleDraft'
import { createMessage, messageKindPatch } from './messageFactory'
import { chatReducer } from './chatReducer'
import { adoptMediaAssets, releaseMediaAssets, saveMediaAsset, getMediaAsset, cleanupUnreferencedMediaAssets } from '../services/mediaAssetStore'

it('coalesces file names but keeps attachment replacements atomic', () => {
  const message = createMessage('p1', { kind: 'file', media: { assetId: 'a', fileName: 'a', mimeType: 'text/plain' } })
  let h = createHistory({ ...SAMPLE_DRAFT, messages: [message] })
  for (const [i, name] of ['ab', 'abc'].entries()) h = historyReducer(h, { type: 'edit', timestamp: i, action: { type: 'update-message', messageId: message.id, patch: { media: { ...message.media!, fileName: name } } } })
  expect(h.past).toHaveLength(1)
  h = historyReducer(h, { type: 'edit', timestamp: 2, action: { type: 'update-message', messageId: message.id, patch: { media: { ...message.media!, assetId: 'b' } } } })
  expect(h.past).toHaveLength(2)
})

it('coalesces only matching fields within 600ms and excludes no-op and scroll', () => {
  let h = createHistory(SAMPLE_DRAFT)
  h = historyReducer(h, { type: 'edit', timestamp: 0, action: { type: 'set-field', field: 'title', value: 'a' } })
  h = historyReducer(h, { type: 'edit', timestamp: 599, action: { type: 'set-field', field: 'title', value: 'b' } })
  expect(h.past).toHaveLength(1)
  h = historyReducer(h, { type: 'edit', timestamp: 1200, action: { type: 'set-field', field: 'title', value: 'c' } })
  expect(h.past).toHaveLength(2)
  h = historyReducer(h, { type: 'edit', timestamp: 1201, action: { type: 'set-field', field: 'statusTime', value: '11:11' } })
  h = historyReducer(h, { type: 'edit', timestamp: 1202, action: { type: 'set-field', field: 'title', value: 'c' } })
  h = historyReducer(h, { type: 'edit', timestamp: 1203, action: { type: 'set-field', field: 'screenScrollTop', value: 88 } })
  expect(h.past).toHaveLength(3)
  h = historyReducer(h, { type: 'undo' })
  expect(h.present.screenScrollTop).toBe(88)
  h = historyReducer(h, { type: 'redo' })
  expect(h.present.screenScrollTop).toBe(88)
})

it('separates wallpaper replacement and restore actions while color typing still coalesces', () => {
  let h = createHistory(SAMPLE_DRAFT)
  h = historyReducer(h, { type: 'edit', timestamp: 0, action: { type: 'set-field', field: 'wallpaper', value: { type: 'color', color: '#112233' } } })
  h = historyReducer(h, { type: 'edit', timestamp: 1, action: { type: 'set-field', field: 'wallpaper', value: null } })
  expect(h.past).toHaveLength(2)
  h = historyReducer(h, { type: 'undo' })
  expect(h.present.wallpaper).toEqual({ type: 'color', color: '#112233' })

  let colors = createHistory(SAMPLE_DRAFT)
  colors = historyReducer(colors, { type: 'edit', timestamp: 0, action: { type: 'set-field', field: 'wallpaper', value: { type: 'color', color: '#112233' } } })
  colors = historyReducer(colors, { type: 'edit', timestamp: 1, action: { type: 'set-field', field: 'wallpaper', value: { type: 'color', color: '#223344' } } })
  expect(colors.past).toHaveLength(1)
})

it('caps structural history at 50 and clears redo on editing', () => {
  let h = createHistory(SAMPLE_DRAFT)
  for (let i = 0; i < 55; i++) h = historyReducer(h, { type: 'edit', timestamp: i, action: { type: 'add-message', message: createMessage('self') } })
  expect(h.past).toHaveLength(50)
  h = historyReducer(h, { type: 'undo' })
  expect(h.future).toHaveLength(1)
  h = historyReducer(h, { type: 'edit', timestamp: 56, action: { type: 'clear-messages' } })
  expect(h.future).toHaveLength(0)
})

it('separates message targets, fields and the exact 600ms boundary', () => {
  let h = createHistory(SAMPLE_DRAFT)
  for (const [timestamp, messageId, patch] of [[0, 'm1', { text: 'a' }], [600, 'm1', { text: 'b' }], [601, 'm2', { text: 'c' }], [602, 'm2', { side: 'left' }]] as const) {
    h = historyReducer(h, { type: 'edit', timestamp, action: { type: 'update-message', messageId, patch } })
  }
  expect(h.past).toHaveLength(4)
})

it('separates rich payload subfields and treats message kind changes as structural', () => {
  const message = createMessage('self', { kind: 'payment' })
  let h = createHistory({ ...SAMPLE_DRAFT, messages: [message] })
  h = historyReducer(h, { type: 'edit', timestamp: 0, action: { type: 'update-message', messageId: message.id, patch: { payment: { ...message.payment!, amount: 5 } } } })
  h = historyReducer(h, { type: 'edit', timestamp: 1, action: { type: 'update-message', messageId: message.id, patch: { payment: { ...message.payment!, amount: 5, note: 'hello' } } } })
  expect(h.past).toHaveLength(2)
  h = historyReducer(h, { type: 'edit', timestamp: 2, action: { type: 'update-message', messageId: message.id, patch: messageKindPatch('link') } })
  h = historyReducer(h, { type: 'edit', timestamp: 3, action: { type: 'update-message', messageId: message.id, patch: messageKindPatch('location') } })
  expect(h.past).toHaveLength(4)
})

it('creates normalized messages and repairs capture endpoints on bulk and participant deletion', () => {
  const message = createMessage('self', { kind: 'payment' })
  expect(message.payment).toMatchObject({ mode: 'transfer', status: 'pending' })
  expect(messageKindPatch('contact').contactCard).toMatchObject({ name: '' })
  const draft = { ...SAMPLE_DRAFT, captureStartMessageId: 'm1', captureEndMessageId: 'm3' }
  expect(chatReducer(draft, { type: 'delete-messages', messageIds: ['m1'] }).captureStartMessageId).toBeNull()
  expect(chatReducer(draft, { type: 'remove-participant', participantId: 'p2' }).captureEndMessageId).toBeNull()
  const inserted = chatReducer(draft, { type: 'insert-message', afterId: 'm1', message })
  expect(inserted.messages[1].id).toBe(message.id)
})

it('retains newly saved, adopted and undo/redo media until ownership is released', async () => {
  const asset = await saveMediaAsset(new File(['hello'], 'a.png', { type: 'image/png' }))
  await cleanupUnreferencedMediaAssets(new Set())
  expect(await getMediaAsset(asset.id)).not.toBeNull()
  const draft = { ...SAMPLE_DRAFT, messages: [createMessage('self', { media: { assetId: asset.id, fileName: 'a.png', mimeType: 'image/png' }, kind: 'image' })] }
  adoptMediaAssets([asset.id])
  let h = historyReducer(createHistory(draft), { type: 'edit', timestamp: 0, action: { type: 'clear-messages' } })
  await cleanupUnreferencedMediaAssets(new Set(historyMessages(h).flatMap(m => m.media ? [m.media.assetId] : [])))
  h = historyReducer(h, { type: 'undo' })
  expect(h.present.messages[0].media?.assetId).toBe(asset.id)
  expect(await getMediaAsset(asset.id)).not.toBeNull()
  h = historyReducer(h, { type: 'redo' })
  for (let i = 0; i < 50; i++) h = historyReducer(h, { type: 'edit', timestamp: 1000 + i * 1000, action: { type: 'set-field', field: 'title', value: String(i) } })
  await cleanupUnreferencedMediaAssets(new Set(historyMessages(h).flatMap(m => m.media ? [m.media.assetId] : [])))
  expect(await getMediaAsset(asset.id)).toBeNull()
})

it('releases an abandoned upload without retaining it forever', async () => {
  const asset = await saveMediaAsset(new File(['x'], 'unused.txt'))
  releaseMediaAssets([asset.id])
  await cleanupUnreferencedMediaAssets(new Set())
  expect(await getMediaAsset(asset.id)).toBeNull()
})

it('undoes and redoes a batch message edit as one history step', () => {
  const messages = [
    createMessage('self', { id: 'm1', sentAt: '2026-12-31T23:58:00.000Z' }),
    createMessage('p2', { id: 'm2', sentAt: '2027-01-01T00:00:00.000Z' }),
    createMessage('p2', { id: 'm3', sentAt: '2027-01-01T00:02:00.000Z' }),
  ]
  let history = createHistory({ ...SAMPLE_DRAFT, messages })
  history = historyReducer(history, { type: 'edit', timestamp: 1, action: { type: 'batch-edit-messages', edit: { messageIds: ['m1', 'm3'], participantId: 'p3', firstSentAt: '2027-01-01T00:00:00.000Z' } } })
  expect(history.past).toHaveLength(1)
  expect(history.present.messages[2]).toMatchObject({ participantId: 'p3', sentAt: '2027-01-01T00:04:00.000Z' })
  history = historyReducer(history, { type: 'undo' })
  expect(history.present.messages[2]).toBe(messages[2])
  history = historyReducer(history, { type: 'redo' })
  expect(history.present.messages[2]).toMatchObject({ participantId: 'p3', sentAt: '2027-01-01T00:04:00.000Z' })
})

it('undoes a related draft field patch as one history step without serializing the draft', () => {
  let history = createHistory(SAMPLE_DRAFT)
  const stringify = vi.spyOn(JSON, 'stringify')
  history = historyReducer(history, {
    type: 'edit',
    timestamp: 1,
    action: { type: 'set-fields', patch: { outputWidth: 390, outputHeight: 844, exportScale: 2 } },
  })
  expect(stringify).not.toHaveBeenCalled()
  expect(history.past).toHaveLength(1)
  expect(history.present).toMatchObject({ outputWidth: 390, outputHeight: 844, exportScale: 2 })
  history = historyReducer(history, { type: 'undo' })
  expect(history.present).toMatchObject({
    outputWidth: SAMPLE_DRAFT.outputWidth,
    outputHeight: SAMPLE_DRAFT.outputHeight,
    exportScale: SAMPLE_DRAFT.exportScale,
  })
  stringify.mockRestore()
})
