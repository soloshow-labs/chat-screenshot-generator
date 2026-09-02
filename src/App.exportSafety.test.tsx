import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { SAMPLE_DRAFT } from './app/sampleDraft'
import type { MessageKind } from './app/chatTypes'
import { messageKindPatch } from './app/messageFactory'
import { DRAFT_STORAGE_KEY } from './services/draftStore'
import * as mediaProcessor from './services/mediaProcessor'
import * as avatarProcessor from './services/avatarProcessor'
import { saveMediaAsset } from './services/mediaAssetStore'
import { ExportResourceError } from './services/exportResourceError'

const exporter = vi.hoisted(() => vi.fn())
vi.mock('./services/exportChatImage', () => ({ exportChatImage: exporter }))
beforeEach(() => {
  localStorage.clear()
  exporter.mockReset().mockResolvedValue({ filename: 'chat.png', dataUrl: 'data:image/png;base64,x' })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('export snapshot safety', () => {
  it.each([
    [new ExportResourceError('emoji'), '导出失败：表情资源无法加载，请刷新后重试导出'],
    [new ExportResourceError('quote'), '导出失败：引用图片无法加载，请重新选择引用图片后重试导出'],
    [new Error('untrusted internal detail'), '导出失败，请减少消息数量后重试'],
  ])('shows controlled resource failures without exposing unknown errors: %s', async (error, notice) => {
    exporter.mockRejectedValue(error)
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '导出 PNG' }))
    await user.click(await screen.findByRole('button', { name: '继续导出' }))
    expect(await screen.findByText(notice)).toBeInTheDocument()
    expect(screen.queryByText('PNG 已导出')).not.toBeInTheDocument()
    expect(screen.queryByText('untrusted internal detail')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导出 PNG' })).toBeEnabled()
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
  })

  it.each([
    ['image', '上传图片', 'processImageFile', 'image/png'],
    ['voice', '上传语音', 'processAudioFile', 'audio/wav'],
    ['video', '上传视频', 'processVideoFile', 'video/mp4'],
    ['file', '上传文件', 'processFile', 'text/plain'],
  ] as const)('blocks export and replacements throughout a deferred %s replacement upload', async (kind, label, method, mimeType) => {
    const old = await saveMediaAsset(new File(['old'], 'old.bin', { type: mimeType }))
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...SAMPLE_DRAFT, messages: [{ ...SAMPLE_DRAFT.messages[0], ...messageKindPatch(kind), media: { assetId: old.id, fileName: 'old.bin', mimeType, width: 1, height: 1, durationSeconds: 1 } }] }))
    let finish!: () => void
    const metadata = { mimeType, width: 1, height: 1, durationSeconds: 1, sizeBytes: 3, expired: false }
    vi.spyOn(mediaProcessor, method).mockImplementation(() => new Promise<typeof metadata>(resolve => {
      finish = () => resolve(metadata)
    }))
    const user = userEvent.setup()
    render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: '消息', hidden: true }))
    await user.upload(screen.getByLabelText(`消息 1 ${label}`), new File(['new'], 'replacement.bin', { type: mimeType }))
    expect(screen.getByRole('button', { name: '导出 PNG' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '效率工具' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '重置' })).toBeDisabled()
    expect(exporter).not.toHaveBeenCalled()
    await act(async () => finish())
    await waitFor(() => expect(screen.getByRole('button', { name: '导出 PNG' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: '导出 PNG' }))
    await user.click(await screen.findByRole('button', { name: '继续导出' }))
    await waitFor(() => expect(exporter).toHaveBeenCalledOnce())
    await waitFor(() => expect(JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!).messages[0].media.fileName).toBe('replacement.bin'))
  })

  it.each([
    ['link', '消息 1 上传缩略图'], ['contact', '消息 1 上传名片头像'], ['video', '消息 1 上传视频封面'], ['text', '更换头像：小美'],
  ] as const)('tracks deferred inline image imports for %s', async (kind: MessageKind, label) => {
    const asset = await saveMediaAsset(new File(['old'], 'clip.mp4', { type: 'video/mp4' }))
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...SAMPLE_DRAFT, messages: [{ ...SAMPLE_DRAFT.messages[0], ...messageKindPatch(kind), ...(kind === 'video' ? { media: { assetId: asset.id, fileName: asset.fileName, mimeType: asset.mimeType } } : {}) }] }))
    let finish!: () => void
    const requiresCrop = kind === 'contact' || kind === 'text'
    const bitmap = { width: 800, height: 600, close: vi.fn() } as unknown as ImageBitmap
    const dataUrl = requiresCrop ? 'data:image/webp;base64,bmV3' : 'data:image/png;base64,bmV3'
    if (requiresCrop) {
      vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise<ImageBitmap>(resolve => { finish = () => resolve(bitmap) })))
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
      vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(dataUrl)
    } else vi.spyOn(avatarProcessor, 'processAvatar').mockImplementation(() => new Promise(resolve => { finish = () => resolve(dataUrl) }))
    const user = userEvent.setup()
    render(<App />)
    if (kind !== 'text') fireEvent.click(screen.getByRole('tab', { name: '消息', hidden: true }))
    await user.upload(screen.getByLabelText(label), new File(['new'], 'new.png', { type: 'image/png' }))
    expect(screen.getByRole('button', { name: '导出 PNG' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '效率工具' })).toBeDisabled()
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    await act(async () => finish())
    if (requiresCrop) {
      expect(screen.getByRole('button', { name: '导出 PNG' })).toBeDisabled()
      expect((await screen.findByRole('dialog', { name: '头像取景' })).closest('[inert]')).toBeNull()
      expect(localStorage.getItem(DRAFT_STORAGE_KEY)).not.toContain(dataUrl)
      await user.click(await screen.findByRole('button', { name: '确认头像' }))
      expect(bitmap.close).toHaveBeenCalledOnce()
    }
    await waitFor(() => expect(screen.getByRole('button', { name: '导出 PNG' })).toBeEnabled())
    await waitFor(() => expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toContain(dataUrl))
  })

  it.each(['设置', '消息'] as const)('measures actual overflow and long-image size when exporting from mobile %s', async tab => {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...SAMPLE_DRAFT, outputMode: 'long' }))
    const user = userEvent.setup()
    render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: tab, hidden: true }))
    const preview = screen.getByTestId('preview-panel'), canvas = screen.getByTestId('chat-canvas')
    expect(preview).toHaveAttribute('hidden')
    canvas.getBoundingClientRect = () => preview.hidden ? new DOMRect() : new DOMRect(0, 0, 215, 9000)
    screen.getByTestId('message-list').getBoundingClientRect = () => preview.hidden ? new DOMRect() : new DOMRect(0, 100, 230, 100)
    await user.click(screen.getByRole('button', { name: '导出 PNG' }))
    expect(await screen.findByText('聊天内容横向超出画布，请缩短内容或调整卡片')).toBeInTheDocument()
    expect(screen.getByText('长图预计高度超过 16000px')).toBeInTheDocument()
    expect(screen.getByText('最终像素超过 4000 万，导出可能较慢')).toBeInTheDocument()
    expect(preview).not.toHaveAttribute('hidden')
    expect(exporter).not.toHaveBeenCalled()
  })

  it('also prepares hidden mobile canvas for manual quality checks', async () => {
    const user = userEvent.setup()
    render(<App />)
    const preview = screen.getByTestId('preview-panel')
    screen.getByTestId('chat-canvas').getBoundingClientRect = () => preview.hidden ? new DOMRect() : new DOMRect(0, 0, 215, 450)
    screen.getByTestId('message-list').getBoundingClientRect = () => preview.hidden ? new DOMRect() : new DOMRect(0, 100, 230, 100)
    await user.click(screen.getByRole('button', { name: '效率工具' }))
    await user.click(await screen.findByRole('tab', { name: '质量检查' }))
    await user.click(screen.getByRole('button', { name: '运行质量检查' }))
    expect(await screen.findByText('聊天内容横向超出画布，请缩短内容或调整卡片')).toBeInTheDocument()
    expect(preview).not.toHaveAttribute('hidden')
  })
})
