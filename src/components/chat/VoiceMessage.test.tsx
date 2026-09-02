import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SAMPLE_DRAFT } from '../../app/sampleDraft'
import type { Message } from '../../app/chatTypes'
import { VoiceMessage } from './VoiceMessage'
import { createMessage } from '../../app/messageFactory'

vi.mock('../../hooks/useMediaAssetUrl', () => ({
  useMediaAssetUrl: (assetId: string | null) => ({ url: assetId && assetId !== 'missing' ? 'blob:voice' : null, loading: false, error: assetId === 'missing' ? '找不到媒体素材' : null }),
}))

function makeVoiceMessage(patch: Partial<Message> = {}): Message {
  return {
    ...SAMPLE_DRAFT.messages[0],
    kind: 'voice',
    text: '',
    media: {
      assetId: 'voice-1',
      fileName: 'voice.wav',
      mimeType: 'audio/wav',
      durationSeconds: 18.2,
    },
    voiceUnread: true,
    voice: { durationMode: 'auto', durationSeconds: 5, transcript: '', showTranscript: false },
    ...patch,
  }
}

function ControlledVoiceMessage() {
  const message = makeVoiceMessage({ voiceUnread: false })
  const [activeVoiceMessageId, setActiveVoiceMessageId] = useState<string | null>(null)
  return (
    <VoiceMessage
      message={message}
      sender={SAMPLE_DRAFT.participants[1]}
      side="left"
      showName={false}
      activeVoiceMessageId={activeVoiceMessageId}
      onPlaybackStart={setActiveVoiceMessageId}
      onPlaybackStop={(messageId) => {
        setActiveVoiceMessageId((current) => current === messageId ? null : current)
      }}
    />
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('VoiceMessage', () => {
  const props = { sender: SAMPLE_DRAFT.participants[0], side: 'left' as const, showName: false, activeVoiceMessageId: null, onPlaybackStart: vi.fn(), onPlaybackStop: vi.fn() }
  it('renders a new manual five-second voice as a non-playable display without an upload error', () => {
    const { container } = render(<VoiceMessage message={createMessage('self', { kind: 'voice' })} {...props} />)
    expect(screen.getByText('5″')).toBeInTheDocument()
    expect(screen.queryByText('请上传语音')).toBeNull()
    expect(screen.queryByRole('button', { name: '播放语音' })).toBeNull()
    expect(container.querySelector('audio')).toBeNull()
  })
  it('shows an emoji transcript only when enabled and leaves hidden stored text intact', () => {
    const message = createMessage('self', { kind: 'voice', voice: { durationMode: 'manual', durationSeconds: 60, transcript: '听到啦[微笑]', showTranscript: true } })
    const { rerender } = render(<VoiceMessage message={message} {...props} />)
    expect(screen.getByText('60″')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '[微笑]' })).toBeInTheDocument()
    expect(screen.getByText('听到啦')).toBeInTheDocument()
    rerender(<VoiceMessage message={{ ...message, voice: { ...message.voice!, showTranscript: false } }} {...props} />)
    expect(screen.queryByText('听到啦')).toBeNull()
    expect(message.voice?.transcript).toBe('听到啦[微笑]')
    rerender(<VoiceMessage message={{ ...message, voice: { ...message.voice!, transcript: '' } }} {...props} />)
    expect(document.querySelector('[data-voice-transcript]')).toBeNull()
  })
  it('does not hide missing auto audio or missing manual attachments', () => {
    const { rerender } = render(<VoiceMessage message={createMessage('self', { kind: 'voice', voice: { durationMode: 'auto', durationSeconds: 5, transcript: '', showTranscript: false } })} {...props} />)
    expect(screen.getByText('请上传语音或改用手填秒数')).toBeInTheDocument()
    rerender(<VoiceMessage message={createMessage('self', { kind: 'voice', media: { assetId: 'missing', fileName: 'lost.wav', mimeType: 'audio/wav', durationSeconds: 10 } })} {...props} />)
    expect(screen.getByText('找不到媒体素材')).toBeInTheDocument()
  })
  it('manual displayed seconds retain the uploaded audio and playback-ended handling', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    const message = makeVoiceMessage({ voice: { durationMode: 'manual', durationSeconds: 1, transcript: '', showTranscript: false } })
    const { container } = render(<VoiceMessage message={message} {...props} />)
    expect(screen.getByRole('button', { name: '播放语音' })).toHaveTextContent('1″')
    await userEvent.click(screen.getByRole('button', { name: '播放语音' }))
    expect(play).toHaveBeenCalledOnce()
    fireEvent.ended(container.querySelector('audio')!)
    expect(props.onPlaybackStop).toHaveBeenCalledWith(message.id)
    expect(message.media?.durationSeconds).toBe(18.2)
  })
  it('shows an editable error when an existing audio file cannot decode', () => {
    const { container } = render(<VoiceMessage message={makeVoiceMessage()} {...props} />)
    fireEvent.error(container.querySelector('audio')!)
    expect(screen.getByText('音频无法播放，请更换音频')).toHaveAttribute('data-voice-error')
  })
  it('renders duration, bounded width, direction, and incoming unread dot', () => {
    const sender = SAMPLE_DRAFT.participants[1]
    const { rerender } = render(
      <VoiceMessage
        message={makeVoiceMessage()}
        sender={sender}
        side="left"
        showName
        activeVoiceMessageId={null}
        onPlaybackStart={vi.fn()}
        onPlaybackStop={vi.fn()}
      />,
    )

    const bubble = screen.getByRole('button', { name: '播放语音' })
    expect(bubble).toHaveTextContent('19″')
    expect(Number.parseFloat(bubble.style.width)).toBeGreaterThanOrEqual(82)
    expect(Number.parseFloat(bubble.style.width)).toBeLessThanOrEqual(220)
    expect(screen.getByTestId('voice-glyph')).toHaveAttribute('data-mirrored', 'false')
    expect(screen.getByTestId('voice-unread')).toBeInTheDocument()

    rerender(
      <VoiceMessage
        message={makeVoiceMessage()}
        sender={sender}
        side="right"
        showName={false}
        activeVoiceMessageId={null}
        onPlaybackStart={vi.fn()}
        onPlaybackStop={vi.fn()}
      />,
    )
    expect(screen.getByTestId('voice-glyph')).toHaveAttribute('data-mirrored', 'true')
    expect(screen.queryByTestId('voice-unread')).not.toBeInTheDocument()
  })

  it('places the outgoing voice duration immediately before its glyph', () => {
    render(
      <VoiceMessage
        message={makeVoiceMessage()}
        sender={SAMPLE_DRAFT.participants[0]}
        side="right"
        showName={false}
        activeVoiceMessageId={null}
        onPlaybackStart={vi.fn()}
        onPlaybackStop={vi.fn()}
      />,
    )

    const duration = screen.getByText('19″')
    const glyph = screen.getByTestId('voice-glyph')
    expect(duration.compareDocumentPosition(glyph) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('plays and pauses the uploaded audio', async () => {
    const user = userEvent.setup()
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    render(<ControlledVoiceMessage />)

    await user.click(screen.getByRole('button', { name: '播放语音' }))
    expect(play).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: '暂停语音' }))
    expect(pause).toHaveBeenCalledOnce()
  })
})
