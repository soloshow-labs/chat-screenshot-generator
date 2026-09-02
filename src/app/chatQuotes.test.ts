import { expect, it } from 'vitest'
import { SAMPLE_DRAFT } from './sampleDraft'
import { createMessage } from './messageFactory'
import { chatReducer } from './chatReducer'
import { createHistory, historyReducer } from './chatHistory'
import type { MessageQuote } from './chatTypes'

const quote: MessageQuote = { sourceMessageId: 'source', senderName: '小明', kind: 'image', text: '', media: { assetId: 'image', fileName: 'old.png', mimeType: 'image/png', width: 20, height: 30 } }
const source = createMessage('p2', { id: 'source', text: '旧内容' })
const reply = createMessage('self', { id: 'reply', text: '回复', quote })
const draft = { ...SAMPLE_DRAFT, messages: [source, reply] }

it('detaches removed source IDs without changing snapshot metadata, including member removal', () => {
  for (const action of [{ type: 'delete-message', messageId: source.id }, { type: 'delete-messages', messageIds: [source.id] }, { type: 'remove-participant', participantId: 'p2' }] as const) {
    const next = chatReducer(draft, action.type === 'delete-messages' ? { ...action, messageIds: [...action.messageIds] } : action)
    expect(next.messages[0].quote).toEqual({ ...quote, sourceMessageId: null })
    expect(reply.quote?.sourceMessageId).toBe('source')
  }
})

it('keeps snapshot when source is edited, reassigned, or sender renamed', () => {
  let next = chatReducer(draft, { type: 'update-message', messageId: 'source', patch: { text: '新内容', participantId: 'self' } })
  next = chatReducer(next, { type: 'update-participant', participantId: 'p2', patch: { name: '新名字' } })
  expect(next.messages[1].quote).toEqual(quote)
  next = chatReducer(draft, { type: 'remove-participant', participantId: 'p2', replacementId: 'self' })
  expect(next.messages[1].quote).toEqual(quote)
})

it('duplicates nested payloads independently and clears incompatible quote/voice on type change', () => {
  const next = chatReducer(draft, { type: 'duplicate-message', messageId: 'reply', newId: 'copy' })
  expect(next.messages[2].quote).not.toBe(reply.quote)
  expect(next.messages[2].quote?.media).not.toBe(reply.quote?.media)
  const voice = chatReducer(draft, { type: 'update-message', messageId: 'reply', patch: { kind: 'voice' } }).messages[1]
  expect(voice).toMatchObject({ quote: null, voice: { durationMode: 'manual', durationSeconds: 5 } })
  const text = chatReducer({ ...draft, messages: [voice] }, { type: 'update-message', messageId: 'reply', patch: { kind: 'text' } }).messages[0]
  expect(text.voice).toBeNull()
})

it('keeps quote, emoji and crop edits as independent history operations within 600ms', () => {
  let history = createHistory(draft)
  for (const [index, sourceMessageId] of ['source', null, 'source'].entries()) history = historyReducer(history, { type: 'edit', timestamp: index * 100, action: { type: 'update-message', messageId: 'reply', patch: { quote: { ...quote, sourceMessageId } } } })
  expect(history.past).toHaveLength(2)
  for (const [index, text] of ['[微笑]', '[微笑][强]'].entries()) history = historyReducer(history, { type: 'edit', timestamp: 300 + index * 100, action: { type: 'update-message', messageId: 'reply', patch: { text }, separateHistory: true } })
  expect(history.past).toHaveLength(4)
  for (const [index, avatarDataUrl] of ['data:image/png;base64,AA==', 'data:image/png;base64,AQ=='].entries()) history = historyReducer(history, { type: 'edit', timestamp: 500 + index * 50, action: { type: 'update-participant', participantId: 'self', patch: { avatarDataUrl } } })
  expect(history.past).toHaveLength(6)
})

it('coalesces ordinary transcript typing but isolates voice display structure changes', () => {
  let history = createHistory({ ...SAMPLE_DRAFT, messages: [createMessage('self', { id: 'voice', kind: 'voice' })] })
  for (const [index, transcript] of ['一', '一句'].entries()) history = historyReducer(history, { type: 'edit', timestamp: index * 100, action: { type: 'update-message', messageId: 'voice', patch: { voice: { ...history.present.messages[0].voice!, transcript } } } })
  expect(history.past).toHaveLength(1)
  for (const [index, showTranscript] of [true, false].entries()) history = historyReducer(history, { type: 'edit', timestamp: 200 + index * 100, action: { type: 'update-message', messageId: 'voice', patch: { voice: { ...history.present.messages[0].voice!, showTranscript } } } })
  expect(history.past).toHaveLength(3)
})
