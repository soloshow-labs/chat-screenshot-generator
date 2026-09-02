import { describe, expect, it } from 'vitest'
import { SAMPLE_DRAFT } from '../app/sampleDraft'
import { DRAFT_STORAGE_KEY, loadDraft, resetDraft, saveDraft, type DraftStorage } from './draftStore'

class MemoryStorage implements DraftStorage {
  private values = new Map<string, string>()
  failWrites = false

  constructor(initial: Record<string, string> = {}) {
    Object.entries(initial).forEach(([key, value]) => this.values.set(key, value))
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    if (this.failWrites) throw new DOMException('quota exceeded', 'QuotaExceededError')
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }
}

describe('draftStore', () => {
  it('refuses a non-roundtrippable draft instead of overwriting the last saved project', () => {
    const storage = new MemoryStorage()
    expect(saveDraft(storage, { ...SAMPLE_DRAFT, title: '最后有效项目' }).ok).toBe(true)
    const invalid = { ...SAMPLE_DRAFT, messages: [{ ...SAMPLE_DRAFT.messages[0], kind: 'call' as const, call: { mode: 'voice' as const, status: 'duration' as const, durationSeconds: Infinity } }] }
    expect(saveDraft(storage, invalid).ok).toBe(false)
    expect(loadDraft(storage).title).toBe('最后有效项目')
  })
  it('loads a valid persisted draft', () => {
    const persisted = { ...SAMPLE_DRAFT, title: '已保存' }
    const storage = new MemoryStorage({ ['chat-screenshot-generator:draft:v1']: JSON.stringify(persisted) })
    expect(loadDraft(storage).title).toBe('已保存')
  })

  it('adds disabled iOS microstate defaults to an older schema-3 draft without changing versions', () => {
    const stored = { ...SAMPLE_DRAFT } as Record<string, unknown>
    delete stored.followSystemTime
    delete stored.batteryCharging
    delete stored.showDoNotDisturb
    delete stored.earpieceMode
    delete stored.chatUnreadCount
    const storage = new MemoryStorage({ [DRAFT_STORAGE_KEY]: JSON.stringify(stored) })
    expect(loadDraft(storage)).toMatchObject({
      schemaVersion: 3,
      followSystemTime: false,
      batteryCharging: false,
      showDoNotDisturb: false,
      earpieceMode: false,
      chatUnreadCount: 0,
    })
  })

  it('adds status-bar defaults to older v1 drafts', () => {
    const legacyDraft = { ...SAMPLE_DRAFT, schemaVersion: 1 } as Record<string, unknown>
    delete legacyDraft.showSilentIcon
    delete legacyDraft.networkType
    delete legacyDraft.signalStrength
    delete legacyDraft.outputMode
    delete legacyDraft.showHomeIndicator
    delete legacyDraft.captureStartMessageId
    delete legacyDraft.captureEndMessageId
    delete legacyDraft.screenScrollTop
    delete legacyDraft.outputWidth
    delete legacyDraft.outputHeight
    delete legacyDraft.exportScale
    legacyDraft.messages = SAMPLE_DRAFT.messages.map((message) => {
      const legacyMessage = { ...message } as Record<string, unknown>
      delete legacyMessage.timeVisibility
      delete legacyMessage.kind
      delete legacyMessage.showReeditLink
      delete legacyMessage.media
      delete legacyMessage.voiceUnread
      delete legacyMessage.call
      return legacyMessage
    })
    const storage = new MemoryStorage({ [DRAFT_STORAGE_KEY]: JSON.stringify(legacyDraft) })

    expect(loadDraft(storage)).toMatchObject({
      showSilentIcon: true,
      networkType: 'wifi',
      signalStrength: 4,
      outputMode: 'screen',
      showHomeIndicator: true,
      captureStartMessageId: null,
      captureEndMessageId: null,
      screenScrollTop: 0,
      outputWidth: 430,
      outputHeight: 932,
      exportScale: 3,
    })
    expect(loadDraft(storage).messages.every((message) => message.timeVisibility === 'auto')).toBe(true)
    expect(loadDraft(storage).messages.every((message) => message.kind === 'text')).toBe(true)
    expect(loadDraft(storage).messages.every((message) => message.showReeditLink === false)).toBe(true)
    expect(loadDraft(storage).messages.every((message) => message.media === null)).toBe(true)
    expect(loadDraft(storage).messages.every((message) => message.voiceUnread === false)).toBe(true)
    expect(loadDraft(storage).messages.every((message) => message.call === null)).toBe(true)
  })

  it('loads valid image voice and call messages', () => {
    const messages = [
      {
        ...SAMPLE_DRAFT.messages[0],
        id: 'image',
        kind: 'image',
        media: { assetId: 'asset-image', fileName: 'photo.png', mimeType: 'image/png', width: 800, height: 600 },
        voiceUnread: false,
        call: null,
      },
      {
        ...SAMPLE_DRAFT.messages[0],
        id: 'voice',
        kind: 'voice',
        media: { assetId: 'asset-voice', fileName: 'voice.wav', mimeType: 'audio/wav', durationSeconds: 3.2 },
        voiceUnread: true,
        call: null,
      },
      {
        ...SAMPLE_DRAFT.messages[0],
        id: 'call',
        kind: 'call',
        media: null,
        voiceUnread: false,
        call: { mode: 'video', status: 'missed', durationSeconds: 0 },
      },
    ]
    const persisted = { ...SAMPLE_DRAFT, schemaVersion: 2, messages }
    const storage = new MemoryStorage({ [DRAFT_STORAGE_KEY]: JSON.stringify(persisted) })
    expect(loadDraft(storage).messages.map((message) => message.kind)).toEqual(['image', 'voice', 'call'])
  })

  it('preserves image and voice messages while their upload is still empty', () => {
    const messages = [
      {
        ...SAMPLE_DRAFT.messages[0],
        id: 'empty-image',
        kind: 'image',
        text: '',
        media: null,
        voiceUnread: false,
        call: null,
      },
      {
        ...SAMPLE_DRAFT.messages[0],
        id: 'empty-voice',
        kind: 'voice',
        text: '',
        media: null,
        voiceUnread: false,
        call: null,
      },
    ]
    const persisted = { ...SAMPLE_DRAFT, schemaVersion: 2, title: '未完成上传', messages }
    const storage = new MemoryStorage({ [DRAFT_STORAGE_KEY]: JSON.stringify(persisted) })

    const loaded = loadDraft(storage)

    expect(loaded.title).toBe('未完成上传')
    expect(loaded.messages.map((message) => [message.kind, message.media])).toEqual([
      ['image', null],
      ['voice', null],
    ])
  })

  it('rejects media messages with malformed type-specific metadata', () => {
    const invalid = {
      ...SAMPLE_DRAFT,
      messages: [{
        ...SAMPLE_DRAFT.messages[0],
        kind: 'voice',
        media: { assetId: 'asset', fileName: 'voice.wav', mimeType: 'audio/wav', durationSeconds: -1 },
        voiceUnread: false,
        call: null,
      }],
    }
    const storage = new MemoryStorage({ [DRAFT_STORAGE_KEY]: JSON.stringify(invalid) })
    expect(() => loadDraft(storage)).toThrow()
  })

  it('rejects invalid capture geometry', () => {
    const invalid = { ...SAMPLE_DRAFT, outputWidth: 200, exportScale: 5 }
    const storage = new MemoryStorage({ [DRAFT_STORAGE_KEY]: JSON.stringify(invalid) })
    expect(() => loadDraft(storage)).toThrow()
  })

  it('rejects a recalled message with malformed recall settings', () => {
    const invalid = {
      ...SAMPLE_DRAFT,
      messages: [{
        ...SAMPLE_DRAFT.messages[0],
        kind: 'recall',
        showReeditLink: 'yes',
      }],
    }
    const storage = new MemoryStorage({ [DRAFT_STORAGE_KEY]: JSON.stringify(invalid) })
    expect(() => loadDraft(storage)).toThrow()
  })

  it('surfaces invalid persisted data and only creates fresh samples when storage is empty', () => {
    const storage = new MemoryStorage({ [DRAFT_STORAGE_KEY]: '{"schemaVersion":99}' })
    expect(() => loadDraft(storage)).toThrow()
    const first = loadDraft(new MemoryStorage())
    first.title = '被修改'
    expect(loadDraft(new MemoryStorage()).title).toBe(SAMPLE_DRAFT.title)
  })

  it('rejects drafts without exactly one self participant', () => {
    const invalid = {
      ...SAMPLE_DRAFT,
      participants: SAMPLE_DRAFT.participants.map((participant) => ({ ...participant, isSelf: false })),
    }
    const storage = new MemoryStorage({ [DRAFT_STORAGE_KEY]: JSON.stringify(invalid) })
    expect(() => loadDraft(storage)).toThrow()
  })

  it('saves valid drafts and reports quota failures', () => {
    const storage = new MemoryStorage()
    expect(saveDraft(storage, SAMPLE_DRAFT)).toEqual({ ok: true })
    expect(JSON.parse(storage.getItem('chat-screenshot-generator:draft:v1')!).title).toBe(SAMPLE_DRAFT.title)

    storage.failWrites = true
    const result = saveDraft(storage, SAMPLE_DRAFT)
    expect(result.ok).toBe(false)
  })

  it('removes the persisted draft on reset', () => {
    const storage = new MemoryStorage({ ['chat-screenshot-generator:draft:v1']: JSON.stringify(SAMPLE_DRAFT) })
    resetDraft(storage)
    expect(storage.getItem('chat-screenshot-generator:draft:v1')).toBeNull()
  })
})
