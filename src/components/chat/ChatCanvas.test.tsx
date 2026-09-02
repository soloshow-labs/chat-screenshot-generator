import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SAMPLE_DRAFT } from '../../app/sampleDraft'
import type { ChatDraft } from '../../app/chatTypes'
import { ChatCanvas } from './ChatCanvas'

vi.mock('../../hooks/useMediaAssetUrl', () => ({
  useMediaAssetUrl: () => ({ url: 'blob:photo', loading: false, error: null }),
}))

function makeDraft(patch: Partial<ChatDraft> = {}): ChatDraft {
  return {
    ...SAMPLE_DRAFT,
    participants: SAMPLE_DRAFT.participants.map((participant) => ({ ...participant })),
    messages: SAMPLE_DRAFT.messages.map((message) => ({ ...message })),
    ...patch,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ChatCanvas', () => {
  it('renders a group title count and incoming sender names only', () => {
    render(<ChatCanvas draft={makeDraft()} exportMode={false} />)
    expect(screen.getByText('仙女驻凡大使馆 (4)')).toBeInTheDocument()
    expect(screen.getAllByText('阿花').every((name) => name.hasAttribute('data-sender-name'))).toBe(true)
    expect(screen.queryByText('小美')).not.toBeInTheDocument()
  })

  it('renders a direct title without count or sender names', () => {
    const direct = makeDraft({
      conversationType: 'direct',
      title: '小林',
      participants: SAMPLE_DRAFT.participants.slice(0, 2),
      messages: SAMPLE_DRAFT.messages.filter((message) => ['self', 'p2'].includes(message.participantId)),
    })
    render(<ChatCanvas draft={direct} exportMode />)
    expect(screen.getByText('小林')).toBeInTheDocument()
    expect(screen.queryByText('小林 (2)')).not.toBeInTheDocument()
    expect(document.querySelector('[data-sender-name]')).toBeNull()
  })

  it('renders smart time dividers but removes them in hidden mode', () => {
    const { rerender } = render(<ChatCanvas draft={makeDraft()} exportMode />)
    expect(screen.getAllByTestId('time-divider')).toHaveLength(1)
    rerender(<ChatCanvas draft={makeDraft({ timeDisplayMode: 'hidden' })} exportMode />)
    expect(screen.queryByTestId('time-divider')).not.toBeInTheDocument()
  })

  it('renders configurable status and input bars', () => {
    const { rerender } = render(<ChatCanvas draft={makeDraft({ showHomeIndicator: true })} exportMode />)
    expect(screen.getByText('10:35')).toBeInTheDocument()
    expect(screen.getByText('85')).toBeInTheDocument()
    expect(screen.getByLabelText('蜂窝信号 4 格').querySelectorAll('[data-signal-column]')).toHaveLength(4)
    expect(screen.getByLabelText('蜂窝信号 4 格').querySelectorAll('rect')).toHaveLength(8)
    expect(screen.getByLabelText('聊天输入栏')).toBeInTheDocument()
    expect(screen.getByLabelText('iPhone 底部横条')).toBeInTheDocument()

    rerender(<ChatCanvas draft={makeDraft({ showStatusBar: false, showInputBar: false, showHomeIndicator: true })} exportMode />)
    expect(screen.queryByText('10:35')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('聊天输入栏')).not.toBeInTheDocument()
    expect(screen.getByLabelText('iPhone 底部横条')).toBeInTheDocument()

    rerender(<ChatCanvas draft={makeDraft({ showStatusBar: false, showInputBar: false, showHomeIndicator: false })} exportMode />)
    expect(screen.queryByLabelText('iPhone 底部横条')).not.toBeInTheDocument()
  })

  it('renders opt-in iOS microstates while leaving the stored time untouched', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T08:09:00+08:00'))
    try {
      render(<ChatCanvas draft={makeDraft({
        followSystemTime: true,
        batteryCharging: true,
        showDoNotDisturb: true,
        earpieceMode: true,
        chatUnreadCount: 12,
      })} exportMode />)
      expect(screen.getByText('08:09')).toBeInTheDocument()
      expect(screen.queryByText('10:35')).not.toBeInTheDocument()
      expect(screen.getByLabelText('勿扰模式')).toBeInTheDocument()
      expect(screen.getByLabelText('正在充电，电量 85%')).toBeInTheDocument()
      expect(screen.getByLabelText('12 条未读消息')).toBeInTheDocument()
      expect(screen.getByText('当前为听筒播放模式')).toBeInTheDocument()
    } finally { vi.useRealTimers() }
  })

  it('renders input-bar draft text and voice mode without changing message content', () => {
    const { rerender } = render(<ChatCanvas draft={makeDraft({ inputBarMode: 'text', inputDraft: '正在输入的草稿' } as Partial<ChatDraft>)} exportMode />)
    expect(screen.getByLabelText('输入栏草稿')).toHaveTextContent('正在输入的草稿')
    expect(screen.getByText('发送')).toBeInTheDocument()
    expect(screen.queryByLabelText('更多功能')).not.toBeInTheDocument()

    rerender(<ChatCanvas draft={makeDraft({ inputBarMode: 'voice', inputDraft: '仍需保留' } as Partial<ChatDraft>)} exportMode />)
    expect(screen.getByLabelText('按住说话')).toHaveTextContent('按住 说话')
    expect(screen.getByLabelText('切换到键盘')).toBeInTheDocument()
    expect(screen.getByLabelText('更多功能')).toBeInTheDocument()
    expect(screen.queryByText('仍需保留')).not.toBeInTheDocument()
  })

  it('applies the selected theme and marks the export surface', () => {
    const { rerender } = render(<ChatCanvas draft={makeDraft({ theme: 'dark' })} exportMode={false} />)
    expect(screen.getByTestId('chat-canvas')).toHaveAttribute('data-theme', 'dark')
    expect(screen.getByTestId('chat-canvas')).toHaveAttribute('data-output-mode', 'screen')
    expect(screen.getByTestId('chat-canvas')).toHaveAttribute('data-export-mode', 'false')

    rerender(<ChatCanvas draft={makeDraft({ theme: 'light' })} exportMode />)
    expect(screen.getByTestId('chat-canvas')).toHaveAttribute('data-theme', 'light')
    expect(screen.getByTestId('chat-canvas')).toHaveAttribute('data-export-mode', 'true')
  })

  it('applies the selected output mode', () => {
    render(<ChatCanvas draft={makeDraft({ outputMode: 'long' })} exportMode />)
    expect(screen.getByTestId('chat-canvas')).toHaveAttribute('data-output-mode', 'long')
  })

  it('renders only the inclusive long-image range without changing original time visibility', () => {
    const draft = makeDraft({
      outputMode: 'long',
      captureStartMessageId: 'm2',
      captureEndMessageId: 'm4',
    })
    render(<ChatCanvas draft={draft} exportMode />)
    expect(screen.queryByText('姐妹们！')).not.toBeInTheDocument()
    expect(screen.getByText('我老公让我全职带娃，每个月给我两万！！！')).toBeInTheDocument()
    expect(screen.getByText('他一个月工资多少啊')).toBeInTheDocument()
    expect(screen.queryByText('他月薪四万五')).not.toBeInTheDocument()
    expect(screen.queryByTestId('time-divider')).not.toBeInTheDocument()
  })

  it('preserves multiline text and shows a fallback initial avatar', () => {
    const draft = makeDraft({
      messages: [{ ...SAMPLE_DRAFT.messages[0], text: '第一行\n第二行' }],
    })
    render(<ChatCanvas draft={draft} exportMode />)
    expect(screen.getByText(/第一行/)).toHaveTextContent('第一行 第二行')
    expect(screen.getByAltText('小美的头像')).toHaveAttribute('src', expect.stringMatching(/^data:image\/svg\+xml/))
  })

  it('renders a recalled message as a centered notice without an avatar or bubble', () => {
    const recalledMessage = {
      ...SAMPLE_DRAFT.messages[0],
      kind: 'recall',
      participantId: 'p2',
      text: '',
      showReeditLink: false,
    } as unknown as ChatDraft['messages'][number]

    render(<ChatCanvas draft={makeDraft({ messages: [recalledMessage] })} exportMode />)

    const notice = screen.getByTestId('recall-notice')
    expect(notice).toHaveTextContent('"阿花" 撤回了一条消息')
    expect(notice.querySelector('img')).toBeNull()
    expect(notice.querySelector('[data-message-bubble]')).toBeNull()
  })

  it('renders structured system events as safe highlighted text without an avatar or bubble', () => {
    const systemMessage = {
      ...SAMPLE_DRAFT.messages[0],
      kind: 'system',
      text: '',
      system: { subtype: 'invite', actorId: 'self', actorName: '小美', targetId: 'p2', targetName: '阿花', detail: '' },
    } as unknown as ChatDraft['messages'][number]
    render(<ChatCanvas draft={makeDraft({ messages: [systemMessage] })} exportMode />)
    const notice = screen.getByTestId('system-message')
    expect(notice).toHaveTextContent('小美邀请阿花加入了群聊')
    expect(notice.querySelectorAll('[data-system-name]')).toHaveLength(2)
    expect(notice.querySelector('img')).toBeNull()
    expect(notice.querySelector('[data-message-bubble]')).toBeNull()
  })

  it('shows a rejected delivery mark beside an ordinary message', () => {
    const rejected = { ...SAMPLE_DRAFT.messages[0], deliveryStatus: 'rejected' } as unknown as ChatDraft['messages'][number]
    render(<ChatCanvas draft={makeDraft({ messages: [rejected] })} exportMode />)
    expect(screen.getByLabelText('发送失败')).toHaveAttribute('data-delivery-status', 'rejected')
  })

  it('keeps rejected delivery marks across image, voice, call and rich cards', () => {
    const base = { ...SAMPLE_DRAFT.messages[0], deliveryStatus: 'rejected' as const }
    const messages = [
      { ...base, id: 'image', kind: 'image' as const, media: null },
      { ...base, id: 'voice', kind: 'voice' as const, voice: { durationMode: 'manual' as const, durationSeconds: 5, transcript: '', showTranscript: false }, media: null },
      { ...base, id: 'call', kind: 'call' as const, call: { mode: 'voice' as const, status: 'duration' as const, durationSeconds: 5 } },
      { ...base, id: 'contact', kind: 'contact' as const, contactCard: { name: '名片', avatarDataUrl: null, description: '' } },
    ] as unknown as ChatDraft['messages']
    render(<ChatCanvas draft={makeDraft({ messages })} exportMode />)
    expect(screen.getAllByLabelText('发送失败')).toHaveLength(4)
  })

  it('pauses the previous voice message when another one starts playing', async () => {
    const user = userEvent.setup()
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const voiceMessages = ['voice-1', 'voice-2'].map((id, index) => ({
      ...SAMPLE_DRAFT.messages[index],
      id,
      kind: 'voice' as const,
      text: '',
      media: {
        assetId: `asset-${id}`,
        fileName: `${id}.wav`,
        mimeType: 'audio/wav',
        durationSeconds: 3,
      },
      voiceUnread: false,
      call: null,
    }))

    render(<ChatCanvas draft={makeDraft({ messages: voiceMessages })} exportMode={false} />)

    await user.click(screen.getAllByRole('button', { name: '播放语音' })[0])
    await user.click(screen.getByRole('button', { name: '播放语音' }))

    expect(play).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(pause).toHaveBeenCalledOnce())
  })

  it('only shows the re-edit link for a recalled message sent by self', () => {
    const selfRecall = {
      ...SAMPLE_DRAFT.messages[0],
      kind: 'recall',
      participantId: 'self',
      text: '',
      showReeditLink: true,
    } as unknown as ChatDraft['messages'][number]
    const otherRecall = {
      ...selfRecall,
      id: 'other-recall',
      participantId: 'p2',
    }

    const { rerender } = render(<ChatCanvas draft={makeDraft({ messages: [selfRecall] })} exportMode />)
    expect(screen.getByTestId('recall-notice')).toHaveTextContent('你撤回了一条消息 重新编辑')
    expect(screen.getByText('重新编辑')).toHaveAttribute('data-reedit-link')

    rerender(<ChatCanvas draft={makeDraft({ messages: [otherRecall] })} exportMode />)
    expect(screen.queryByText('重新编辑')).not.toBeInTheDocument()
  })

  it('renders an image without a text bubble and opens the original-image dialog', async () => {
    const user = userEvent.setup()
    const imageMessage = {
      ...SAMPLE_DRAFT.messages[0],
      kind: 'image',
      text: '',
      media: {
        assetId: 'image-1',
        fileName: 'photo.png',
        mimeType: 'image/png',
        width: 640,
        height: 480,
      },
    } as ChatDraft['messages'][number]

    render(<ChatCanvas draft={makeDraft({ messages: [imageMessage] })} exportMode />)

    const imageButton = screen.getByRole('button', { name: '查看原图' })
    expect(imageButton).toHaveStyle({ aspectRatio: '640 / 480' })
    expect(document.querySelector('[data-message-bubble]')).toBeNull()

    await user.click(imageButton)
    expect(screen.getByRole('dialog', { name: '原图预览' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '关闭原图' }))
    expect(screen.queryByRole('dialog', { name: '原图预览' })).not.toBeInTheDocument()
  })
})
