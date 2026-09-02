import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { SAMPLE_DRAFT } from './app/sampleDraft'
import { DRAFT_STORAGE_KEY } from './services/draftStore'
import { ExportResourceError } from './services/exportResourceError'

const renderPng = vi.hoisted(() => vi.fn())
vi.mock('./services/exportChatImage', () => ({ exportChatImage: renderPng }))
const png = { filename: '聊天.png', dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlS8AAAAASUVORK5CYII=' }
class TestClipboardItem {
  constructor(private data: Record<string, Promise<Blob>>) {}
  getType(type: string) { return this.data[type] }
}
const written: Blob[] = []
const write = vi.fn(async (items: TestClipboardItem[]) => { written.push(await items[0].getType('image/png')) })
function seed(warnings = false) {
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
    ...SAMPLE_DRAFT,
    participants: SAMPLE_DRAFT.participants.map(participant => ({ ...participant, avatarDataUrl: warnings ? null : png.dataUrl })),
    messages: [SAMPLE_DRAFT.messages[0]],
  }))
}
beforeEach(() => {
  localStorage.clear()
  written.length = 0
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('ClipboardItem', TestClipboardItem)
  vi.stubGlobal('navigator', { clipboard: { write }, userAgent: navigator.userAgent })
  write.mockClear().mockImplementation(async items => { written.push(await items[0].getType('image/png')) })
  renderPng.mockReset().mockResolvedValue(png)
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  seed()
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('App PNG clipboard delivery', () => {
  it('writes an image in the original click, then reports success only after native completion', async () => {
    let finish!: () => void
    write.mockImplementationOnce(async items => {
      const blob = await items[0].getType('image/png')
      await new Promise<void>(resolve => { finish = resolve })
      written.push(blob)
    })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '复制 PNG' }))
    expect(write).toHaveBeenCalledOnce()
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    expect(screen.queryByText('PNG 已复制')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导出 PNG' })).toBeDisabled()
    await act(async () => finish())
    expect(await screen.findByText('PNG 已复制')).toBeInTheDocument()
    expect(written[0].type).toBe('image/png')
    expect(written[0].size).toBeGreaterThan(8)
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '导出 PNG' })).toBeEnabled()
  })

  it('keeps warning confirmation as copy and does not render or deliver the paused attempt', async () => {
    seed(true)
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '复制 PNG' }))
    const dialog = await screen.findByRole('dialog', { name: '复制前检查' })
    const confirm = await screen.findByRole('button', { name: '继续复制' })
    await waitFor(() => expect(confirm).toBeEnabled())
    expect(dialog).not.toHaveTextContent('效率工具')
    expect(screen.queryByRole('tablist', { name: '效率工具分类' })).not.toBeInTheDocument()
    expect(renderPng).not.toHaveBeenCalled()
    expect(written).toHaveLength(0)
    expect(screen.queryByText('无法复制图片，请使用导出 PNG')).not.toBeInTheDocument()
    fireEvent.click(confirm)
    expect(write).toHaveBeenCalledTimes(2)
    expect(await screen.findByText('PNG 已复制')).toBeInTheDocument()
    expect(written).toHaveLength(1)
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
  })

  it('revalidates a changed draft instead of copying a stale warning snapshot', async () => {
    seed(true)
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '复制 PNG' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '继续复制' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: '清空消息', hidden: true }))
    fireEvent.click(screen.getByRole('button', { name: '确认清空消息', hidden: true }))
    fireEvent.click(screen.getByRole('button', { name: '继续复制' }))
    await screen.findByText('截图范围内没有消息')
    expect(screen.queryByRole('button', { name: '继续复制' })).not.toBeInTheDocument()
    expect(renderPng).not.toHaveBeenCalled()
    expect(written).toHaveLength(0)
  })

  it('cancels warning confirmation and resets the next action to download', async () => {
    seed(true)
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '复制 PNG' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '关闭复制前检查' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: '关闭复制前检查' }))
    fireEvent.click(screen.getByRole('button', { name: '导出 PNG' }))
    expect(await screen.findByRole('dialog', { name: '导出前检查' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: '继续导出' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: '继续导出' }))
    await screen.findByText('PNG 已导出')
    expect(written).toHaveLength(0)
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce()
  })

  it('keeps both actions locked until cleanup after early permission denial and ignores repeated clicks', async () => {
    let finish!: (result: typeof png) => void
    renderPng.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    write.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'))
    render(<App />)
    const copy = screen.getByRole('button', { name: '复制 PNG' })
    fireEvent.click(copy); fireEvent.click(copy)
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    expect(screen.getByRole('button', { name: '导出 PNG' })).toBeDisabled()
    expect(write).toHaveBeenCalledOnce()
    expect(screen.queryByText('无法复制图片，请使用导出 PNG')).not.toBeInTheDocument()
    await act(async () => finish(png))
    await screen.findByText('无法复制图片，请使用导出 PNG')
    expect(screen.getByRole('button', { name: '导出 PNG' })).toBeEnabled()
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
    expect(screen.queryByText('PNG 已复制')).not.toBeInTheDocument()
  })

  it('preserves resource errors and restores controls without any delivery', async () => {
    renderPng.mockRejectedValueOnce(new ExportResourceError('map'))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '复制 PNG' }))
    await screen.findByText('导出失败：地图截图无法加载，请重新上传有效图片')
    expect(screen.getByRole('button', { name: '复制 PNG' })).toBeEnabled()
    expect(written).toHaveLength(0)
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
  })

  it('does not render or download when image clipboard support is absent', async () => {
    vi.stubGlobal('ClipboardItem', undefined)
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '复制 PNG' }))
    await screen.findByText('无法复制图片，请使用导出 PNG')
    expect(screen.getByRole('button', { name: '导出 PNG' })).toBeEnabled()
    expect(renderPng).not.toHaveBeenCalled()
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
  })

  it('does not write a completed image after the app unmounts during rendering', async () => {
    let finish!: (result: typeof png) => void
    renderPng.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const { unmount } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '复制 PNG' }))
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    unmount()
    await act(async () => finish(png))
    expect(written).toHaveLength(0)
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
  })
})
