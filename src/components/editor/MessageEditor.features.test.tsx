import { useReducer } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { SAMPLE_DRAFT } from '../../app/sampleDraft'
import { createHistory, historyReducer } from '../../app/chatHistory'
import { createMessage } from '../../app/messageFactory'
import type { Message } from '../../app/chatTypes'
import { MessageEditor } from './MessageEditor'

function Editor({ messages, participants = SAMPLE_DRAFT.participants }: { messages: Message[]; participants?: typeof SAMPLE_DRAFT.participants }) {
  const [history, dispatch] = useReducer(historyReducer, { ...SAMPLE_DRAFT, messages, participants }, createHistory)
  return <>
    <MessageEditor messages={history.present.messages} participants={history.present.participants} dispatch={action => dispatch({ type: 'edit', action, timestamp: 100 })} />
    <button onClick={() => dispatch({ type: 'undo' })}>测试撤销</button>
    <button onClick={() => dispatch({ type: 'redo' })}>测试重做</button>
    <output data-testid="state">{JSON.stringify(history.present.messages)}</output>
  </>
}
function currentMessages(): Message[] { return JSON.parse(screen.getByTestId('state').textContent!) }

describe('everyday message editing', () => {
  it('replaces the stored selection with an emoji, restores caret, and undoes it separately from typing', async () => {
    const user = userEvent.setup()
    render(<Editor messages={[createMessage('self', { text: '你好朋友' })]} />)
    const textarea = screen.getByLabelText('消息 1 内容') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: '你好朋友！' } })
    textarea.focus()
    textarea.setSelectionRange(2, 4)
    await user.click(screen.getByRole('button', { name: '消息 1 插入表情' }))
    await user.click(within(screen.getByRole('region', { name: '消息 1 全部表情' })).getByRole('button', { name: '插入微笑' }))
    expect(textarea).toHaveValue('你好[微笑]！')
    expect(textarea).toHaveFocus()
    expect(textarea.selectionStart).toBe(6)
    expect(textarea.selectionEnd).toBe(6)
    await user.click(screen.getByText('测试撤销'))
    expect(textarea).toHaveValue('你好朋友！')
    await user.click(screen.getByText('测试重做'))
    expect(textarea).toHaveValue('你好[微笑]！')
  })
  it('closes the keyboard picker with Escape and preserves composition and Tab sender behavior', async () => {
    const user = userEvent.setup()
    render(<Editor messages={[createMessage('self', { text: '你好' })]} />)
    const textarea = screen.getByLabelText('消息 1 内容')
    const trigger = screen.getByRole('button', { name: '消息 1 插入表情' })
    fireEvent.compositionStart(textarea)
    expect(trigger).toBeDisabled()
    expect(fireEvent.keyDown(textarea, { key: 'Tab', isComposing: true })).toBe(true)
    expect(screen.getByLabelText('消息 1 发送人')).toHaveValue('self')
    fireEvent.change(textarea, { target: { value: '你好中文' } })
    fireEvent.compositionEnd(textarea)
    trigger.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('group', { name: '消息 1 表情选择器' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: '消息 1 搜索表情' })).toHaveFocus()
    expect(within(screen.getByRole('region', { name: '消息 1 全部表情' })).getAllByRole('button')).toHaveLength(108)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: '消息 1 表情选择器' })).not.toBeInTheDocument()
    expect(textarea).toHaveFocus()
    expect(textarea).toHaveValue('你好中文')
    fireEvent.keyDown(textarea, { key: 'Tab' })
    expect(screen.getByLabelText('消息 1 发送人')).toHaveValue('p2')
    fireEvent.keyDown(textarea, { key: 'Tab', shiftKey: true })
    expect(screen.getByLabelText('消息 1 发送人')).toHaveValue('self')
  })
  it('does not steal textarea focus when the user resumes typing with the picker open', async () => {
    render(<Editor messages={[createMessage('self', { text: '原文' })]} />)
    await userEvent.click(screen.getByRole('button', { name: '消息 1 插入表情' }))
    const textarea = screen.getByLabelText('消息 1 内容')
    textarea.focus()
    fireEvent.change(textarea, { target: { value: '继续输入' } })
    expect(textarea).toHaveFocus()
  })
  it.each([
    ['moving the caret', '你好朋友', 4, 4, '你好朋友[微笑]'],
    ['editing and selecting new text', '继续输入朋友', 4, 6, '继续输入[微笑]'],
  ] as const)('inserts at the latest textarea selection after %s with the picker open', async (_action, text, start, end, expected) => {
    const user = userEvent.setup()
    render(<Editor messages={[createMessage('self', { text: '你好朋友' })]} />)
    const textarea = screen.getByLabelText('消息 1 内容') as HTMLTextAreaElement
    textarea.focus()
    textarea.setSelectionRange(2, 4)
    await user.click(screen.getByRole('button', { name: '消息 1 插入表情' }))
    await user.click(textarea)
    fireEvent.change(textarea, { target: { value: text } })
    textarea.setSelectionRange(start, end)
    await user.click(within(screen.getByRole('region', { name: '消息 1 全部表情' })).getByRole('button', { name: '插入微笑' }))
    expect(textarea).toHaveValue(expected)
    expect(textarea).toHaveFocus()
    expect(textarea.selectionStart).toBe(start + '[微笑]'.length)
    expect(textarea.selectionEnd).toBe(textarea.selectionStart)
    await user.click(screen.getByText('测试撤销'))
    expect(textarea).toHaveValue(text)
  })
  it('offers earlier quoteable sources with durable text snapshots, then reselects and removes quotes with undo', () => {
    const longFileName = `报告-${'很长'.repeat(30)}.pdf`
    const longSenderName = '发送者'.repeat(20)
    const participants = [...SAMPLE_DRAFT.participants, { id: 'long-sender', name: longSenderName, avatarDataUrl: null, isSelf: false }]
    const sources = [
      createMessage('p2', { id: 'text-source', text: '最初[微笑]' }),
      createMessage('self', { id: 'empty-image', kind: 'image' }),
      createMessage('self', { id: 'voice-source', kind: 'voice', voice: { durationMode: 'auto', durationSeconds: 5, transcript: '', showTranscript: false }, media: { assetId: 'voice-asset', fileName: 'voice.mp3', mimeType: 'audio/mpeg', durationSeconds: 9.2 } }),
      createMessage('long-sender', { id: 'file-source', kind: 'file', media: { assetId: 'file-asset', fileName: longFileName, mimeType: 'application/pdf' } }),
      createMessage('self', { id: 'video-source', kind: 'video' }),
      createMessage('p2', { id: 'contact-source', kind: 'contact', contactCard: { name: '小红', description: '', avatarDataUrl: null } }),
      createMessage('self', { id: 'reply', text: '回复' }),
      createMessage('self', { id: 'future', text: '未来消息' }),
    ]
    render(<Editor messages={sources} participants={participants} />)
    const reply = screen.getByRole('article', { name: '消息 7' })
    expect(within(reply).queryByLabelText('消息 7 引用来源')).not.toBeInTheDocument()
    fireEvent.click(within(reply).getByText('引用回复'))
    const select = within(reply).getByLabelText('消息 7 引用来源')
    expect(within(select).getByRole('option', { name: /图片未上传/ })).toBeDisabled()
    for (const summary of ['[语音] 10秒', '[视频]', '[个人名片]小红']) expect(within(select).getAllByRole('option').some(option => option.textContent?.includes(summary))).toBe(true)
    const fullFileSummary = `[文件]${longFileName}`
    const fileOption = within(select).getAllByRole('option').find(option => option.getAttribute('value') === 'file-source')
    expect(fileOption?.textContent).toBe(`${longSenderName}：${fullFileSummary}`.slice(0, 48))
    expect(fileOption?.textContent?.length).toBeLessThanOrEqual(48)
    expect(within(select).queryByRole('option', { name: /未来消息/ })).not.toBeInTheDocument()
    fireEvent.change(select, { target: { value: 'file-source' } })
    expect(currentMessages()[6].quote?.text).toBe(fullFileSummary)
    fireEvent.change(select, { target: { value: 'text-source' } })
    expect(currentMessages()[6].quote).toMatchObject({ sourceMessageId: 'text-source', senderName: '阿花', kind: 'text', text: '最初[微笑]', media: null })
    fireEvent.change(screen.getByLabelText('消息 1 内容'), { target: { value: '已修改' } })
    expect(currentMessages()[6].quote?.text).toBe('最初[微笑]')
    // A separate replace control allows re-snapshotting even the same source.
    fireEvent.click(within(reply).getByRole('button', { name: '重新选择引用' }))
    fireEvent.change(select, { target: { value: 'text-source' } })
    expect(currentMessages()[6].quote?.text).toBe('已修改')
    fireEvent.click(within(reply).getByRole('button', { name: '移除引用' }))
    expect(currentMessages()[6].quote).toBeNull()
    fireEvent.click(screen.getByText('测试撤销'))
    expect(currentMessages()[6].quote?.text).toBe('已修改')
  })
  it('normalizes a refunded transfer only when converting it to a red packet, then undoes in one step', () => {
    const payment = createMessage('self', { kind: 'payment', payment: { mode: 'transfer', amount: 25, note: '旧备注', status: 'refunded' } })
    render(<Editor messages={[payment]} />)

    fireEvent.change(screen.getByLabelText('消息 1 支付类型'), { target: { value: 'red-packet' } })
    expect(currentMessages()[0].payment).toEqual({ mode: 'red-packet', amount: 25, note: '旧备注', status: 'pending' })

    fireEvent.click(screen.getByText('测试撤销'))
    expect(currentMessages()[0].payment).toEqual({ mode: 'transfer', amount: 25, note: '旧备注', status: 'refunded' })
  })
  it('keeps last valid manual seconds for invalid edits and preserves hidden transcript', () => {
    render(<Editor messages={[createMessage('self', { kind: 'voice' })]} />)
    const input = screen.getByLabelText('消息 1 显示秒数')
    expect(input).toHaveValue(5)
    for (const invalid of ['0', '61', '1.5', '']) {
      fireEvent.change(input, { target: { value: invalid } })
      expect(screen.getByRole('alert')).toHaveTextContent('请输入 1–60 的整数秒数')
      expect(currentMessages()[0].voice?.durationSeconds).toBe(5)
    }
    for (const valid of ['1', '60']) {
      fireEvent.change(input, { target: { value: valid } })
      expect(currentMessages()[0].voice?.durationSeconds).toBe(Number(valid))
      expect(screen.queryByRole('alert')).toBeNull()
    }
    fireEvent.change(screen.getByLabelText('消息 1 手填转文字'), { target: { value: '内容[微笑]' } })
    fireEvent.click(screen.getByLabelText('消息 1 显示转文字'))
    fireEvent.click(screen.getByLabelText('消息 1 显示转文字'))
    expect(currentMessages()[0].voice).toMatchObject({ transcript: '内容[微笑]', showTranscript: false })
    expect(screen.getByLabelText('消息 1 手填转文字')).toHaveValue('内容[微笑]')
  })
  it('keeps the chosen image snapshot when its source changes type or is deleted', () => {
    const image = createMessage('p2', { id: 'picture', kind: 'image', media: { assetId: 'saved-image', fileName: 'photo.png', mimeType: 'image/png', width: 640, height: 480 } })
    render(<Editor messages={[image, createMessage('self', { id: 'reply', text: '图片回复' })]} />)
    fireEvent.click(within(screen.getByRole('article', { name: '消息 2' })).getByText('引用回复'))
    fireEvent.change(screen.getByLabelText('消息 2 引用来源'), { target: { value: 'picture' } })
    expect(currentMessages()[1].quote).toMatchObject({ kind: 'image', text: '', media: { assetId: 'saved-image', width: 640, height: 480 } })
    fireEvent.change(screen.getByLabelText('消息 1 类型'), { target: { value: 'text' } })
    expect(currentMessages()[1].quote?.media?.assetId).toBe('saved-image')
    fireEvent.click(screen.getByRole('button', { name: '删除消息 1' }))
    expect(currentMessages()[0].quote).toMatchObject({ sourceMessageId: null, senderName: '阿花', kind: 'image', media: { assetId: 'saved-image' } })
  })
  it.each([
    ['manual', 12, 122.3, 12],
    ['auto', 12, 122.3, 60],
    ['auto', 12, 7.2, 8],
    ['auto', 12, 0.1, 1],
  ] as const)('removing %s audio preserves or clamps display seconds and can be undone', (durationMode, durationSeconds, actualSeconds, expected) => {
    const message = createMessage('self', { kind: 'voice', media: { assetId: 'voice', fileName: 'audio.wav', mimeType: 'audio/wav', durationSeconds: actualSeconds }, voice: { durationMode, durationSeconds, transcript: '保留', showTranscript: true } })
    render(<Editor messages={[message]} />)
    fireEvent.click(screen.getByRole('button', { name: '移除' }))
    expect(currentMessages()[0]).toMatchObject({ media: null, voice: { durationMode: 'manual', durationSeconds: expected, transcript: '保留', showTranscript: true } })
    fireEvent.click(screen.getByText('测试撤销'))
    expect(currentMessages()[0].media?.durationSeconds).toBe(actualSeconds)
    expect(currentMessages()[0].voice?.durationMode).toBe(durationMode)
  })
  it('switches between manual and audio display without modifying the real attachment', () => {
    const message = createMessage('self', { kind: 'voice', media: { assetId: 'voice', fileName: 'audio.wav', mimeType: 'audio/wav', durationSeconds: 88.2 } })
    render(<Editor messages={[message]} />)
    const mode = screen.getByLabelText('消息 1 时长模式')
    fireEvent.change(mode, { target: { value: 'auto' } })
    expect(screen.getByText('音频显示 89 秒')).toBeInTheDocument()
    fireEvent.change(mode, { target: { value: 'manual' } })
    expect(screen.getByLabelText('消息 1 显示秒数')).toHaveValue(5)
    expect(currentMessages()[0].media?.durationSeconds).toBe(88.2)
  })
})
