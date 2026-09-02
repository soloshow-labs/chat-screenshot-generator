import type { ChatDraft, MessageKind, PaymentPayload, SystemMessagePayload, VoicePayload } from '../app/chatTypes'
import { createMessage } from '../app/messageFactory'
import { createOriginalPayment } from './paymentMessage'

export interface ChatScriptEntry {
  line?: number
  name: string
  kind?: MessageKind
  text: string
  time?: string
  voice?: VoicePayload
  payment?: Pick<PaymentPayload, 'mode' | 'amount' | 'note' | 'status'>
  system?: SystemMessagePayload
}
export interface ChatScriptOptions { mode: 'append' | 'insert' | 'replace'; afterId?: string; startTime: string | Date; intervalMinutes: number }

const TIME_LINE = /^(?:\[时间\s+)?((?:\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+)?\d{1,2}:\d{2})(?:\])?$/
const VOICE_MARKER = /^\[语音\s+(\d+)(?:s|秒)?\]\s*(.*)$/i
const LEGACY_VOICE_MARKER = /^\[语音\]\s*(\d+)(?:\s*[:：]\s*(.*))?$/
const PAYMENT_MARKER = /^\[(转账|红包)(?:\s+([^\]]+))?\]\s*(.*)$/
const SELF_ALIASES = new Set(['我', '自己', '本人', 'me', 'myself'])
const SYSTEM_LINE = /^\[系统(?:\s+(邀请|移出|改群名|拍一拍))?\]\s*(.*)$/

function parseSystemLine(line: number, raw: string): { entry?: ChatScriptEntry; error?: string } {
  const match = raw.match(SYSTEM_LINE)
  if (!match) return {}
  const action = match[1]
  const content = match[2].trim()
  if (!action) {
    if (!content) return { error: '自定义系统提示不能为空' }
    return { entry: { line, name: '我', kind: 'system', text: '', system: { subtype: 'custom', actorId: null, actorName: '', targetId: null, targetName: '', detail: content } } }
  }
  const parts = content.split('|').map(part => part.trim())
  if (parts.length !== 2 || parts.some(part => !part)) return { error: `系统${action}格式需要两个字段，并用 | 分隔` }
  const subtype = action === '邀请' ? 'invite' : action === '移出' ? 'remove' : action === '改群名' ? 'rename' : 'tickle'
  return { entry: { line, name: '我', kind: 'system', text: '', system: {
    subtype, actorId: null, actorName: parts[0], targetId: null,
    targetName: subtype === 'rename' ? '' : parts[1], detail: subtype === 'rename' ? parts[1] : '',
  } } }
}

function richEntry(line: number, name: string, rawContent: string): { entry?: ChatScriptEntry; error?: string } {
  if (rawContent.startsWith('\\[')) return { entry: { line, name, kind: 'text', text: rawContent.slice(1) } }
  if (rawContent === '[图片]') return { entry: { line, name, kind: 'image', text: '' } }
  if (rawContent.startsWith('[图片]')) return { error: '图片脚本只支持本地占位 [图片]，请导入后上传图片' }

  const voice = rawContent.match(VOICE_MARKER) ?? rawContent.match(LEGACY_VOICE_MARKER)
  if (voice) {
    const durationSeconds = Number(voice[1])
    if (!Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 60) return { error: '语音秒数必须是 1–60 的整数' }
    const transcript = voice[2]?.trim() ?? ''
    return { entry: { line, name, kind: 'voice', text: '', voice: { durationMode: 'manual', durationSeconds, transcript, showTranscript: Boolean(transcript) } } }
  }
  if (rawContent.startsWith('[语音')) return { error: '语音格式应为 [语音 8s] 转文字，秒数范围为 1–60' }

  const payment = rawContent.match(PAYMENT_MARKER)
  if (payment) {
    const mode = payment[1] === '转账' ? 'transfer' : 'red-packet'
    const amountInTag = payment[2]?.trim()
    let amountText = amountInTag ?? ''
    let note = payment[3].trim()
    if (!amountInTag && mode === 'transfer') {
      const separator = note.search(/[:：]/)
      amountText = (separator < 0 ? note : note.slice(0, separator)).trim()
      note = separator < 0 ? '' : note.slice(separator + 1).trim()
    }
    const amount = amountText ? Number(amountText.replace(/^¥\s*/, '')) : 0
    if (!Number.isFinite(amount) || amount < 0 || (mode === 'transfer' && amount <= 0)) return { error: mode === 'transfer' ? '转账金额必须大于 0' : '红包金额必须是不小于 0 的数字' }
    return { entry: { line, name, kind: 'payment', text: '', payment: { mode, amount, note, status: 'pending' } } }
  }
  if (rawContent.startsWith('[转账') || rawContent.startsWith('[红包')) return { error: '支付格式应为 [转账 52.00] 备注或 [红包 88.00] 祝福语' }
  return { entry: { line, name, kind: 'text', text: rawContent } }
}

export function parseChatScript(text: string): { entries: ChatScriptEntry[]; errors: { line: number; message: string }[] } {
  const entries: ChatScriptEntry[] = []
  const errors: { line: number; message: string }[] = []
  let pendingTime: { value: string; line: number } | null = null
  for (const [index, raw] of text.split(/\r\n|\n|\r/).entries()) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('[系统')) {
      const parsed = parseSystemLine(index + 1, line)
      if (parsed.error) errors.push({ line: index + 1, message: parsed.error })
      else if (parsed.entry) {
        if (pendingTime) parsed.entry.time = pendingTime.value
        entries.push(parsed.entry)
        pendingTime = null
      }
      continue
    }
    if (/^\d{1,2}:\d{2}$/.test(line)) {
      const [hours, minutes] = line.split(':').map(Number)
      if (hours > 23 || minutes > 59) {
        errors.push({ line: index + 1, message: '时间必须是 00:00–23:59' })
        continue
      }
    }
    const time = line.match(TIME_LINE)
    if (time) {
      if (pendingTime) errors.push({ line: pendingTime.line, message: '此时间后没有消息' })
      pendingTime = { value: time[1], line: index + 1 }
      continue
    }
    const colon = line.search(/[:：]/)
    if (colon > 0) {
      const parsed = richEntry(index + 1, line.slice(0, colon).trim(), line.slice(colon + 1).trim())
      if (parsed.error) errors.push({ line: index + 1, message: parsed.error })
      else if (parsed.entry) {
        if (pendingTime) parsed.entry.time = pendingTime.value
        entries.push(parsed.entry)
        pendingTime = null
      }
    }
    else if (entries.length && entries.at(-1)?.kind === 'text') entries[entries.length - 1].text += `\n${line}`
    else errors.push({ line: index + 1, message: '此行没有发送人，且没有可接续的上一条消息' })
  }
  if (pendingTime) errors.push({ line: pendingTime.line, message: '此时间后没有消息' })
  return { entries, errors }
}

function resolveEntryTime(entry: ChatScriptEntry, fallbackMs: number): number {
  if (!entry.time) return fallbackMs
  if (/^\d{1,2}:\d{2}$/.test(entry.time)) {
    const [hours, minutes] = entry.time.split(':').map(Number)
    if (hours > 23 || minutes > 59) throw new Error(`第 ${entry.line ?? '?'} 行的时间无效`)
    const resolved = new Date(fallbackMs)
    resolved.setHours(hours, minutes, 0, 0)
    return resolved.getTime()
  }
  const normalized = entry.time.replace(/\//g, '-')
  const resolved = new Date(normalized.replace(' ', 'T'))
  if (!Number.isFinite(resolved.getTime())) throw new Error(`第 ${entry.line ?? '?'} 行的时间无效`)
  return resolved.getTime()
}

/** Pure transform. Empty entries are a no-op, including replace mode. */
export function applyChatScript(draft: ChatDraft, entries: ChatScriptEntry[], options: ChatScriptOptions): ChatDraft {
  const { mode, afterId, intervalMinutes } = options
  const start = new Date(options.startTime).getTime()
  if (!Number.isFinite(start)) throw new Error('起始时间无效')
  if (!Number.isFinite(intervalMinutes) || intervalMinutes < 0 || intervalMinutes > 1440) throw new Error('消息间隔必须在 0–1440 分钟之间')
  if (!['append', 'insert', 'replace'].includes(mode)) throw new Error('不支持的脚本应用方式')
  const insertIndex = draft.messages.findIndex(message => message.id === afterId)
  if (mode === 'insert' && insertIndex < 0) throw new Error('插入位置不存在，请重新选择消息')
  if (entries.some(entry => !entry.name.trim())) throw new Error('脚本发送人不能为空')
  if (!entries.length) return draft
  const participants = draft.participants.map(participant => ({ ...participant }))
  const ensureParticipant = (name: string) => {
    if (!name) return undefined
    const selfAlias = SELF_ALIASES.has(name.toLowerCase())
    let participant = selfAlias ? participants.find(candidate => candidate.isSelf) : participants.find(candidate => candidate.name.trim() === name.trim())
    if (!participant) {
      participant = { id: crypto.randomUUID(), name: name.trim(), avatarDataUrl: null, isSelf: participants.length === 0 }
      participants.push(participant)
    }
    return participant
  }
  let nextTime = start
  const messages = entries.map((entry) => {
    const name = entry.name.trim()
    const participant = ensureParticipant(name)!
    const sentAtMs = resolveEntryTime(entry, nextTime)
    if (!Number.isFinite(new Date(sentAtMs).getTime())) throw new Error('生成的消息时间超出有效范围')
    nextTime = sentAtMs + intervalMinutes * 60_000
    const actor = entry.system ? ensureParticipant(entry.system.actorName) : undefined
    const target = entry.system ? ensureParticipant(entry.system.targetName) : undefined
    const message = createMessage(participant.id, {
      kind: entry.kind ?? 'text',
      text: entry.text,
      sentAt: new Date(sentAtMs).toISOString(),
      ...(entry.voice ? { voice: entry.voice } : {}),
      ...(entry.payment ? { payment: entry.payment as PaymentPayload } : {}),
      ...(entry.system ? { system: {
        ...entry.system,
        actorId: actor?.id ?? null,
        actorName: actor?.name ?? entry.system.actorName,
        targetId: target?.id ?? null,
        targetName: target?.name ?? entry.system.targetName,
      } } : {}),
    })
    return message
  })
  messages.forEach(message => {
    if (message.kind === 'payment' && message.payment) message.payment = createOriginalPayment(message.payment, message.participantId, participants, participants.length > 2 ? 'group' : draft.conversationType)
  })
  return {
    ...draft, participants, conversationType: participants.length > 2 ? 'group' : draft.conversationType,
    messages: mode === 'replace' ? messages : mode === 'insert'
      ? [...draft.messages.slice(0, insertIndex + 1), ...messages, ...draft.messages.slice(insertIndex + 1)]
      : [...draft.messages, ...messages],
    ...(mode === 'replace' ? { captureStartMessageId: null, captureEndMessageId: null, screenScrollTop: 0 } : {}),
  }
}
