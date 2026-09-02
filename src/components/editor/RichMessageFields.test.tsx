import 'fake-indexeddb/auto'
import { useReducer } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RichMessageFields } from './RichMessageFields'
import { MessageEditor } from './MessageEditor'
import { ChatCanvas } from '../chat/ChatCanvas'
import { SAMPLE_DRAFT } from '../../app/sampleDraft'
import { chatReducer } from '../../app/chatReducer'
import { createMessage } from '../../app/messageFactory'
import type { MessageKind } from '../../app/chatTypes'
import * as avatarProcessor from '../../services/avatarProcessor'
import { hasPendingMediaImports } from '../../hooks/useMediaImportActivity'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
function Editor({ kind }: { kind: MessageKind }) {
  const [draft, dispatch] = useReducer(chatReducer, { ...SAMPLE_DRAFT, messages: [createMessage('p2', { kind })] })
  return <><MessageEditor messages={draft.messages} participants={draft.participants} dispatch={dispatch} /><ChatCanvas draft={draft} exportMode={false} /></>
}
it('uploads local files, edits metadata and disables expired download', async () => {
  render(<Editor kind="file" />)
  fireEvent.change(screen.getByLabelText('消息 1 上传文件'), { target: { files: [new File(['hi'], 'a.txt', { type: 'text/plain' })] } })
  await screen.findByRole('link', { name: '下载文件' })
  fireEvent.change(screen.getByLabelText('消息 1 文件名称'), { target: { value: 'report.txt' } })
  expect(screen.getByRole('link', { name: '下载文件' })).toHaveAttribute('download', 'report.txt')
  fireEvent.click(screen.getByLabelText('消息 1 文件已过期'))
  expect(screen.queryByRole('link', { name: '下载文件' })).not.toBeInTheDocument()
})
it('shows size validation and preserves the empty attachment', async () => {
  render(<Editor kind="file" />)
  const file = new File(['x'], 'large.bin')
  Object.defineProperty(file, 'size', { value: 50 * 1024 * 1024 + 1 })
  fireEvent.change(screen.getByLabelText('消息 1 上传文件'), { target: { files: [file] } })
  expect(await screen.findByRole('alert')).toHaveTextContent('文件不能超过 50 MB')
  expect(screen.queryByLabelText('消息 1 文件名称')).not.toBeInTheDocument()
})
it('updates transfer amount and status while preserving the pending note and two-line card', () => {
  render(<Editor kind="payment" />)
  fireEvent.change(screen.getByLabelText('消息 1 金额'), { target: { value: '25.5' } })
  fireEvent.change(screen.getByLabelText('消息 1 转账备注'), { target: { value: '晚餐' } })
  const card = within(screen.getByTestId('chat-canvas').querySelector<HTMLElement>('[data-card-kind="payment"]')!)
  const statusField = screen.getByLabelText('消息 1 支付状态')
  expect(statusField).toHaveValue('pending')
  expect(card.getByRole('img', { name: '转账：待收款' })).toBeInTheDocument()
  expect(card.getByText('¥25.50')).toBeInTheDocument()
  expect(card.getByText('晚餐')).toBeInTheDocument()
  expect(card.queryByText('待收款')).not.toBeInTheDocument()
  for (const [status, text] of [['received', '已收款'], ['refunded', '已退还'], ['expired', '已过期']]) {
    fireEvent.change(statusField, { target: { value: status } })
    expect(statusField).toHaveValue(status)
    expect(card.getByRole('img', { name: `转账：${text}` })).toBeInTheDocument()
    expect(card.getByText(text)).toBeInTheDocument()
    expect(card.queryByText('晚餐')).not.toBeInTheDocument()
    expect(card.getByText('¥25.50').parentElement?.children).toHaveLength(2)
    expect(screen.getByLabelText('消息 1 转账备注')).toHaveValue('晚餐')
  }
  fireEvent.change(statusField, { target: { value: 'pending' } })
  expect(statusField).toHaveValue('pending')
  expect(card.getByRole('img', { name: '转账：待收款' })).toBeInTheDocument()
  expect(card.getByText('晚餐')).toBeInTheDocument()
  expect(card.getByText('¥25.50').parentElement?.children).toHaveLength(2)
  expect(card.queryByText('待收款')).not.toBeInTheDocument()
  expect(screen.getByLabelText('消息 1 金额')).toHaveValue(25.5)
})
it('labels the transfer note and red-packet greeting separately while explaining screenshot-only payment details', () => {
  const view = render(<Editor kind="payment" />)
  expect(screen.getByLabelText('消息 1 转账备注')).toBeInTheDocument()
  expect(screen.getByText('红包金额不会显示在截图中；已处理的转账卡片不会显示转账备注，但会保留在项目中。')).toBeInTheDocument()
  const type = screen.getByLabelText('消息 1 支付类型')
  fireEvent.change(type, { target: { value: 'red-packet' } })
  expect(screen.getByLabelText('消息 1 红包祝福语')).toBeInTheDocument()
  expect(screen.getByLabelText('消息 1 金额（红包截图不显示）')).toHaveValue(0)
  expect(screen.queryByRole('option', { name: '已退还（历史兼容）' })).not.toBeInTheDocument()
  view.unmount()
  render(<RichMessageFields message={createMessage('p2', { kind: 'payment', payment: { mode: 'red-packet', amount: 0, note: '', status: 'refunded' } })} number={1} dispatch={vi.fn()} />)
  expect(screen.getByRole('option', { name: '已退还（历史兼容）' })).toHaveValue('refunded')
})
it('keeps intervening link edits when a thumbnail finishes processing', async () => {
  let finish!: (data: string) => void
  vi.spyOn(avatarProcessor, 'processAvatar').mockImplementation(() => new Promise(resolve => { finish = resolve }))
  render(<Editor kind="link" />)
  fireEvent.change(screen.getByLabelText('消息 1 上传缩略图'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } })
  fireEvent.change(screen.getByLabelText('消息 1 链接标题'), { target: { value: '保留新标题' } })
  await act(async () => finish('data:image/png;base64,eA=='))
  expect(screen.getByLabelText('消息 1 链接标题')).toHaveValue('保留新标题')
  expect(screen.getByAltText('链接缩略图')).toHaveAttribute('src', 'data:image/png;base64,eA==')
})
it('does not dispatch a thumbnail after unmount', async () => {
  let finish!: (data: string) => void
  vi.spyOn(avatarProcessor, 'processAvatar').mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const dispatch = vi.fn()
  const view = render(<RichMessageFields message={createMessage('p2', { kind: 'link' })} number={1} dispatch={dispatch} />)
  fireEvent.change(screen.getByLabelText('消息 1 上传缩略图'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } })
  await waitFor(() => expect(finish).toBeTypeOf('function'))
  view.unmount()
  await act(async () => finish('data:image/png;base64,eA=='))
  expect(dispatch).not.toHaveBeenCalled()
})

function avatarCanvas() {
  const close = vi.fn()
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 800, height: 400, close }))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/webp;base64,YQ==')
  return close
}
it('defers a contact avatar update until confirm and preserves the latest name and description', async () => {
  const close = avatarCanvas()
  const dispatch = vi.fn()
  const message = createMessage('p2', { kind: 'contact' })
  const view = render(<RichMessageFields message={message} number={1} dispatch={dispatch} />)
  fireEvent.change(screen.getByLabelText('消息 1 上传名片头像'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } })
  expect(await screen.findByRole('dialog', { name: '头像取景' })).toBeInTheDocument()
  expect(dispatch).not.toHaveBeenCalled()
  expect(hasPendingMediaImports()).toBe(true)
  const latest = { ...message, contactCard: { ...message.contactCard!, name: '新姓名', description: '新描述' } }
  view.rerender(<RichMessageFields message={latest} number={1} dispatch={dispatch} />)
  const confirm = screen.getByRole('button', { name: '确认头像' })
  await waitFor(() => expect(confirm).toBeEnabled())
  fireEvent.click(confirm)
  expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: 'update-message', messageId: message.id, separateHistory: true, patch: { contactCard: { name: '新姓名', description: '新描述', avatarDataUrl: 'data:image/webp;base64,YQ==' } } })
  expect(hasPendingMediaImports()).toBe(false)
  expect(close).toHaveBeenCalledOnce()
})
it('cancels contact cropping without changing the current avatar', async () => {
  avatarCanvas()
  const dispatch = vi.fn()
  render(<RichMessageFields message={createMessage('p2', { kind: 'contact' })} number={1} dispatch={dispatch} />)
  const input = screen.getByLabelText('消息 1 上传名片头像') as HTMLInputElement
  fireEvent.change(input, { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } })
  fireEvent.click(await screen.findByRole('button', { name: '取消' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(input.value).toBe('')
  expect(dispatch).not.toHaveBeenCalled()
  expect(hasPendingMediaImports()).toBe(false)
})
it('closes contact cropping on a target change and disposes its late decode', async () => {
  const close = avatarCanvas()
  let finish!: (bitmap: ImageBitmap) => void
  vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise<ImageBitmap>(resolve => { finish = resolve })))
  const dispatch = vi.fn()
  const view = render(<RichMessageFields message={createMessage('p2', { kind: 'contact' })} number={1} dispatch={dispatch} />)
  fireEvent.change(screen.getByLabelText('消息 1 上传名片头像'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } })
  await waitFor(() => expect(finish).toBeTypeOf('function'))
  view.rerender(<RichMessageFields message={createMessage('p2', { kind: 'link' })} number={1} dispatch={dispatch} />)
  await act(async () => finish({ width: 800, height: 400, close } as unknown as ImageBitmap))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(dispatch).not.toHaveBeenCalled()
  expect(close).toHaveBeenCalledOnce()
  expect(hasPendingMediaImports()).toBe(false)
})
