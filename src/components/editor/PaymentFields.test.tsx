import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createMessage } from '../../app/messageFactory'
import { SAMPLE_DRAFT } from '../../app/sampleDraft'
import type { ChatAction } from '../../app/chatReducer'
import { PaymentFields } from './PaymentFields'

function paymentDraft() {
  const message = createMessage('self', {
    id: 'pay', kind: 'payment', sentAt: '2026-08-27T10:00:00.000Z',
    payment: { mode: 'transfer', amount: 66, note: '饭钱', status: 'pending', role: 'original', payerId: 'self', receiverId: 'p2', payerName: '小美', receiverName: '阿花', sourceMessageId: null },
  })
  return { ...SAMPLE_DRAFT, conversationType: 'direct' as const, participants: SAMPLE_DRAFT.participants.slice(0, 2), messages: [message] }
}

describe('PaymentFields', () => {
  it('dispatches exactly one payment-response action using the selected recipient and response time', async () => {
    const user = userEvent.setup()
    const draft = paymentDraft()
    const dispatch = vi.fn<(action: ChatAction) => void>()
    render(<PaymentFields draft={draft} message={draft.messages[0]} number={1} dispatch={dispatch} />)
    expect(screen.getByLabelText('消息 1 支付类型')).toBeInTheDocument()
    expect(screen.getByLabelText('消息 1 付款人')).toHaveValue('self')
    expect(screen.getByLabelText('消息 1 收款人')).toHaveValue('p2')
    await user.click(screen.getByRole('button', { name: '生成收款回执' }))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'respond-payment', messageId: 'pay', outcome: 'received', receiverId: 'p2', sentAt: '2026-08-27T10:01:00.000Z' }))
  })

  it('updates the actor ID and snapshot name together while clearing a collision', async () => {
    const user = userEvent.setup()
    const draft = paymentDraft()
    const dispatch = vi.fn<(action: ChatAction) => void>()
    render(<PaymentFields draft={draft} message={draft.messages[0]} number={1} dispatch={dispatch} />)
    await user.selectOptions(screen.getByLabelText('消息 1 付款人'), 'p2')
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'update-message', messageId: 'pay', patch: { payment: expect.objectContaining({ payerId: 'p2', payerName: '阿花', receiverId: null, receiverName: '' }) },
    }))
  })

  it('renders generated receipts as read-only snapshots without mode, status, or response buttons', () => {
    const draft = paymentDraft()
    const receipt = { ...draft.messages[0], id: 'receipt', participantId: 'p2', payment: { ...draft.messages[0].payment!, role: 'receipt' as const, status: 'received' as const, sourceMessageId: 'pay' } }
    render(<PaymentFields draft={{ ...draft, messages: [draft.messages[0], receipt] }} message={receipt} number={2} dispatch={vi.fn()} />)
    expect(screen.getByText(/收款回执/)).toBeInTheDocument()
    expect(screen.queryByLabelText('消息 2 支付类型')).toBeNull()
    expect(screen.queryByLabelText('消息 2 支付状态')).toBeNull()
    expect(screen.queryByRole('button', { name: /生成/ })).toBeNull()
  })

  it('treats a valid maximum source date with an overflowing default response minute as invalid', () => {
    const draft = paymentDraft()
    const message = { ...draft.messages[0], sentAt: '+275760-09-13T00:00:00.000Z' }
    render(<PaymentFields draft={{ ...draft, messages: [message] }} message={message} number={1} dispatch={vi.fn()} />)
    expect(screen.getByLabelText('消息 1 回应时间')).toHaveValue('')
    expect(screen.getByRole('button', { name: '生成收款回执' })).toBeDisabled()
  })
})
