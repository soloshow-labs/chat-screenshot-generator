import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useChatDraft } from '../../app/useChatDraft'
import { SAMPLE_DRAFT } from '../../app/sampleDraft'
import { createMessage } from '../../app/messageFactory'
import { DRAFT_STORAGE_KEY, loadDraft } from '../../services/draftStore'
import { RichMessageFields } from './RichMessageFields'
import { SettingsPanel } from './SettingsPanel'
import { MessageEditor } from './MessageEditor'

function Editor() {
  const { draft, dispatch } = useChatDraft()
  return <>{draft.messages[0]?.kind === 'call' ? <MessageEditor messages={draft.messages} participants={draft.participants} dispatch={dispatch} /> : <RichMessageFields message={draft.messages[0]} number={1} dispatch={dispatch} />}<SettingsPanel draft={draft} messages={draft.messages} dispatch={dispatch} onRequestConversationTypeChange={() => {}} /></>
}

afterEach(() => { vi.useRealTimers(); localStorage.clear() })

it.each(['1e308', '1e20'])('rejects overflowing call hours without losing the saved project: %s', async value => {
  vi.useFakeTimers()
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...SAMPLE_DRAFT, title: '通话项目', messages: [createMessage('self', { kind: 'call', call: { mode: 'voice', status: 'duration', durationSeconds: 3661 } })] }))
  render(<Editor />)
  fireEvent.change(screen.getByLabelText('消息 1 通话小时'), { target: { value } })
  fireEvent.change(screen.getByLabelText('聊天标题'), { target: { value: '必须保留' } })
  await act(async () => { vi.advanceTimersByTime(450) })
  const restored = loadDraft(localStorage)
  expect(restored.title).toBe('必须保留')
  expect(restored.messages[0].call?.durationSeconds).toBe(3661)
  expect(screen.getByLabelText('消息 1 通话小时')).toHaveValue(1)
  expect(screen.getByRole('alert')).toHaveTextContent('通话时长超出有效范围')
  fireEvent.change(screen.getByLabelText('消息 1 通话小时'), { target: { value: '2' } })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it.each([
  ['文件大小（字节）', '4.5', 'sizeBytes', 5],
  ['视频时长（秒）', '', 'durationSeconds', 2],
  ['视频时长（秒）', '0', 'durationSeconds', 2],
  ['输出宽度', '430.5', 'outputWidth', 431],
  ['输出高度', '932.5', 'outputHeight', 933],
] as const)('keeps the project through edit, autosave and reload: %s=%s', async (label, value, field, expected) => {
  vi.useFakeTimers()
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...SAMPLE_DRAFT, title: '必须保留的项目', messages: [createMessage('self', { kind: 'video', media: { assetId: 'video', fileName: 'clip.mp4', mimeType: 'video/mp4', sizeBytes: 4, durationSeconds: 2 } })] }))
  const view = render(<Editor />)
  fireEvent.change(screen.getByLabelText('聊天标题'), { target: { value: '编辑后项目' } })
  const inputLabel = label.startsWith('输出') ? label : `消息 1 ${label}`
  fireEvent.change(screen.getByLabelText(inputLabel), { target: { value } })
  await act(async () => { vi.advanceTimersByTime(450) })
  const restored = loadDraft(localStorage)
  expect(restored.title).toBe('编辑后项目')
  const actual = field === 'outputWidth' || field === 'outputHeight' ? restored[field] : restored.messages[0].media![field]
  expect(actual).toBe(expected)
  view.unmount()
  render(<Editor />)
  expect(screen.getByLabelText('聊天标题')).toHaveValue('编辑后项目')
  expect(screen.getByLabelText(inputLabel)).toHaveValue(expected)
})
