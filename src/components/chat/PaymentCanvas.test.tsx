import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createMessage } from '../../app/messageFactory'
import { SAMPLE_DRAFT } from '../../app/sampleDraft'
import { ChatCanvas } from './ChatCanvas'

describe('payment canvas integration', () => {
  it('renders a detached red-packet receipt as a centered notice without avatar or card', () => {
    const notice = createMessage('self', { id: 'notice', kind: 'payment', side: 'right', payment: {
      mode: 'red-packet', status: 'received', role: 'notice', amount: 0, note: '祝福', payerId: 'p2', receiverId: 'self', payerName: '阿花', receiverName: '小美', sourceMessageId: null,
    } })
    const { container } = render(<ChatCanvas draft={{ ...SAMPLE_DRAFT, messages: [notice] }} exportMode />)
    expect(screen.getByText('你领取了阿花的红包')).toBeInTheDocument()
    expect(container.querySelector('[data-payment-notice]')).toBeInTheDocument()
    expect(container.querySelector('[data-card-kind="payment"]')).not.toBeInTheDocument()
    expect(screen.queryByAltText('小美的头像')).not.toBeInTheDocument()
  })
})
