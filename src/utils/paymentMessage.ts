import type { ChatDraft, ConversationType, PaymentPayload, Participant } from '../app/chatTypes'
import { createMessage } from '../app/messageFactory'

export interface PaymentResponseRequest {
  messageId: string
  newId: string
  outcome: 'received' | 'refunded'
  receiverId: string
  sentAt: string
}

export type PaymentContext = Pick<ChatDraft, 'messages' | 'participants' | 'conversationType'>

function participantName(participant: Participant | undefined, fallback = ''): string {
  return participant?.name ?? fallback
}

function isOriginal(payment: PaymentPayload): boolean {
  return payment.role === undefined || payment.role === 'original'
}

function safeId(value: string | null | undefined, ids: Map<string, string>): string | null | undefined {
  if (value === null || value === undefined) return value
  return ids.get(value) ?? null
}

export function createOriginalPayment(payment: PaymentPayload, senderId: string, participants: Participant[], conversationType: ConversationType): PaymentPayload {
  const payer = participants.find(participant => participant.id === senderId)
  const receiver = conversationType === 'direct' && participants.length === 2
    ? participants.find(participant => participant.id !== senderId)
    : undefined
  return {
    ...payment,
    role: 'original',
    payerId: payer?.id ?? null,
    payerName: participantName(payer),
    receiverId: receiver?.id ?? null,
    receiverName: participantName(receiver),
    sourceMessageId: null,
  }
}

export function paymentResponseError(draft: PaymentContext, request: PaymentResponseRequest): string | null {
  const source = draft.messages.find(message => message.id === request.messageId)
  const payment = source?.kind === 'payment' ? source.payment : null
  if (!source || !payment || !isOriginal(payment)) return '只能回应原始支付消息'
  if (payment.status !== 'pending') return '该支付已处理'
  if (!request.newId.trim() || draft.messages.some(message => message.id === request.newId)) return '回应消息 ID 无效或已使用'
  if (!Number.isFinite(new Date(request.sentAt).getTime())) return '回应时间无效'
  if (request.outcome !== 'received' && request.outcome !== 'refunded') return '回应结果无效'
  if (payment.mode === 'red-packet' && request.outcome !== 'received') return '红包只能领取'
  const payer = payment.payerId == null ? undefined : draft.participants.find(participant => participant.id === payment.payerId)
  const receiver = payment.receiverId == null ? undefined : draft.participants.find(participant => participant.id === payment.receiverId)
  if (!payer || payer.id !== source.participantId) return '付款人必须是当前发送人'
  if (!receiver || receiver.id !== request.receiverId || receiver.id === payer.id) return '收款人无效'
  if (draft.messages.some(message => message.kind === 'payment' && (message.payment?.role === 'receipt' || message.payment?.role === 'notice') && message.payment.sourceMessageId === source.id)) return '该支付已有回应'
  return null
}

export function respondToPayment(draft: ChatDraft, request: PaymentResponseRequest): ChatDraft {
  if (paymentResponseError(draft, request)) return draft
  const sourceIndex = draft.messages.findIndex(message => message.id === request.messageId)
  const source = draft.messages[sourceIndex]
  const payment = source.payment!
  const payer = draft.participants.find(participant => participant.id === payment.payerId)
  const receiver = draft.participants.find(participant => participant.id === request.receiverId)!
  const original: PaymentPayload = {
    ...payment,
    role: 'original',
    payerId: payer!.id,
    receiverId: receiver.id,
    payerName: payment.payerName ?? participantName(payer),
    receiverName: payment.receiverName ?? participantName(receiver),
    sourceMessageId: null,
    status: request.outcome,
  }
  const response: PaymentPayload = {
    ...original,
    role: payment.mode === 'transfer' ? 'receipt' : 'notice',
    status: request.outcome,
    sourceMessageId: source.id,
  }
  const responseMessage = createMessage(receiver.id, {
    id: request.newId,
    kind: 'payment',
    payment: response,
    side: 'auto',
    sentAt: request.sentAt,
    timeVisibility: 'auto',
  })
  const updatedSource = { ...source, payment: original }
  return {
    ...draft,
    messages: [...draft.messages.slice(0, sourceIndex), updatedSource, responseMessage, ...draft.messages.slice(sourceIndex + 1)],
  }
}

function validSource(message: ChatDraft['messages'][number], payment: PaymentPayload, messages: Map<string, ChatDraft['messages'][number]>): boolean {
  if (payment.sourceMessageId == null) return true
  const source = messages.get(payment.sourceMessageId)
  if (!source || source.id === message.id || source.kind !== 'payment' || !source.payment || !isOriginal(source.payment)) return false
  return payment.role === 'receipt'
    ? source.payment.mode === 'transfer'
    : payment.role === 'notice'
      ? source.payment.mode === 'red-packet'
      : true
}

export function reconcilePaymentReferences(draft: ChatDraft): ChatDraft {
  const participants = new Set(draft.participants.map(participant => participant.id))
  const messages = new Map(draft.messages.map(message => [message.id, message]))
  let changed = false
  const nextMessages = draft.messages.map(message => {
    if (message.kind !== 'payment' || !message.payment) return message
    const payment = message.payment
    const patch: Partial<PaymentPayload> = {}
    if (payment.payerId != null && !participants.has(payment.payerId)) patch.payerId = null
    if (payment.receiverId != null && !participants.has(payment.receiverId)) patch.receiverId = null
    if ((payment.role === 'receipt' || payment.role === 'notice') && payment.sourceMessageId != null && !validSource(message, payment, messages)) patch.sourceMessageId = null
    if (!Object.keys(patch).length) return message
    changed = true
    return { ...message, payment: { ...payment, ...patch } }
  })
  return changed ? { ...draft, messages: nextMessages } : draft
}

export function duplicatePaymentPayload(payment: PaymentPayload): PaymentPayload {
  return payment.role === 'receipt' || payment.role === 'notice'
    ? { ...payment, sourceMessageId: null }
    : { ...payment }
}

export function remapPaymentIds(payment: PaymentPayload, participantIds: Map<string, string>, messageIds: Map<string, string>): PaymentPayload {
  const mapped = { ...payment }
  if ('payerId' in payment) mapped.payerId = safeId(payment.payerId, participantIds)
  if ('receiverId' in payment) mapped.receiverId = safeId(payment.receiverId, participantIds)
  if ('sourceMessageId' in payment) mapped.sourceMessageId = safeId(payment.sourceMessageId, messageIds)
  return mapped
}

function roleName(id: string | null | undefined, name: string | undefined, selfId: string | undefined, fallback: string): string {
  return id != null && id === selfId ? '你' : name?.trim() || fallback
}

export function paymentDisplayText(payment: PaymentPayload, selfId?: string): { status: string; secondary: string | null } {
  const transfer = payment.mode === 'transfer'
  const redPacketReceived = isOriginal(payment) && payment.payerId != null && payment.payerId === selfId ? '已被领完' : '已领取'
  const status = payment.status === 'received' ? (transfer ? '已收款' : redPacketReceived) : payment.status === 'refunded' ? '已退还' : payment.status === 'expired' ? '已过期' : transfer ? '待收款' : '待领取'
  const receiver = roleName(payment.receiverId, payment.receiverName, selfId, '对方')
  const configuredReceiver = payment.receiverId != null || Boolean(payment.receiverName?.trim())
  if (transfer && isOriginal(payment) && payment.status === 'pending') return { status, secondary: payment.note || (configuredReceiver ? `转账给${receiver}` : '转账给你') }
  if (transfer && isOriginal(payment) && payment.status === 'received') return { status, secondary: configuredReceiver ? '已被接受' : status }
  if (transfer && isOriginal(payment) && payment.status === 'refunded') return { status, secondary: configuredReceiver ? '已被退还' : status }
  return { status, secondary: payment.status !== 'pending' ? status : transfer ? payment.note || (configuredReceiver ? `转账给${receiver}` : '转账给你') : null }
}

export function paymentNoticeText(payment: PaymentPayload, selfId?: string): string {
  const payer = roleName(payment.payerId, payment.payerName, selfId, '对方')
  const receiver = roleName(payment.receiverId, payment.receiverName, selfId, '对方')
  return `${receiver}领取了${payer === '你' ? '你的' : `${payer}的`}红包`
}
