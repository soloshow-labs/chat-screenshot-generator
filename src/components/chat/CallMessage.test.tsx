import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Message } from '../../app/chatTypes'
import { SAMPLE_DRAFT } from '../../app/sampleDraft'
import { CallMessage } from './CallMessage'

function makeCallMessage(mode: 'voice' | 'video'): Message {
  return {
    ...SAMPLE_DRAFT.messages[0],
    kind: 'call',
    text: '',
    call: { mode, status: 'missed', durationSeconds: 0 },
  }
}

describe('CallMessage', () => {
  it.each(['voice', 'video'] as const)('uses the %s call glyph and status text', (mode) => {
    render(
      <CallMessage
        message={makeCallMessage(mode)}
        sender={SAMPLE_DRAFT.participants[0]}
        side="right"
        showName={false}
      />,
    )

    expect(screen.getByText('未接听')).toBeInTheDocument()
    expect(screen.getByTestId('call-icon')).toHaveAttribute('data-call-mode', mode)
  })

  it('places the incoming call icon before its status text', () => {
    render(
      <CallMessage
        message={makeCallMessage('voice')}
        sender={SAMPLE_DRAFT.participants[1]}
        side="left"
        showName={false}
      />,
    )

    const icon = screen.getByTestId('call-icon')
    const status = screen.getByText('未接听')
    expect(icon.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('places the outgoing call status text before its icon', () => {
    render(
      <CallMessage
        message={makeCallMessage('voice')}
        sender={SAMPLE_DRAFT.participants[0]}
        side="right"
        showName={false}
      />,
    )

    const icon = screen.getByTestId('call-icon')
    const status = screen.getByText('未接听')
    expect(status.compareDocumentPosition(icon) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
