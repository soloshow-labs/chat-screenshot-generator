import { describe, expect, it } from 'vitest'
import type { ChatDraft, PaymentPayload } from '../app/chatTypes'
import { createMessage } from '../app/messageFactory'
import { SAMPLE_DRAFT } from '../app/sampleDraft'
import {
  createOriginalPayment,
  duplicatePaymentPayload,
  paymentResponseError,
  reconcilePaymentReferences,
  remapPaymentIds,
  respondToPayment,
} from './paymentMessage'

type PaymentExtension = PaymentPayload & {
  role?: 'original' | 'receipt' | 'notice'
  payerId?: string | null
  receiverId?: string | null
  payerName?: string
  receiverName?: string
  sourceMessageId?: string | null
}

const payment = (patch: Partial<PaymentExtension> = {}): PaymentPayload => ({
  mode: 'transfer', amount: 66, note: '饭钱', status: 'pending',
  role: 'original', payerId: 'self', receiverId: 'p2', payerName: '小美', receiverName: '阿花', sourceMessageId: null,
  ...patch,
} as PaymentExtension)

function draftWith(paymentPayload: PaymentPayload = payment()): ChatDraft {
  const source = createMessage('self', { id: 'source', kind: 'payment', sentAt: '2026-08-27T10:00:00.000Z', payment: paymentPayload })
  return { ...structuredClone(SAMPLE_DRAFT), conversationType: 'direct', participants: SAMPLE_DRAFT.participants.slice(0, 2), messages: [source] }
}

describe('payment response transaction', () => {
  it('creates an original with direct-chat snapshots but never guesses a group recipient', () => {
    const direct = createOriginalPayment(payment({ payerId: null, receiverId: null, payerName: '', receiverName: '' }), 'self', SAMPLE_DRAFT.participants.slice(0, 2), 'direct') as PaymentExtension
    const group = createOriginalPayment(payment({ payerId: null, receiverId: null, payerName: '', receiverName: '' }), 'self', SAMPLE_DRAFT.participants, 'group') as PaymentExtension
    expect(direct).toMatchObject({ role: 'original', payerId: 'self', payerName: '小美', receiverId: 'p2', receiverName: '阿花', sourceMessageId: null })
    expect(group).toMatchObject({ role: 'original', payerId: 'self', payerName: '小美', receiverId: null, receiverName: '', sourceMessageId: null })
  })

  it('atomically receives a transfer with independent payment snapshots', () => {
    const draft = draftWith()
    const next = respondToPayment(draft, { messageId: 'source', newId: 'receipt', outcome: 'received', receiverId: 'p2', sentAt: '2026-08-27T10:01:00.000Z' })
    expect(next).not.toBe(draft)
    expect(next.messages.map(message => message.id)).toEqual(['source', 'receipt'])
    expect(next.messages[0].payment).toMatchObject({ role: 'original', status: 'received', sourceMessageId: null })
    expect(next.messages[1]).toMatchObject({ participantId: 'p2', kind: 'payment', side: 'auto', sentAt: '2026-08-27T10:01:00.000Z', media: null, quote: null, voice: null })
    expect(next.messages[1].payment).toMatchObject({ role: 'receipt', status: 'received', sourceMessageId: 'source', amount: 66, note: '饭钱', payerName: '小美', receiverName: '阿花' })
    const edited = { ...next.messages[0], payment: { ...next.messages[0].payment!, amount: 1, payerName: '改名' } }
    expect(next.messages[1].payment).toMatchObject({ amount: 66, payerName: '小美' })
    expect(edited.payment).toMatchObject({ amount: 1, payerName: '改名' })
  })

  it('makes every invalid response a pure no-op', () => {
    const draft = draftWith()
    for (const request of [
      { messageId: 'source', newId: '', outcome: 'received', receiverId: 'p2', sentAt: '2026-08-27T10:01:00.000Z' },
      { messageId: 'source', newId: 'source', outcome: 'received', receiverId: 'p2', sentAt: '2026-08-27T10:01:00.000Z' },
      { messageId: 'source', newId: 'receipt', outcome: 'received', receiverId: 'self', sentAt: '2026-08-27T10:01:00.000Z' },
      { messageId: 'source', newId: 'receipt', outcome: 'received', receiverId: 'p2', sentAt: 'not-a-date' },
    ] as const) {
      expect(paymentResponseError(draft, request)).not.toBeNull()
      expect(respondToPayment(draft, request)).toBe(draft)
    }
    const responded = respondToPayment(draft, { messageId: 'source', newId: 'receipt', outcome: 'received', receiverId: 'p2', sentAt: '2026-08-27T10:01:00.000Z' })
    const resetPending: ChatDraft = { ...responded, messages: [{ ...responded.messages[0], payment: { ...responded.messages[0].payment!, status: 'pending' as const } }, responded.messages[1]] }
    expect(respondToPayment(resetPending, { messageId: 'source', newId: 'again', outcome: 'received', receiverId: 'p2', sentAt: '2026-08-27T10:02:00.000Z' })).toBe(resetPending)
  })

  it('only allows received notices for red packets', () => {
    const draft = draftWith(payment({ mode: 'red-packet', note: '恭喜发财' }))
    expect(respondToPayment(draft, { messageId: 'source', newId: 'notice', outcome: 'refunded', receiverId: 'p2', sentAt: '2026-08-27T10:01:00.000Z' })).toBe(draft)
    const next = respondToPayment(draft, { messageId: 'source', newId: 'notice', outcome: 'received', receiverId: 'p2', sentAt: '2026-08-27T10:01:00.000Z' })
    expect(next.messages[1].payment).toMatchObject({ role: 'notice', mode: 'red-packet', status: 'received', sourceMessageId: 'source' })
  })
})

describe('payment payload lifecycle helpers', () => {
  it('detaches only invalid live references and preserves unchanged draft identity', () => {
    const source = createMessage('self', { id: 'source', kind: 'payment', payment: payment() })
    const receipt = createMessage('p2', { id: 'receipt', kind: 'payment', payment: payment({ role: 'receipt', status: 'received', sourceMessageId: 'source' }) })
    const current = { ...draftWith(), messages: [source, receipt] }
    expect(reconcilePaymentReferences(current)).toBe(current)
    const sourceRemoved = { ...current, messages: [receipt] }
    const reconciled = reconcilePaymentReferences(sourceRemoved)
    expect(reconciled.messages[0].payment).toMatchObject({ sourceMessageId: null, payerId: 'self', receiverId: 'p2', payerName: '小美' })
    const memberRemoved = { ...current, participants: current.participants.filter(person => person.id !== 'p2') }
    expect(reconcilePaymentReferences(memberRemoved).messages[0].payment).toMatchObject({ payerId: 'self', receiverId: null, receiverName: '阿花' })
  })

  it('duplicates detached response snapshots and remaps live identities', () => {
    const receipt = payment({ role: 'receipt', status: 'received', sourceMessageId: 'source' })
    expect(duplicatePaymentPayload(receipt)).toMatchObject({ role: 'receipt', sourceMessageId: null, payerId: 'self', receiverId: 'p2' })
    expect(remapPaymentIds(receipt, new Map([['self', 'new-self'], ['p2', 'new-p2']]), new Map([['source', 'new-source']]))).toMatchObject({ payerId: 'new-self', receiverId: 'new-p2', sourceMessageId: 'new-source', payerName: '小美', receiverName: '阿花' })
  })
})
