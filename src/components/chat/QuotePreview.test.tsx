import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createMessage } from '../../app/messageFactory'
import { SAMPLE_DRAFT } from '../../app/sampleDraft'
import { MessageBubble } from './MessageBubble'

vi.mock('../../hooks/useMediaAssetUrl', () => ({
  useMediaAssetUrl: (id: string | null) => ({ url: id === 'image' ? 'blob:snapshot' : null, loading: id === 'loading', error: id === 'lost' ? '找不到媒体素材' : null }),
}))

describe('quoted message rendering', () => {
  it.each(['left', 'right'] as const)('renders sender and emoji text snapshot below the %s reply bubble', side => {
    const message = createMessage('self', { text: '回复正文', quote: { sourceMessageId: null, senderName: '保存时姓名', kind: 'text', text: '保存时正文[微笑]', media: null } })
    const { container } = render(<MessageBubble message={message} sender={SAMPLE_DRAFT.participants[0]} side={side} showName />)
    const quote = container.querySelector('[data-quote-preview]')!
    expect(quote).toHaveAttribute('data-side', side)
    expect(quote).toHaveTextContent('保存时姓名')
    expect(quote).toHaveTextContent('保存时正文')
    expect(screen.getByRole('img', { name: '[微笑]' })).toBeInTheDocument()
    expect(container.querySelector('[data-message-bubble]')?.nextElementSibling).toBe(quote)
  })
  it('loads the independent 36px image snapshot and flags decoding failure', () => {
    const message = createMessage('self', { quote: { sourceMessageId: null, senderName: '快照', kind: 'image', text: '', media: { assetId: 'image', fileName: 'image.png', mimeType: 'image/png', width: 128, height: 64 } } })
    render(<MessageBubble message={message} sender={SAMPLE_DRAFT.participants[0]} side="left" showName={false} />)
    const image = screen.getByRole('img', { name: '快照引用的图片' })
    expect(image).toHaveAttribute('src', 'blob:snapshot')
    expect(image).toHaveAttribute('width', '36')
    expect(image).toHaveAttribute('height', '36')
    fireEvent.error(image)
    expect(screen.getByText('引用图片无法读取')).toHaveAttribute('data-quote-image-error')
  })
  it('keeps a visible missing-asset indication when the quoted file is absent', () => {
    const message = createMessage('self', { quote: { sourceMessageId: null, senderName: '快照', kind: 'image', text: '', media: { assetId: 'lost', fileName: 'lost.png', mimeType: 'image/png', width: 128, height: 64 } } })
    render(<MessageBubble message={message} sender={SAMPLE_DRAFT.participants[0]} side="right" showName={false} />)
    expect(screen.getByText('找不到媒体素材')).toHaveAttribute('data-quote-image-error')
  })
  it('marks a pending quote image before its img exists and clears the marker once available', () => {
    const message = createMessage('self', { quote: { sourceMessageId: null, senderName: '快照', kind: 'image', text: '', media: { assetId: 'loading', fileName: 'image.png', mimeType: 'image/png', width: 128, height: 64 } } })
    const props = { sender: SAMPLE_DRAFT.participants[0], side: 'left' as const, showName: false }
    const view = render(<MessageBubble message={message} {...props} />)
    expect(screen.getByText('引用图片加载中…')).toHaveAttribute('data-quote-image-loading')
    expect(screen.queryByRole('img', { name: '快照引用的图片' })).not.toBeInTheDocument()
    view.rerender(<MessageBubble message={{ ...message, quote: { ...message.quote!, media: { ...message.quote!.media!, assetId: 'image' } } }} {...props} />)
    expect(view.container.querySelector('[data-quote-image-loading]')).toBeNull()
    expect(screen.getByRole('img', { name: '快照引用的图片' })).toHaveAttribute('src', 'blob:snapshot')
  })
})
