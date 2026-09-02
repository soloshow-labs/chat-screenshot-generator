import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PaymentNotice } from './PaymentNotice'

describe('PaymentNotice', () => {
  it('renders a centered snapshot notice with the red-packet artwork', () => {
    const { container } = render(<PaymentNotice payment={{
      mode: 'red-packet', amount: 88, note: '恭喜发财', status: 'received', role: 'notice',
      payerId: 'payer', receiverId: 'receiver', payerName: '小美', receiverName: '阿花', sourceMessageId: 'source',
    }} />)
    expect(screen.getByText('阿花领取了小美的红包')).toBeInTheDocument()
    expect(container.querySelector('[data-payment-notice]')).toHaveAttribute('data-payment-role', 'notice')
    expect(screen.getByRole('img', { name: '红包领取提示' })).toBeInTheDocument()
  })

  it('uses 你 only when the saved actor ID matches the live self', () => {
    render(<PaymentNotice selfId="receiver" payment={{
      mode: 'red-packet', amount: 88, note: '', status: 'received', role: 'notice',
      payerId: 'payer', receiverId: 'receiver', payerName: '小美', receiverName: '阿花', sourceMessageId: 'source',
    }} />)
    expect(screen.getByText('你领取了小美的红包')).toBeInTheDocument()
  })
})
