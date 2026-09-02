import { expect, it } from 'vitest'
import { migrateChatDraft } from './draftStore'
import { SAMPLE_DRAFT } from '../app/sampleDraft'
import { createMessage } from '../app/messageFactory'

it('migrates legacy text, media and settings while preserving content', () => {
  const draft = migrateChatDraft({ ...SAMPLE_DRAFT, schemaVersion: 1, title: 'legacy', messages: [
    { ...SAMPLE_DRAFT.messages[0], kind: 'image', media: { assetId: 'a', fileName: 'a.png', mimeType: 'image/png', width: 20, height: 40 } },
  ] })
  expect(draft.schemaVersion).toBe(3)
  expect(draft.title).toBe('legacy')
  expect(draft.messages[0].media?.assetId).toBe('a')
  expect(draft.outputWidth).toBe(430)
  expect(migrateChatDraft({ ...SAMPLE_DRAFT, schemaVersion: 1 }).messages[0].text).toBe('姐妹们！')
})

it('migrates literal legacy long voice without truncating audio or hiding missing audio', () => {
  const legacyVoice = { id: 'old-voice', participantId: 'self', kind: 'voice', text: '', showReeditLink: false, media: { assetId: 'old-audio', fileName: 'long.mp3', mimeType: 'audio/mpeg', durationSeconds: 125.4 }, voiceUnread: true, call: null, side: 'auto', sentAt: '2026-08-27T10:00:00+08:00', timeVisibility: 'auto' }
  for (const schemaVersion of [1, 2]) {
    const migrated = migrateChatDraft({ ...SAMPLE_DRAFT, schemaVersion, messages: [legacyVoice] })
    expect(migrated.schemaVersion).toBe(3)
    expect(migrated.messages[0]).toMatchObject({ quote: null, voice: { durationMode: 'auto', durationSeconds: 5, transcript: '', showTranscript: false }, media: { durationSeconds: 125.4 } })
    expect(migrateChatDraft({ ...SAMPLE_DRAFT, schemaVersion, messages: [{ ...legacyVoice, media: null }] }).messages[0]).toMatchObject({ media: null, voice: { durationMode: 'auto' } })
  }
})

it('accepts schema3 defaults but rejects malformed or absent required quote and voice fields', () => {
  const voice = { durationMode: 'manual', durationSeconds: 5, transcript: '', showTranscript: false }
  const message = { ...SAMPLE_DRAFT.messages[0], kind: 'voice', quote: null, voice }
  expect(migrateChatDraft({ ...SAMPLE_DRAFT, schemaVersion: 3, messages: [message] }).messages[0].voice).toEqual(voice)
  for (const malformed of [null, undefined, { ...voice, durationMode: ['manual'] }, { ...voice, durationMode: 'bad' }, { ...voice, durationSeconds: 0 }, { ...voice, durationSeconds: 61 }, { ...voice, durationSeconds: 1.5 }, { ...voice, durationSeconds: NaN }, { ...voice, transcript: null }, { ...voice, showTranscript: 'false' }]) {
    expect(() => migrateChatDraft({ ...SAMPLE_DRAFT, schemaVersion: 3, messages: [{ ...message, voice: malformed }] })).toThrow()
  }
  expect(() => migrateChatDraft({ ...SAMPLE_DRAFT, schemaVersion: 3, messages: [{ ...message, quote: undefined }] })).toThrow()
  expect(() => migrateChatDraft({ ...SAMPLE_DRAFT, schemaVersion: 3, messages: [{ ...message, kind: 'text' }] })).toThrow()
})

it('rejects unsupported schema, malformed numeric fields and rich payloads', () => {
  expect(() => migrateChatDraft({ ...SAMPLE_DRAFT, schemaVersion: 99 })).toThrow(/版本|version/i)
  expect(() => migrateChatDraft({ ...SAMPLE_DRAFT, batteryPercent: NaN })).toThrow()
  for (const patch of [
    { kind: ['text'] },
    { kind: 'payment', payment: { mode: ['transfer'], amount: 1, note: '', status: 'pending' } },
    { kind: 'payment', payment: { mode: 'transfer', amount: -1, note: '', status: 'pending' } },
    { kind: 'link', link: { title: '', description: '', url: 'https://example.com', thumbnailDataUrl: 'javascript:alert(1)' } },
    { kind: 'location', location: { name: 42, address: '' } },
    { kind: 'file', media: { assetId: 'a', fileName: 'a', mimeType: '', sizeBytes: Infinity } },
  ]) expect(() => migrateChatDraft({ ...SAMPLE_DRAFT, messages: [{ ...SAMPLE_DRAFT.messages[0], ...patch }] })).toThrow()
})

it('roundtrips each normalized rich kind', () => {
  for (const kind of ['link', 'video', 'file', 'payment', 'contact', 'location'] as const) {
    const draft = migrateChatDraft({ ...SAMPLE_DRAFT, messages: [createMessage('self', { kind })] })
    expect(draft.messages[0].kind).toBe(kind)
  }
})

it('roundtrips structured system messages and delivery status while rejecting malformed values', () => {
  const system = createMessage('self', { kind: 'system', system: { subtype: 'invite', actorId: 'self', actorName: '小美', targetId: 'p2', targetName: '阿花', detail: '' } })
  const rejected = createMessage('self', { text: '失败', deliveryStatus: 'rejected' })
  const migrated = migrateChatDraft({ ...SAMPLE_DRAFT, messages: [system, rejected] })
  expect(migrated.messages[0].system).toEqual(system.system)
  expect(migrated.messages[1].deliveryStatus).toBe('rejected')
  for (const bad of [
    { ...system, system: { ...system.system!, subtype: 'html' } },
    { ...system, system: { ...system.system!, actorId: 3 } },
    { ...rejected, deliveryStatus: 'failed' },
  ]) expect(() => migrateChatDraft({ ...SAMPLE_DRAFT, messages: [bad] })).toThrow()
})

it('defaults absent wallpaper to null and rejects invalid wallpaper fields', () => {
  const withoutWallpaper = Object.fromEntries(Object.entries(SAMPLE_DRAFT).filter(([key]) => key !== 'wallpaper'))
  expect(migrateChatDraft(withoutWallpaper).wallpaper).toBeNull()
  expect(migrateChatDraft({ ...SAMPLE_DRAFT, wallpaper: { type: 'color', color: '#12abEF' } }).wallpaper).toEqual({ type: 'color', color: '#12abEF' })
  for (const wallpaper of [
    { type: 'color', color: 'red' },
    { type: 'color', color: '#abcd' },
    { type: 'image', media: { assetId: 'wall', fileName: 'wall.png', mimeType: 'text/plain', width: 430, height: 744 } },
    { type: 'image', media: { assetId: 'wall', fileName: 'wall.png', mimeType: 'image/png' } },
  ]) expect(() => migrateChatDraft({ ...SAMPLE_DRAFT, wallpaper })).toThrow()
})

it('defaults and validates input-bar state without changing the schema version', () => {
  const legacyShape = Object.fromEntries(Object.entries(SAMPLE_DRAFT).filter(([key]) => key !== 'inputBarMode' && key !== 'inputDraft'))
  expect(migrateChatDraft(legacyShape)).toMatchObject({ inputBarMode: 'text', inputDraft: '' })
  expect(migrateChatDraft({ ...SAMPLE_DRAFT, inputBarMode: 'voice', inputDraft: '保留草稿' })).toMatchObject({ inputBarMode: 'voice', inputDraft: '保留草稿' })
  for (const patch of [{ inputBarMode: 'camera' }, { inputDraft: 42 }]) {
    expect(() => migrateChatDraft({ ...SAMPLE_DRAFT, ...patch })).toThrow()
  }
})
