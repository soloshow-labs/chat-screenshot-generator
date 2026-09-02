import type { MediaAttachment, Message, MessageKind, MessageQuote } from './chatTypes'
import { getVoiceDuration } from '../utils/voiceMessage'

export interface MessageDomainIssue {
  severity: 'error' | 'warning'
  code: 'missing-asset' | 'invalid-link' | 'payment-actor-mismatch' | 'incomplete-card'
  message: string
}

const MESSAGE_SUMMARY_LABELS: Record<MessageKind, string> = {
  text: '空消息', image: '图片', voice: '语音', call: '通话记录', recall: '撤回提示', system: '系统消息',
  link: '链接', video: '视频', file: '文件', payment: '转账', contact: '名片', location: '位置',
}

export function createMessageKindPatch(kind: MessageKind): Partial<Message> {
  return {
    kind, media: null, quote: null, voice: null, call: null, link: null, payment: null, contactCard: null, location: null, system: null,
    voiceUnread: false, showReeditLink: false,
    ...(kind === 'voice' ? { voice: { durationMode: 'manual' as const, durationSeconds: 5, transcript: '', showTranscript: false } } : {}),
    ...(kind === 'call' ? { call: { mode: 'voice' as const, status: 'duration' as const, durationSeconds: 0 } } : {}),
    ...(kind === 'link' ? { link: { title: '', description: '', url: '', thumbnailDataUrl: null } } : {}),
    ...(kind === 'payment' ? { payment: { mode: 'transfer' as const, amount: 0, note: '', status: 'pending' as const, role: 'original' as const, payerId: null, receiverId: null, payerName: '', receiverName: '', sourceMessageId: null } } : {}),
    ...(kind === 'contact' ? { contactCard: { name: '', avatarDataUrl: null, description: '' } } : {}),
    ...(kind === 'location' ? { location: { name: '', address: '', mapDataUrl: null } } : {}),
    ...(kind === 'system' ? { system: { subtype: 'invite' as const, actorId: null, actorName: '', targetId: null, targetName: '', detail: '' } } : {}),
  }
}

export function summarizeMessage(message: Message): string {
  const label = message.kind === 'payment' && message.payment?.mode === 'red-packet'
    ? '红包'
    : MESSAGE_SUMMARY_LABELS[message.kind]
  const detail = message.kind === 'payment' && message.payment ? `¥${message.payment.amount.toFixed(2)}`
    : message.system?.detail || message.system?.targetName || message.link?.title || message.contactCard?.name || message.location?.name || message.media?.fileName || ''
  const text = message.kind === 'text' || message.kind === 'recall' ? message.text.trim() : ''
  return text || `${label}${detail ? ` · ${detail}` : ''}`
}

export function createMessageQuoteSnapshot(message: Message, senderName: string): MessageQuote | null {
  if (message.kind === 'image' && !message.media) return null
  if (!['text', 'image', 'voice', 'file', 'video', 'contact'].includes(message.kind)) return null
  const voiceDuration = getVoiceDuration(message)
  const text = message.kind === 'text' ? message.text
    : message.kind === 'voice' ? voiceDuration > 0 ? `[语音] ${voiceDuration}秒` : '[语音] 时长未知'
      : message.kind === 'file' ? `[文件]${message.media?.fileName || '未命名文件'}`
        : message.kind === 'video' ? '[视频]'
          : message.kind === 'contact' ? `[个人名片]${message.contactCard?.name || '未命名联系人'}`
            : ''
  return {
    sourceMessageId: message.id,
    senderName,
    kind: message.kind === 'image' ? 'image' : 'text',
    text,
    media: message.kind === 'image' && message.media ? { ...message.media } : null,
  }
}

export function getMessageDomainAttachments(message: Message): MediaAttachment[] {
  return [message.media, message.quote?.media].filter((item): item is MediaAttachment => item != null)
}

export function validateMessageDomain(message: Message): MessageDomainIssue[] {
  const issues: MessageDomainIssue[] = []
  const add = (severity: MessageDomainIssue['severity'], code: MessageDomainIssue['code'], text: string) => issues.push({ severity, code, message: text })
  const requiresMedia = ['image', 'video', 'file'].includes(message.kind) || (message.kind === 'voice' && message.voice?.durationMode !== 'manual')
  if (requiresMedia && !message.media) add('error', 'missing-asset', '消息缺少可读取的媒体素材，请重新上传')

  let incomplete = false
  if (message.kind === 'link') {
    incomplete = !message.link?.title.trim()
    let validUrl = false
    try { validUrl = ['http:', 'https:'].includes(new URL(message.link?.url ?? '').protocol) } catch { /* invalid URL */ }
    if (!validUrl) add('warning', 'invalid-link', '链接 URL 缺失或无效')
  }
  if (message.kind === 'contact') incomplete = !message.contactCard?.name.trim()
  if (message.kind === 'location') incomplete = !message.location?.name.trim() || !message.location?.address.trim()
  if (message.kind === 'payment') incomplete = !message.payment || !Number.isFinite(message.payment.amount) || message.payment.amount < 0 || (message.payment.mode === 'transfer' && message.payment.amount <= 0)
  if (message.kind === 'payment' && message.payment) {
    const payment = message.payment
    const actorId = payment.role === 'receipt' || payment.role === 'notice' ? payment.receiverId : payment.payerId
    if (actorId != null && actorId !== message.participantId) add('warning', 'payment-actor-mismatch', '支付角色与消息发送人不一致，请核对付款人或收款人')
  }
  if (message.kind === 'file') incomplete = !message.media?.fileName.trim()
  if (message.kind === 'system') {
    const system = message.system
    incomplete = !system || (system.subtype === 'custom' ? !system.detail.trim()
      : system.subtype === 'rename' ? !system.actorName.trim() || !system.detail.trim()
        : !system.actorName.trim() || !system.targetName.trim())
  }
  if (incomplete) add('warning', 'incomplete-card', '卡片缺少关键内容')
  return issues
}
