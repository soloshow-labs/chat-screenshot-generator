import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SAMPLE_DRAFT } from '../../app/sampleDraft'
import { createMessage } from '../../app/messageFactory'
import { MessageBubble } from './MessageBubble'

describe('MessageBubble inline emoji', () => {
  it('uses local graphical images and literal HTML without changing saved text', () => {
    const message = createMessage('self', { text: '<b>你好</b>[微笑][爱心][未知]' })
    const { container } = render(<MessageBubble message={message} sender={SAMPLE_DRAFT.participants[0]} side="right" showName={false} />)
    const emoji = screen.getByRole('img', { name: '[微笑]' })
    expect(emoji).toHaveAttribute('src', expect.stringContaining('.png'))
    expect(screen.getByRole('img', { name: '[爱心]' })).toBeInTheDocument()
    expect(container.querySelector('b')).toBeNull()
    expect(container.querySelector('[data-message-bubble]')).toHaveTextContent('<b>你好</b>')
    expect(message.text).toBe('<b>你好</b>[微笑][爱心][未知]')
  })
  it('falls back to original token and marks a failed emoji for export checks', () => {
    const { container } = render(<MessageBubble message={createMessage('self', { text: '[微笑]' })} sender={SAMPLE_DRAFT.participants[0]} side="left" showName={false} />)
    fireEvent.error(screen.getByRole('img', { name: '[微笑]' }))
    expect(screen.getByText('[微笑]')).toHaveAttribute('data-emoji-error', 'smile')
    expect(container.querySelector('img[data-inline-emoji]')).toBeNull()
  })
})
