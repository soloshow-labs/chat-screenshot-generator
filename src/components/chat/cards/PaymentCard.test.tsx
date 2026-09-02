import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PaymentCard } from './PaymentCard'

describe('PaymentCard roles', () => {
  it('uses original payment wording independently of card direction', () => {
    const payment = {
      mode: 'transfer' as const, amount: 20, note: '', status: 'received' as const,
      role: 'original' as const, payerId: 'payer', receiverId: 'receiver', payerName: '付款人', receiverName: '收款人', sourceMessageId: null,
    }
    const { rerender } = render(<PaymentCard payment={payment} side="left" />)
    expect(screen.getByText('已被接受')).toBeInTheDocument()
    rerender(<PaymentCard payment={payment} side="right" />)
    expect(screen.getByText('已被接受')).toBeInTheDocument()
    expect(screen.queryByText('已被收款')).not.toBeInTheDocument()
  })

  it('uses you only for an explicit live self identity', () => {
    render(<PaymentCard selfId="receiver" side="right" payment={{
      mode: 'transfer', amount: 20, note: '', status: 'pending',
      role: 'original', payerId: 'payer', receiverId: 'receiver', payerName: '付款人', receiverName: '收款人', sourceMessageId: null,
    }} />)
    expect(screen.getByText('转账给你')).toBeInTheDocument()
  })

  it('keeps role-less cards on their established compatibility wording', () => {
    render(<PaymentCard side="left" payment={{ mode: 'transfer', amount: 20, note: '', status: 'pending' }} />)
    expect(screen.getByText('转账给你')).toBeInTheDocument()
  })

  it.each(['left', 'right'] as const)('shows a self-originated received red packet as fully claimed on the %s', side => {
    render(<PaymentCard selfId="self" side={side} payment={{
      mode: 'red-packet', amount: 20, note: '', status: 'received', role: 'original',
      payerId: 'self', receiverId: 'friend', payerName: '我', receiverName: '朋友', sourceMessageId: null,
    }} />)
    expect(screen.getByText('已被领完')).toBeInTheDocument()
  })

  it.each(['left', 'right'] as const)('shows another person’s received red packet as claimed on the %s', side => {
    render(<PaymentCard selfId="self" side={side} payment={{
      mode: 'red-packet', amount: 20, note: '', status: 'received', role: 'original',
      payerId: 'friend', receiverId: 'self', payerName: '朋友', receiverName: '我', sourceMessageId: null,
    }} />)
    expect(screen.getByText('已领取')).toBeInTheDocument()
    expect(screen.queryByText('已被领完')).toBeNull()
  })
})
