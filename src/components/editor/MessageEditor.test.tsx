import { act, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SAMPLE_DRAFT } from '../../app/sampleDraft'
import { MessageEditor } from './MessageEditor'
import { useReducer } from 'react'
import { chatReducer } from '../../app/chatReducer'
import { createHistory, historyReducer } from '../../app/chatHistory'
import { createMessage } from '../../app/messageFactory'

function LiveEditor() {
  const [draft, dispatch] = useReducer(chatReducer, { ...SAMPLE_DRAFT, messages: SAMPLE_DRAFT.messages.slice(0, 2), captureStartMessageId: 'm1', captureEndMessageId: 'm2' })
  return <><MessageEditor messages={draft.messages} participants={draft.participants} dispatch={dispatch} /><output data-testid="draft">{JSON.stringify(draft)}</output></>
}

function LiveVoiceEditor() {
  const [message, dispatchMessage] = useReducer((message: ReturnType<typeof createMessage>, action: Parameters<typeof chatReducer>[1]) => chatReducer({ ...SAMPLE_DRAFT, messages: [message] }, action).messages[0], createMessage('self', { id: 'voice', kind: 'voice', voice: { durationMode: 'manual', durationSeconds: 15, transcript: '原来', showTranscript: true } }))
  return <><MessageEditor messages={[message]} participants={SAMPLE_DRAFT.participants} dispatch={dispatchMessage} /><output data-testid="voice-state">{JSON.stringify(message)}</output></>
}

function PrecisionHistoryEditor() {
  const message = createMessage('self', { id: 'precise', sentAt: '2026-08-27T08:00:30.500Z' })
  const [history, dispatch] = useReducer(historyReducer, { ...SAMPLE_DRAFT, messages: [message] }, createHistory)
  return <><MessageEditor messages={history.present.messages} participants={history.present.participants} dispatch={action => dispatch({ type: 'edit', action, timestamp: 1 })} /><output data-testid="precision-history">{JSON.stringify(history)}</output></>
}

const mediaMocks = vi.hoisted(() => ({
  processImageFile: vi.fn(),
  processAudioFile: vi.fn(),
  saveMediaAsset: vi.fn(),
  deleteMediaAsset: vi.fn(),
  releaseMediaAssets: vi.fn(),
}))

vi.mock('../../services/mediaProcessor', () => ({
  processImageFile: mediaMocks.processImageFile,
  processAudioFile: mediaMocks.processAudioFile,
}))

vi.mock('../../services/mediaAssetStore', () => ({
  saveMediaAsset: mediaMocks.saveMediaAsset,
  deleteMediaAsset: mediaMocks.deleteMediaAsset,
  releaseMediaAssets: mediaMocks.releaseMediaAssets,
}))

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd: (event: unknown) => void }) => (
    <div>
      <button type="button" onClick={() => onDragEnd({ active: { id: 'm1' }, over: { id: 'm2' } })}>模拟拖拽</button>
      {children}
    </div>
  ),
  KeyboardSensor: class {},
  PointerSensor: class {},
  closestCenter: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn().mockReturnValue([]),
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => children,
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  verticalListSortingStrategy: {},
  sortableKeyboardCoordinates: vi.fn(),
}))

vi.mock('@dnd-kit/utilities', () => ({ CSS: { Transform: { toString: () => undefined } } }))

describe('MessageEditor', () => {
  it('offers compact editing for daily conversations and defaults to it at 200', { timeout: 10_000 }, () => {
    const dispatch = vi.fn()
    const messages = Array.from({ length: 200 }, (_, index) => ({
      ...SAMPLE_DRAFT.messages[index % SAMPLE_DRAFT.messages.length],
      id: `large-${index + 1}`,
      text: `大量消息 ${index + 1}`,
    }))
    const view = render(<MessageEditor messages={messages.slice(0, 2)} participants={SAMPLE_DRAFT.participants} dispatch={dispatch} />)
    expect(screen.getByRole('checkbox', { name: '精简编辑' })).not.toBeChecked()
    expect(screen.getByLabelText('消息 1 内容')).toHaveValue('大量消息 1')

    fireEvent.click(screen.getByRole('checkbox', { name: '精简编辑' }))
    expect(screen.queryByLabelText('消息 1 内容')).not.toBeInTheDocument()

    view.unmount()
    render(<MessageEditor messages={messages} participants={SAMPLE_DRAFT.participants} dispatch={dispatch} />)
    expect(screen.getByRole('checkbox', { name: '精简编辑' })).toBeChecked()
    expect(screen.queryByLabelText('消息 1 内容')).not.toBeInTheDocument()
    expect(screen.getByText('大量消息 200')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '展开消息 150' }))
    expect(screen.getByLabelText('消息 150 内容')).toHaveValue('大量消息 150')
    fireEvent.click(screen.getByRole('button', { name: '复制消息 150' }))
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'duplicate-message', messageId: 'large-150' }))
  })

  it('navigates matching messages by content, sender, and type without hiding the sortable list', () => {
    const messages = [
      createMessage('self', { id: 'first', text: '季度汇报初稿' }),
      createMessage('p2', { id: 'second', text: '午饭吃什么' }),
      createMessage('p2', { id: 'third', kind: 'voice', voice: { durationMode: 'manual', durationSeconds: 8, transcript: '季度汇报语音', showTranscript: true } }),
    ]
    render(<MessageEditor messages={messages} participants={SAMPLE_DRAFT.participants} dispatch={vi.fn()} />)
    fireEvent.click(screen.getByRole('checkbox', { name: '精简编辑' }))
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索消息' }), { target: { value: '季度' } })
    expect(screen.getByRole('status', { name: '消息匹配结果' })).toHaveTextContent('1 / 2')
    expect(screen.getAllByRole('article')).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: '下一个匹配消息' }))
    expect(screen.getByRole('article', { name: '消息 3' })).toHaveFocus()
    expect(screen.getByLabelText('消息 3 时长模式')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('筛选发送人'), { target: { value: 'self' } })
    expect(screen.getByRole('status', { name: '消息匹配结果' })).toHaveTextContent('1 / 1')
    fireEvent.change(screen.getByLabelText('筛选消息类型'), { target: { value: 'voice' } })
    expect(screen.getByRole('status', { name: '消息匹配结果' })).toHaveTextContent('0 个匹配')
  })

  it('automatically expands and focuses a located compact message', () => {
    const messages = Array.from({ length: 200 }, (_, index) => ({
      ...SAMPLE_DRAFT.messages[index % SAMPLE_DRAFT.messages.length],
      id: `located-${index + 1}`,
      text: `定位消息 ${index + 1}`,
    }))
    render(<MessageEditor
      messages={messages}
      participants={SAMPLE_DRAFT.participants}
      dispatch={vi.fn()}
      locateRequest={{ messageId: 'located-180', sequence: 1 }}
    />)

    expect(screen.getByLabelText('消息 180 内容')).toHaveValue('定位消息 180')
    expect(screen.getByRole('article', { name: '消息 180' })).toHaveFocus()
  })

  it.each(['text', 'image', 'voice', 'call', 'recall', 'system', 'link', 'video', 'file', 'payment', 'contact', 'location'] as const)('offers insert, duplicate and delete for %s', (kind) => {
    const dispatch = vi.fn()
    const message = createMessage('self', { id: 'test', kind })
    render(<MessageEditor messages={[message]} participants={SAMPLE_DRAFT.participants} dispatch={dispatch} />)
    fireEvent.click(screen.getByRole('button', { name: '在消息 1 下方插入' }))
    expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'insert-message', afterId: 'test', message: expect.objectContaining({ participantId: 'self', kind: 'text', text: '' }) }))
    fireEvent.click(screen.getByRole('button', { name: '复制消息 1' }))
    expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'duplicate-message', messageId: 'test' }))
    fireEvent.click(screen.getByRole('button', { name: '删除消息 1' }))
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'delete-message', messageId: 'test' })
  })
  it('uses project dialogs to confirm batch deletion and clearing', async () => {
    const user = userEvent.setup()
    render(<LiveEditor />)
    await user.click(screen.getByRole('button', { name: '在消息 1 下方插入' }))
    expect(screen.getByLabelText('消息 2 内容')).toHaveValue('')
    expect(screen.getByLabelText('消息 3 内容')).toHaveValue(SAMPLE_DRAFT.messages[1].text)
    await user.click(screen.getByRole('button', { name: '多选消息' }))
    await user.click(screen.getByLabelText('选择消息 1'))
    await user.click(screen.getByLabelText('选择消息 3'))
    await user.click(screen.getByRole('button', { name: '删除选中（2）' }))
    expect(screen.getByRole('dialog', { name: '删除选中的 2 条消息？' })).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '删除选中（2）' }))
    await user.click(screen.getByRole('button', { name: '确认删除 2 条消息' }))
    const draft = JSON.parse(screen.getByTestId('draft').textContent!)
    expect(draft.messages).toHaveLength(1)
    expect(draft.captureStartMessageId).toBeNull()
    expect(draft.captureEndMessageId).toBeNull()
    await user.click(screen.getByLabelText('全选消息'))
    expect(screen.getByRole('button', { name: '删除选中（1）' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: '清空消息' }))
    expect(screen.getByRole('dialog', { name: '清空全部 1 条消息？' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.getAllByRole('article')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: '清空消息' }))
    await user.click(screen.getByRole('button', { name: '确认清空消息' }))
    expect(screen.queryAllByRole('article')).toHaveLength(0)
  })

  it('cycles senders only for unmodified Tab in message content', () => {
    render(<LiveEditor />)
    const content = screen.getByLabelText('消息 1 内容')
    expect(fireEvent.keyDown(content, { key: 'Tab' })).toBe(false)
    expect(screen.getByLabelText('消息 1 发送人')).toHaveValue('p2')
    fireEvent.keyDown(content, { key: 'Tab', shiftKey: true })
    expect(screen.getByLabelText('消息 1 发送人')).toHaveValue('self')
    fireEvent.keyDown(content, { key: 'Tab', shiftKey: true })
    expect(screen.getByLabelText('消息 1 发送人')).toHaveValue('p4')
    fireEvent.keyDown(content, { key: 'Tab' })
    for (const target of [content, screen.getByLabelText('消息 1 时间'), screen.getByLabelText('消息 1 发送人')]) {
      expect(fireEvent.keyDown(target, { key: 'Tab', ctrlKey: true })).toBe(true)
    }
    expect(fireEvent.keyDown(screen.getByLabelText('消息 1 时间'), { key: 'Tab' })).toBe(true)
    fireEvent.change(screen.getByLabelText('消息 1 类型'), { target: { value: 'link' } })
    expect(fireEvent.keyDown(screen.getByLabelText('消息 1 链接标题'), { key: 'Tab' })).toBe(false)
    expect(screen.getByLabelText('消息 1 发送人')).toHaveValue('p2')
    expect(fireEvent.keyDown(screen.getByLabelText('消息 1 上传缩略图'), { key: 'Tab' })).toBe(true)
  })
  it.each([['image', '上传图片'], ['voice', '上传语音']] as const)('allows a fresh %s upload before an abandoned processor settles', async (kind, label) => {
    let finish!: () => void
    const processor = kind === 'image' ? mediaMocks.processImageFile : mediaMocks.processAudioFile
    processor.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ mimeType: 'application/octet-stream', width: 1, height: 1, durationSeconds: 1 }) }))
    const dispatch = vi.fn()
    const message = { ...SAMPLE_DRAFT.messages[0], kind }
    const view = render(<MessageEditor messages={[message]} participants={SAMPLE_DRAFT.participants} dispatch={dispatch} />)
    fireEvent.change(screen.getByLabelText(`消息 1 ${label}`), { target: { files: [new File(['x'], 'local.bin')] } })
    expect(screen.getByLabelText(`消息 1 ${label}`)).toBeDisabled()
    view.rerender(<MessageEditor messages={[{ ...message, kind: 'text' }]} participants={SAMPLE_DRAFT.participants} dispatch={dispatch} />)
    view.rerender(<MessageEditor messages={[message]} participants={SAMPLE_DRAFT.participants} dispatch={dispatch} />)
    expect(screen.getByLabelText(`消息 1 ${label}`)).toBeEnabled()
    await act(async () => finish())
    expect(dispatch).not.toHaveBeenCalled()
  })
  it('clears abandoned upload busy state across external type changes', async () => {
    let finish!: (value: { mimeType: string; width: number; height: number }) => void
    mediaMocks.processImageFile.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const dispatch = vi.fn()
    const message = { ...SAMPLE_DRAFT.messages[0], kind: 'image' as const }
    const view = render(<MessageEditor messages={[message]} participants={SAMPLE_DRAFT.participants} dispatch={dispatch} />)
    fireEvent.change(screen.getByLabelText('消息 1 上传图片'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } })
    view.rerender(<MessageEditor messages={[{ ...message, kind: 'text' }]} participants={SAMPLE_DRAFT.participants} dispatch={dispatch} />)
    finish({ mimeType: 'image/png', width: 1, height: 1 })
    await waitFor(() => expect(dispatch).not.toHaveBeenCalled())
    view.rerender(<MessageEditor messages={[message]} participants={SAMPLE_DRAFT.participants} dispatch={dispatch} />)
    await waitFor(() => expect(screen.getByLabelText('消息 1 上传图片')).toBeEnabled())
  })
  it('abandons an image saved after its row is removed', async () => {
    let finish!: (value: { id: string }) => void
    mediaMocks.processImageFile.mockResolvedValue({ mimeType: 'image/png', width: 1, height: 1 })
    mediaMocks.saveMediaAsset.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const dispatch = vi.fn()
    const { unmount } = render(<MessageEditor messages={[{ ...SAMPLE_DRAFT.messages[0], kind: 'image' }]} participants={SAMPLE_DRAFT.participants} dispatch={dispatch} />)
    fireEvent.change(screen.getByLabelText('消息 1 上传图片'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } })
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    unmount()
    finish({ id: 'abandoned' })
    await waitFor(() => expect(mediaMocks.releaseMediaAssets).toHaveBeenCalledWith(['abandoned']))
    expect(dispatch).not.toHaveBeenCalled()
  })
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('adds, edits and configures messages', async () => {
    const user = userEvent.setup()
    const dispatch = vi.fn()
    render(
      <MessageEditor
        messages={SAMPLE_DRAFT.messages.slice(0, 2)}
        participants={SAMPLE_DRAFT.participants}
        dispatch={dispatch}
      />,
    )

    fireEvent.change(screen.getByLabelText('消息 1 内容'), { target: { value: '第一行\n第二行' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'update-message', messageId: 'm1', patch: { text: '第一行\n第二行' } })

    await user.selectOptions(screen.getByLabelText('消息 1 发送人'), 'p2')
    expect(dispatch).toHaveBeenCalledWith({ type: 'update-message', messageId: 'm1', patch: { participantId: 'p2' } })

    fireEvent.change(screen.getByLabelText('消息 1 时间'), { target: { value: '2026-08-26T09:30' } })
    expect(dispatch).toHaveBeenCalledWith({
      type: 'update-message',
      messageId: 'm1',
      patch: { sentAt: new Date('2026-08-26T09:30').toISOString() },
    })

    await user.selectOptions(screen.getByLabelText('消息 1 方向'), 'left')
    expect(dispatch).toHaveBeenCalledWith({ type: 'update-message', messageId: 'm1', patch: { side: 'left' } })

    await user.selectOptions(screen.getByLabelText('消息 1 时间显示'), 'show')
    expect(dispatch).toHaveBeenCalledWith({ type: 'update-message', messageId: 'm1', patch: { timeVisibility: 'show' } })

    await user.click(screen.getByRole('button', { name: '添加消息' }))
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'add-message',
      message: expect.objectContaining({ text: '', side: 'auto', sentAt: expect.any(String), timeVisibility: 'auto' }),
    }))
  })

  it('duplicates, deletes and dispatches drag reordering', async () => {
    const user = userEvent.setup()
    const dispatch = vi.fn()
    render(
      <MessageEditor
        messages={SAMPLE_DRAFT.messages.slice(0, 2)}
        participants={SAMPLE_DRAFT.participants}
        dispatch={dispatch}
      />,
    )

    await user.click(screen.getByRole('button', { name: '复制消息 1' }))
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'duplicate-message',
      messageId: 'm1',
      newId: expect.any(String),
    }))

    await user.click(screen.getByRole('button', { name: '删除消息 2' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'delete-message', messageId: 'm2' })

    await user.click(screen.getByRole('button', { name: '模拟拖拽' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'reorder-messages', activeId: 'm1', overId: 'm2' })
  })

  it('switches a message to recall and offers re-edit only for self', async () => {
    const user = userEvent.setup()
    const dispatch = vi.fn()
    const recalledMessage = {
      ...SAMPLE_DRAFT.messages[0],
      kind: 'recall',
      showReeditLink: false,
    } as unknown as typeof SAMPLE_DRAFT.messages[number]

    const { rerender } = render(
      <MessageEditor
        messages={[SAMPLE_DRAFT.messages[0]]}
        participants={SAMPLE_DRAFT.participants}
        dispatch={dispatch}
      />,
    )

    await user.selectOptions(screen.getByLabelText('消息 1 类型'), 'recall')
    expect(dispatch).toHaveBeenCalledWith({
      type: 'update-message',
      messageId: 'm1',
      patch: {
        kind: 'recall',
        quote: null, voice: null,
        link: null, payment: null, contactCard: null, location: null, system: null,
        deliveryStatus: 'sent',
        text: '',
        media: null,
        voiceUnread: false,
        call: null,
        showReeditLink: false,
      },
    })

    rerender(
      <MessageEditor
        messages={[recalledMessage]}
        participants={SAMPLE_DRAFT.participants}
        dispatch={dispatch}
      />,
    )
    expect(screen.queryByLabelText('消息 1 方向')).not.toBeInTheDocument()
    expect(screen.getByLabelText('消息 1 撤回提示')).toHaveAttribute('placeholder', '留空则自动生成撤回提示')
    await user.click(screen.getByLabelText('消息 1 显示重新编辑'))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'update-message',
      messageId: 'm1',
      patch: { showReeditLink: true },
    })

    rerender(
      <MessageEditor
        messages={[{ ...recalledMessage, participantId: 'p2' }]}
        participants={SAMPLE_DRAFT.participants}
        dispatch={dispatch}
      />,
    )
    expect(screen.queryByLabelText('消息 1 显示重新编辑')).not.toBeInTheDocument()
  })

  it('edits delivery failure independently and configures a structured system event', async () => {
    const user = userEvent.setup()
    render(<LiveEditor />)
    await user.click(screen.getByLabelText('消息 1 显示发送失败'))
    expect(JSON.parse(screen.getByTestId('draft').textContent!).messages[0].deliveryStatus).toBe('rejected')

    await user.selectOptions(screen.getByLabelText('消息 1 类型'), 'system')
    expect(screen.queryByLabelText('消息 1 方向')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('消息 1 显示发送失败')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('消息 1 系统类型'), 'invite')
    await user.selectOptions(screen.getByLabelText('消息 1 操作者'), 'self')
    await user.selectOptions(screen.getByLabelText('消息 1 对象'), 'p2')
    expect(JSON.parse(screen.getByTestId('draft').textContent!).messages[0]).toMatchObject({
      kind: 'system',
      deliveryStatus: 'sent',
      system: { subtype: 'invite', actorId: 'self', actorName: '小美', targetId: 'p2', targetName: '阿花' },
    })
  })

  it('switches to an image and stores uploaded image metadata', async () => {
    const user = userEvent.setup()
    const dispatch = vi.fn()
    mediaMocks.processImageFile.mockResolvedValue({
      mimeType: 'image/png',
      width: 640,
      height: 480,
    })
    mediaMocks.saveMediaAsset.mockResolvedValue({ id: 'asset-image' })

    const { rerender } = render(
      <MessageEditor
        messages={[SAMPLE_DRAFT.messages[0]]}
        participants={SAMPLE_DRAFT.participants}
        dispatch={dispatch}
      />,
    )

    await user.selectOptions(screen.getByLabelText('消息 1 类型'), 'image')
    expect(dispatch).toHaveBeenCalledWith({
      type: 'update-message',
      messageId: 'm1',
      patch: {
        kind: 'image',
        quote: null, voice: null,
        link: null, payment: null, contactCard: null, location: null, system: null,
        deliveryStatus: 'sent',
        text: '',
        media: null,
        voiceUnread: false,
        call: null,
        showReeditLink: false,
      },
    })

    const imageMessage = {
      ...SAMPLE_DRAFT.messages[0],
      kind: 'image',
      text: '',
      media: null,
    } as typeof SAMPLE_DRAFT.messages[number]
    rerender(
      <MessageEditor
        messages={[imageMessage]}
        participants={SAMPLE_DRAFT.participants}
        dispatch={dispatch}
      />,
    )

    const file = new File(['image'], 'photo.png', { type: 'image/png' })
    await user.upload(screen.getByLabelText('消息 1 上传图片'), file)

    await waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({
        type: 'update-message',
        messageId: 'm1',
        patch: {
          media: {
            assetId: 'asset-image',
            fileName: 'photo.png',
            mimeType: 'image/png',
            width: 640,
            height: 480,
          },
        },
      })
    })
    expect(mediaMocks.saveMediaAsset).toHaveBeenCalledWith(file, {
      mimeType: 'image/png',
      width: 640,
      height: 480,
    })
  })

  it('keeps persisted media when a media message changes type', async () => {
    const user = userEvent.setup()
    const dispatch = vi.fn()
    const imageMessage = {
      ...SAMPLE_DRAFT.messages[0],
      kind: 'image',
      text: '',
      media: {
        assetId: 'shared-image',
        fileName: 'shared.png',
        mimeType: 'image/png',
        width: 640,
        height: 480,
      },
    } as typeof SAMPLE_DRAFT.messages[number]

    render(
      <MessageEditor
        messages={[imageMessage]}
        participants={SAMPLE_DRAFT.participants}
        dispatch={dispatch}
      />,
    )

    await user.selectOptions(screen.getByLabelText('消息 1 类型'), 'text')

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'update-message',
      messageId: imageMessage.id,
    }))
    expect(mediaMocks.deleteMediaAsset).not.toHaveBeenCalled()
  })

  it('uploads playable audio and configures the incoming unread dot', async () => {
    const user = userEvent.setup()
    const dispatch = vi.fn()
    mediaMocks.processAudioFile.mockResolvedValue({
      mimeType: 'audio/wav',
      durationSeconds: 4,
    })
    mediaMocks.saveMediaAsset.mockResolvedValue({ id: 'asset-voice' })
    const voiceMessage = {
      ...SAMPLE_DRAFT.messages[2],
      kind: 'voice',
      text: '',
      media: null,
      voiceUnread: false,
    } as typeof SAMPLE_DRAFT.messages[number]

    render(
      <MessageEditor
        messages={[voiceMessage]}
        participants={SAMPLE_DRAFT.participants}
        dispatch={dispatch}
      />,
    )

    const file = new File(['audio'], 'voice.wav', { type: 'audio/wav' })
    await user.upload(screen.getByLabelText('消息 1 上传语音'), file)
    await waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({
        type: 'update-message',
        messageId: 'm3',
        patch: {
          voice: { durationMode: 'auto', durationSeconds: 5, transcript: '', showTranscript: false },
          media: {
            assetId: 'asset-voice',
            fileName: 'voice.wav',
            mimeType: 'audio/wav',
            durationSeconds: 4,
          },
        },
      })
    })

    await user.click(screen.getByLabelText('消息 1 显示未读红点'))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'update-message',
      messageId: 'm3',
      patch: { voiceUnread: true },
    })
  })

  it('successful audio upload switches to auto while preserving transcript edits made during processing', async () => {
    let finish!: (value: { mimeType: string; durationSeconds: number }) => void
    mediaMocks.processAudioFile.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    mediaMocks.saveMediaAsset.mockResolvedValue({ id: 'new-voice' })
    render(<LiveVoiceEditor />)
    fireEvent.change(screen.getByLabelText('消息 1 上传语音'), { target: { files: [new File(['audio'], 'a.wav', { type: 'audio/wav' })] } })
    fireEvent.change(screen.getByLabelText('消息 1 手填转文字'), { target: { value: '处理中修改' } })
    await act(async () => finish({ mimeType: 'audio/wav', durationSeconds: 61.2 }))
    await waitFor(() => expect(screen.getByLabelText('消息 1 时长模式')).toHaveValue('auto'))
    const message = JSON.parse(screen.getByTestId('voice-state').textContent!)
    expect(message.voice).toEqual({ durationMode: 'auto', durationSeconds: 15, transcript: '处理中修改', showTranscript: true })
    expect(message.media.durationSeconds).toBe(61.2)
  })

  it('configures a video call record and hides duration fields for a status', async () => {
    const user = userEvent.setup()
    const dispatch = vi.fn()
    const callMessage = {
      ...SAMPLE_DRAFT.messages[0],
      kind: 'call',
      text: '',
      call: { mode: 'voice', status: 'duration', durationSeconds: 30 },
    } as typeof SAMPLE_DRAFT.messages[number]

    const { rerender } = render(
      <MessageEditor
        messages={[callMessage]}
        participants={SAMPLE_DRAFT.participants}
        dispatch={dispatch}
      />,
    )

    expect(screen.getByLabelText('消息 1 通话秒')).toHaveValue(30)
    await user.selectOptions(screen.getByLabelText('消息 1 通话类型'), 'video')
    expect(dispatch).toHaveBeenCalledWith({
      type: 'update-message',
      messageId: 'm1',
      patch: { call: { mode: 'video', status: 'duration', durationSeconds: 30 } },
    })

    await user.selectOptions(screen.getByLabelText('消息 1 通话状态'), 'missed')
    expect(dispatch).toHaveBeenCalledWith({
      type: 'update-message',
      messageId: 'm1',
      patch: { call: { mode: 'voice', status: 'missed', durationSeconds: 30 } },
    })

    rerender(
      <MessageEditor
        messages={[{ ...callMessage, call: { ...callMessage.call!, status: 'missed' } }]}
        participants={SAMPLE_DRAFT.participants}
        dispatch={dispatch}
      />,
    )
    expect(screen.queryByLabelText('消息 1 通话秒')).not.toBeInTheDocument()
  })

  it('adds dropped image files through one batch action', async () => {
    mediaMocks.processImageFile.mockResolvedValue({ mimeType: 'image/png', width: 640, height: 480 })
    mediaMocks.saveMediaAsset
      .mockResolvedValueOnce({ id: 'drop-1' })
      .mockResolvedValueOnce({ id: 'drop-2' })
    const dispatch = vi.fn()
    render(<MessageEditor messages={SAMPLE_DRAFT.messages.slice(0, 1)} participants={SAMPLE_DRAFT.participants} dispatch={dispatch} />)

    fireEvent.drop(screen.getByLabelText('拖入或粘贴图片'), { dataTransfer: { files: [
      new File(['one'], 'one.png', { type: 'image/png' }),
      new File(['two'], 'two.png', { type: 'image/png' }),
    ] } })

    await waitFor(() => expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'add-messages',
      messages: [
        expect.objectContaining({ media: expect.objectContaining({ assetId: 'drop-1' }) }),
        expect.objectContaining({ media: expect.objectContaining({ assetId: 'drop-2' }) }),
      ],
    })))
  })

  it('imports a pure image pasted into message text without changing its text or selection', async () => {
    mediaMocks.processImageFile.mockResolvedValue({ mimeType: 'image/png', width: 640, height: 480 })
    mediaMocks.saveMediaAsset.mockResolvedValue({ id: 'pasted-image' })
    const dispatch = vi.fn()
    render(<MessageEditor messages={SAMPLE_DRAFT.messages.slice(0, 1)} participants={SAMPLE_DRAFT.participants} dispatch={dispatch} />)
    const textarea = screen.getByLabelText('消息 1 内容') as HTMLTextAreaElement
    textarea.focus()
    textarea.setSelectionRange(1, 3)

    fireEvent.paste(textarea, { clipboardData: { files: [new File(['image'], 'pasted.png', { type: 'image/png' })], getData: () => '' } })

    await waitFor(() => expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'add-messages' })))
    expect(textarea).toHaveValue(SAMPLE_DRAFT.messages[0].text)
    expect(textarea.selectionStart).toBe(1)
    expect(textarea.selectionEnd).toBe(3)
  })

  it('keeps normal text paste in message text even when image files are present', () => {
    const dispatch = vi.fn()
    render(<MessageEditor messages={SAMPLE_DRAFT.messages.slice(0, 1)} participants={SAMPLE_DRAFT.participants} dispatch={dispatch} />)
    const textarea = screen.getByLabelText('消息 1 内容')
    const paste = createEvent.paste(textarea, { clipboardData: { files: [new File(['image'], 'pasted.png', { type: 'image/png' })], getData: () => '保留文字' } })

    fireEvent(textarea, paste)

    expect(paste.defaultPrevented).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('accepts protected-mode external file drags before their FileList is exposed', () => {
    render(<MessageEditor messages={SAMPLE_DRAFT.messages.slice(0, 1)} participants={SAMPLE_DRAFT.participants} dispatch={vi.fn()} />)
    const receiver = screen.getByLabelText('拖入或粘贴图片')
    const dragOver = createEvent.dragOver(receiver, { dataTransfer: { files: [], types: ['Files'], items: [] } })

    fireEvent(receiver, dragOver)

    expect(dragOver.defaultPrevented).toBe(true)
  })

  it('keeps the multi-selection while applying one batch sender edit', async () => {
    const user = userEvent.setup()
    render(<LiveEditor />)

    await user.click(screen.getByRole('button', { name: '多选消息' }))
    await user.click(screen.getByLabelText('选择消息 1'))
    await user.click(screen.getByRole('button', { name: '批量修改（1）' }))
    await user.click(screen.getByRole('checkbox', { name: '修改发送人' }))
    await user.selectOptions(screen.getByLabelText('批量发送人'), 'p2')
    await user.click(screen.getByRole('button', { name: '应用批量修改' }))

    expect(screen.getByLabelText('选择消息 1')).toBeChecked()
    expect(JSON.parse(screen.getByTestId('draft').textContent!).messages[0].participantId).toBe('p2')
  })

  it('does not lose seconds or create history when an unchanged time shift is applied', async () => {
    const user = userEvent.setup()
    render(<PrecisionHistoryEditor />)
    await user.click(screen.getByRole('button', { name: '多选消息' }))
    await user.click(screen.getByLabelText('选择消息 1'))
    await user.click(screen.getByRole('button', { name: '批量修改（1）' }))
    await user.click(screen.getByRole('checkbox', { name: '平移日期时间' }))
    await user.click(screen.getByRole('button', { name: '应用批量修改' }))

    const history = JSON.parse(screen.getByTestId('precision-history').textContent!)
    expect(history.past).toHaveLength(0)
    expect(history.present.messages[0].sentAt).toBe('2026-08-27T08:00:30.500Z')
  })
})
