import type { Message, PaymentPayload } from '../app/chatTypes'

export function isPaymentPayload(value: unknown): value is PaymentPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const payment = value as Record<string, unknown>
  if (typeof payment.mode !== 'string' || !['transfer', 'red-packet'].includes(payment.mode)
    || typeof payment.status !== 'string' || !['pending', 'received', 'refunded', 'expired'].includes(payment.status)
    || typeof payment.amount !== 'number' || !Number.isFinite(payment.amount) || payment.amount < 0
    || typeof payment.note !== 'string') return false
  if (payment.role === undefined) return ['payerId', 'receiverId', 'payerName', 'receiverName', 'sourceMessageId'].every(key => payment[key] === undefined)
  if (typeof payment.role !== 'string' || !['original', 'receipt', 'notice'].includes(payment.role)) return false
  if (![payment.payerId, payment.receiverId].every(id => id === null || (typeof id === 'string' && id.trim().length > 0))) return false
  if (typeof payment.payerName !== 'string' || typeof payment.receiverName !== 'string') return false
  if (payment.payerId !== null && payment.payerId === payment.receiverId) return false
  if (payment.sourceMessageId != null && (typeof payment.sourceMessageId !== 'string' || !payment.sourceMessageId.trim())) return false
  if (payment.role === 'original') return payment.sourceMessageId == null
  if (payment.role === 'receipt') return payment.mode === 'transfer' && ['received', 'refunded'].includes(String(payment.status))
  return payment.mode === 'red-packet' && payment.status === 'received'
}

export function validPaymentReferences(messages: Message[], participantIds: Set<string>): boolean {
  const byId = new Map(messages.map(message => [message.id, message]))
  const linkedSources = new Set<string>()
  for (const message of messages) {
    const payment = message.payment
    if (!payment?.role) continue
    if (message.kind !== 'payment') return false
    if ([payment.payerId, payment.receiverId].some(id => id != null && !participantIds.has(id))) return false
    if (payment.sourceMessageId == null) continue
    const source = byId.get(payment.sourceMessageId)
    if (!source || source.id === message.id || source.kind !== 'payment' || !source.payment
      || (source.payment.role ?? 'original') !== 'original' || source.payment.mode !== payment.mode
      || linkedSources.has(source.id)) return false
    linkedSources.add(source.id)
  }
  return true
}
