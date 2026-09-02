import { SAMPLE_DRAFT } from '../app/sampleDraft'
import type { CallRecord, ChatDraft, MediaAttachment, Message, Participant } from '../app/chatTypes'
import { createMessage } from '../app/messageFactory'
import { isPaymentPayload, validPaymentReferences } from './paymentValidation'

export const DRAFT_STORAGE_KEY = 'chat-screenshot-generator:draft:v1'

export interface DraftStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type SaveResult = { ok: true } | { ok: false; error: Error }

function cloneSampleDraft(): ChatDraft {
  return JSON.parse(JSON.stringify(SAMPLE_DRAFT)) as ChatDraft
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isParticipant(value: unknown): value is Participant {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && (value.avatarDataUrl === null || typeof value.avatarDataUrl === 'string')
    && typeof value.isSelf === 'boolean'
}

function isOptionalPositiveNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value) && value > 0)
}

function isImageDataUrl(value: unknown): boolean {
  return value === null || (typeof value === 'string' && /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))
}

function isRichPayloads(value: Record<string, unknown>): boolean {
  const { link, payment, contactCard, location } = value
  if (link != null && (!isRecord(link) || typeof link.title !== 'string' || typeof link.description !== 'string' || typeof link.url !== 'string' || !isImageDataUrl(link.thumbnailDataUrl))) return false
  if (payment != null && !isPaymentPayload(payment)) return false
  if (contactCard != null && (!isRecord(contactCard) || typeof contactCard.name !== 'string' || typeof contactCard.description !== 'string' || !isImageDataUrl(contactCard.avatarDataUrl))) return false
  if (location != null && (!isRecord(location) || typeof location.name !== 'string' || typeof location.address !== 'string' || (location.mapDataUrl !== undefined && !isImageDataUrl(location.mapDataUrl)))) return false
  return true
}

function isSystemPayload(value: unknown): boolean {
  return isRecord(value)
    && ['invite', 'remove', 'rename', 'tickle', 'custom'].includes(String(value.subtype))
    && (value.actorId === null || typeof value.actorId === 'string')
    && typeof value.actorName === 'string'
    && (value.targetId === null || typeof value.targetId === 'string')
    && typeof value.targetName === 'string'
    && typeof value.detail === 'string'
}

function isMediaAttachment(value: unknown): value is MediaAttachment {
  return isRecord(value)
    && typeof value.assetId === 'string'
    && typeof value.fileName === 'string'
    && typeof value.mimeType === 'string'
    && isOptionalPositiveNumber(value.width)
    && isOptionalPositiveNumber(value.height)
    && isOptionalPositiveNumber(value.durationSeconds)
    && (value.sizeBytes === undefined || (typeof value.sizeBytes === 'number' && Number.isSafeInteger(value.sizeBytes) && value.sizeBytes >= 0))
    && (value.expired === undefined || typeof value.expired === 'boolean')
    && (value.posterDataUrl === undefined || isImageDataUrl(value.posterDataUrl))
}

function isWallpaper(value: unknown): boolean {
  if (value === null) return true
  if (!isRecord(value)) return false
  if (value.type === 'color') return typeof value.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.color)
  return value.type === 'image'
    && isMediaAttachment(value.media)
    && /^image\/(?:png|jpeg|jpg|webp|gif)$/.test(value.media.mimeType)
    && value.media.width !== undefined
    && value.media.height !== undefined
}

function isCallRecord(value: unknown): value is CallRecord {
  return isRecord(value)
    && (value.mode === 'voice' || value.mode === 'video')
    && (value.status === 'duration' || value.status === 'cancelled' || value.status === 'missed' || value.status === 'unanswered')
    && typeof value.durationSeconds === 'number'
    && Number.isFinite(value.durationSeconds)
    && value.durationSeconds >= 0
}

function isVoicePayload(value: unknown): boolean {
  return isRecord(value)
    && (value.durationMode === 'auto' || value.durationMode === 'manual')
    && typeof value.durationSeconds === 'number' && Number.isInteger(value.durationSeconds)
    && value.durationSeconds >= 1 && value.durationSeconds <= 60
    && typeof value.transcript === 'string' && typeof value.showTranscript === 'boolean'
}

function isQuote(value: unknown): boolean {
  if (!isRecord(value) || (value.sourceMessageId !== null && typeof value.sourceMessageId !== 'string') || typeof value.senderName !== 'string' || typeof value.text !== 'string') return false
  if (value.kind === 'text') return value.media === null
  if (value.kind !== 'image' || value.text !== '' || !isMediaAttachment(value.media)) return false
  return value.media.assetId.trim().length > 0
    && /^image\/(?:png|jpeg|jpg|webp|gif)$/.test(value.media.mimeType)
    && value.media.width !== undefined && value.media.height !== undefined
}

function isMessage(value: unknown): value is Message {
  const validBase = isRecord(value)
    && typeof value.id === 'string'
    && typeof value.participantId === 'string'
    && typeof value.kind === 'string'
    && ['text', 'image', 'voice', 'call', 'recall', 'system', 'link', 'video', 'file', 'payment', 'contact', 'location'].includes(value.kind)
    && isRichPayloads(value)
    && (value.deliveryStatus === undefined || value.deliveryStatus === 'sent' || value.deliveryStatus === 'rejected')
    && (value.kind === 'system' ? isSystemPayload(value.system) : value.system == null)
    && (value.quote === null || (value.kind === 'text' && isQuote(value.quote)))
    && (value.kind === 'voice' ? isVoicePayload(value.voice) : value.voice === null)
    && typeof value.text === 'string'
    && typeof value.showReeditLink === 'boolean'
    && (value.media === null || isMediaAttachment(value.media))
    && typeof value.voiceUnread === 'boolean'
    && (value.call === null || isCallRecord(value.call))
    && (value.side === 'auto' || value.side === 'left' || value.side === 'right')
    && (value.timeVisibility === 'auto' || value.timeVisibility === 'show' || value.timeVisibility === 'hide')
    && typeof value.sentAt === 'string'
    && Number.isFinite(new Date(value.sentAt).getTime())
  if (!validBase) return false
  const media = value.media as MediaAttachment | null
  const call = value.call as CallRecord | null
  if (value.kind === 'image') {
    return call === null && (media === null || (media.width !== undefined && media.height !== undefined))
  }
  if (value.kind === 'voice') {
    return call === null && (media === null || media.durationSeconds !== undefined)
  }
  if (value.kind === 'call') return media === null && call !== null
  if (value.kind === 'video' || value.kind === 'file') return call === null
  return media === null && call === null
}

function withStatusBarDefaults(value: unknown): unknown {
  if (!isRecord(value) || (value.schemaVersion !== 1 && value.schemaVersion !== 2)) return value
  return {
    ...value,
    showSilentIcon: 'showSilentIcon' in value ? value.showSilentIcon : true,
    networkType: 'networkType' in value ? value.networkType : 'wifi',
    signalStrength: 'signalStrength' in value ? value.signalStrength : 4,
    outputMode: 'outputMode' in value ? value.outputMode : 'screen',
    captureStartMessageId: 'captureStartMessageId' in value ? value.captureStartMessageId : null,
    captureEndMessageId: 'captureEndMessageId' in value ? value.captureEndMessageId : null,
    screenScrollTop: 'screenScrollTop' in value ? value.screenScrollTop : 0,
    outputWidth: 'outputWidth' in value ? value.outputWidth : 430,
    outputHeight: 'outputHeight' in value ? value.outputHeight : 932,
    exportScale: 'exportScale' in value ? value.exportScale : 3,
    showHomeIndicator: 'showHomeIndicator' in value ? value.showHomeIndicator : true,
    messages: Array.isArray(value.messages)
      ? value.messages.map((message) => isRecord(message)
        ? {
            ...message,
            timeVisibility: 'timeVisibility' in message ? message.timeVisibility : 'auto',
            kind: 'kind' in message ? message.kind : 'text',
            showReeditLink: 'showReeditLink' in message ? message.showReeditLink : false,
            media: 'media' in message ? message.media : null,
            voiceUnread: 'voiceUnread' in message ? message.voiceUnread : false,
            call: 'call' in message ? message.call : null,
            quote: null,
            voice: message.kind === 'voice' ? { durationMode: 'auto', durationSeconds: 5, transcript: '', showTranscript: false } : null,
            deliveryStatus: 'deliveryStatus' in message ? message.deliveryStatus : 'sent',
            system: 'system' in message ? message.system : null,
          }
        : message)
      : value.messages,
  }
}

function withWallpaperDefault(value: unknown): unknown {
  if (!isRecord(value) || (value.schemaVersion !== 1 && value.schemaVersion !== 2 && value.schemaVersion !== 3)) return value
  return { ...value, wallpaper: 'wallpaper' in value ? value.wallpaper : null }
}

function withInputBarDefaults(value: unknown): unknown {
  if (!isRecord(value) || (value.schemaVersion !== 1 && value.schemaVersion !== 2 && value.schemaVersion !== 3)) return value
  return {
    ...value,
    inputBarMode: 'inputBarMode' in value ? value.inputBarMode : 'text',
    inputDraft: 'inputDraft' in value ? value.inputDraft : '',
  }
}

function withIosMicrostateDefaults(value: unknown): unknown {
  if (!isRecord(value) || (value.schemaVersion !== 1 && value.schemaVersion !== 2 && value.schemaVersion !== 3)) return value
  return {
    ...value,
    followSystemTime: 'followSystemTime' in value ? value.followSystemTime : false,
    batteryCharging: 'batteryCharging' in value ? value.batteryCharging : false,
    showDoNotDisturb: 'showDoNotDisturb' in value ? value.showDoNotDisturb : false,
    earpieceMode: 'earpieceMode' in value ? value.earpieceMode : false,
    chatUnreadCount: 'chatUnreadCount' in value ? value.chatUnreadCount : 0,
  }
}

export function isChatDraft(value: unknown): value is ChatDraft {
  if (!isRecord(value) || value.schemaVersion !== 3) return false
  if (value.conversationType !== 'direct' && value.conversationType !== 'group') return false
  if (value.groupMemberCount != null && (typeof value.groupMemberCount !== 'number' || !Number.isInteger(value.groupMemberCount) || value.groupMemberCount < 1 || value.groupMemberCount > 99999)) return false
  if (value.showGroupNicknames !== undefined && typeof value.showGroupNicknames !== 'boolean') return false
  if (value.theme !== 'light' && value.theme !== 'dark') return false
  if (value.timeDisplayMode !== 'smart' && value.timeDisplayMode !== 'hidden') return false
  if (!isWallpaper(value.wallpaper)) return false
  if (typeof value.title !== 'string' || typeof value.statusTime !== 'string') return false
  if (typeof value.showStatusBar !== 'boolean' || typeof value.showInputBar !== 'boolean') return false
  if (value.inputBarMode !== 'text' && value.inputBarMode !== 'voice') return false
  if (typeof value.inputDraft !== 'string') return false
  if (typeof value.showHomeIndicator !== 'boolean') return false
  if (typeof value.batteryPercent !== 'number' || !Number.isFinite(value.batteryPercent) || value.batteryPercent < 0 || value.batteryPercent > 100) return false
  if (typeof value.showSilentIcon !== 'boolean') return false
  if (typeof value.followSystemTime !== 'boolean' || typeof value.batteryCharging !== 'boolean' || typeof value.showDoNotDisturb !== 'boolean' || typeof value.earpieceMode !== 'boolean') return false
  if (typeof value.chatUnreadCount !== 'number' || !Number.isInteger(value.chatUnreadCount) || value.chatUnreadCount < 0 || value.chatUnreadCount > 999) return false
  if (value.networkType !== 'wifi' && value.networkType !== '5g') return false
  if (value.signalStrength !== 1 && value.signalStrength !== 2 && value.signalStrength !== 3 && value.signalStrength !== 4) return false
  if (value.outputMode !== 'screen' && value.outputMode !== 'long') return false
  if (value.captureStartMessageId !== null && typeof value.captureStartMessageId !== 'string') return false
  if (value.captureEndMessageId !== null && typeof value.captureEndMessageId !== 'string') return false
  if (typeof value.screenScrollTop !== 'number' || !Number.isFinite(value.screenScrollTop) || value.screenScrollTop < 0) return false
  if (typeof value.outputWidth !== 'number' || !Number.isInteger(value.outputWidth) || value.outputWidth < 320 || value.outputWidth > 1290) return false
  if (typeof value.outputHeight !== 'number' || !Number.isInteger(value.outputHeight) || value.outputHeight < 480 || value.outputHeight > 3000) return false
  if (value.exportScale !== 1 && value.exportScale !== 2 && value.exportScale !== 3 && value.exportScale !== 4) return false
  if (!Array.isArray(value.participants) || !value.participants.every(isParticipant)) return false
  if (value.participants.filter((participant) => participant.isSelf).length !== 1) return false
  if (!Array.isArray(value.messages) || !value.messages.every(isMessage)) return false

  const participantIds = new Set(value.participants.map((participant) => participant.id))
  if (participantIds.size !== value.participants.length) return false
  if (!value.messages.every((message) => participantIds.has(message.participantId))) return false
  if (!value.messages.every((message) => message.system == null || ((message.system.actorId === null || participantIds.has(message.system.actorId)) && (message.system.targetId === null || participantIds.has(message.system.targetId))))) return false
  if (!validPaymentReferences(value.messages, participantIds)) return false
  const messageIds = new Set(value.messages.map((message) => message.id))
  if (messageIds.size !== value.messages.length) return false
  if (!value.messages.every(message => message.quote === null || message.quote.sourceMessageId === null || (message.quote.sourceMessageId !== message.id && messageIds.has(message.quote.sourceMessageId)))) return false
  if (value.captureStartMessageId !== null && !messageIds.has(value.captureStartMessageId)) return false
  return value.captureEndMessageId === null || messageIds.has(value.captureEndMessageId)
}

export function loadDraft(storage: DraftStorage): ChatDraft {
  const raw = storage.getItem(DRAFT_STORAGE_KEY)
  if (raw === null) return cloneSampleDraft()
  return migrateChatDraft(JSON.parse(raw))
}

export function migrateChatDraft(value: unknown): ChatDraft {
  if (!isRecord(value)) throw new Error('草稿必须是一个对象')
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2 && value.schemaVersion !== 3) throw new Error('不支持的草稿版本')
  const candidate = { ...(withIosMicrostateDefaults(withInputBarDefaults(withWallpaperDefault(withStatusBarDefaults(value)))) as Record<string, unknown>), schemaVersion: 3 }
  if (!isChatDraft(candidate)) throw new Error('草稿格式无效：请检查成员、消息、媒体和设置字段')
  return { ...candidate, messages: candidate.messages.map(message => createMessage(message.participantId, message)) }
}

export function saveDraft(storage: DraftStorage, draft: ChatDraft): SaveResult {
  try {
    if (!isChatDraft(draft)) throw new Error('草稿包含无效数据，已保留上一次有效保存')
    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error('草稿保存失败') }
  }
}

export function resetDraft(storage: DraftStorage): void {
  storage.removeItem(DRAFT_STORAGE_KEY)
}
