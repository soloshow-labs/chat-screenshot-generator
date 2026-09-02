import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SAMPLE_DRAFT } from '../../app/sampleDraft'
import { ProductivityDialog } from './ProductivityDialog'
import * as projectFile from '../../services/projectFile'
import { cleanupUnreferencedMediaAssets, getMediaAsset, saveMediaAsset } from '../../services/mediaAssetStore'
import type { ChatDraft } from '../../app/chatTypes'

function renderDialog(overrides: Partial<Omit<React.ComponentProps<typeof ProductivityDialog>, 'onApply' | 'onClose' | 'onBusy'>> = {}) {
  const props = { draft: structuredClone(SAMPLE_DRAFT), getCanvas: () => null, onApply: vi.fn(), onClose: vi.fn(), onBusy: vi.fn(), includeProjectFiles: true, ...overrides }
  return { ...render(<ProductivityDialog {...props} />), props }
}
afterEach(() => vi.restoreAllMocks())

describe('ProductivityDialog', () => {
  it('keeps project files out of the normal efficiency-tool dialog', () => {
    render(<ProductivityDialog draft={structuredClone(SAMPLE_DRAFT)} getCanvas={() => null} onApply={vi.fn()} onClose={vi.fn()} onBusy={vi.fn()} />)
    expect(screen.queryByRole('tab', { name: '项目文件' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '批量脚本' })).toHaveAttribute('aria-selected', 'true')
  })
  it('rejects oversized files before FileReader and leaves the draft unchanged', async () => {
    const user = userEvent.setup(), { props } = renderDialog()
    const reader = vi.spyOn(FileReader.prototype, 'readAsText')
    const file = new File(['{}'], 'huge.json', { type: 'application/json' })
    Object.defineProperty(file, 'size', { value: 151 * 1024 * 1024 })
    await user.upload(screen.getByLabelText('导入项目 JSON'), file)
    expect(await screen.findByRole('alert')).toHaveTextContent('150 MB')
    expect(reader).not.toHaveBeenCalled()
    expect(props.onApply).not.toHaveBeenCalled()
  })

  it('imports a portable project with fresh identity in exactly one replacement', async () => {
    const json = await projectFile.serializeProject({ ...SAMPLE_DRAFT, title: '迁移成功' })
    const user = userEvent.setup(), { props } = renderDialog()
    await user.upload(screen.getByLabelText('导入项目 JSON'), new File([json], 'chat.json', { type: 'application/json' }))
    await screen.findByText('项目已导入')
    expect(props.onApply).toHaveBeenCalledTimes(1)
    const next = props.onApply.mock.calls[0][0] as ChatDraft
    expect(next.title).toBe('迁移成功')
    expect(next.participants[0].id).not.toBe(SAMPLE_DRAFT.participants[0].id)
  })

  it('preflights large exports before serialization and downloads only after confirmation', async () => {
    const user = userEvent.setup()
    // Size estimation is the slow/storage boundary; serialization remains real.
    vi.spyOn(projectFile, 'estimateProjectExportSize').mockResolvedValue(51 * 1024 * 1024)
    const serialize = vi.spyOn(projectFile, 'serializeProject')
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:project')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    renderDialog()
    await user.click(screen.getByRole('button', { name: '导出项目 JSON' }))
    expect(await screen.findByRole('button', { name: '继续导出项目' })).toBeEnabled()
    expect(serialize).not.toHaveBeenCalled()
    expect(click).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '继续导出项目' }))
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
    expect(create.mock.calls[0][0]).toBeInstanceOf(Blob)
  })

  it.each(['media', 'quote', 'wallpaper'] as const)('locks conflicting controls and releases only abandoned fresh %s assets on unmount', async position => {
    const old = await saveMediaAsset(new File(['old'], 'old.png', { type: 'image/png' }))
    const fresh = await saveMediaAsset(new File(['new'], 'new.png', { type: 'image/png' }))
    const media = (asset: typeof old) => ({ assetId: asset.id, fileName: asset.fileName, mimeType: asset.mimeType })
    const draft: ChatDraft = { ...SAMPLE_DRAFT, messages: [{ ...SAMPLE_DRAFT.messages[0], media: media(old) }] }
    let complete!: (draft: ChatDraft) => void
    vi.spyOn(projectFile, 'importProject').mockImplementation(() => new Promise(resolve => { complete = resolve }))
    const user = userEvent.setup(), { props, unmount } = renderDialog({ draft })
    await user.upload(screen.getByLabelText('导入项目 JSON'), new File(['{}'], 'chat.json', { type: 'application/json' }))
    await waitFor(() => expect(complete).toBeTypeOf('function'))
    expect(screen.getByRole('button', { name: '关闭效率工具' })).toBeDisabled()
    expect(screen.getByRole('tab', { name: '场景模板' })).toBeDisabled()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(props.onClose).not.toHaveBeenCalled()
    unmount()
    await act(async () => complete({
      ...draft,
      ...(position === 'wallpaper' ? { wallpaper: { type: 'image' as const, media: media(fresh) } } : {}),
      messages: [...draft.messages, { ...SAMPLE_DRAFT.messages[1], ...(position === 'media' ? { media: media(fresh) } : position === 'quote' ? { quote: { sourceMessageId: null, senderName: '旧成员', kind: 'image' as const, text: '', media: { ...media(fresh), width: 20, height: 20 } } } : {}) }],
    }))
    expect(props.onApply).not.toHaveBeenCalled()
    await cleanupUnreferencedMediaAssets(new Set())
    expect(await getMediaAsset(fresh.id)).toBeNull()
    expect(await getMediaAsset(old.id)).not.toBeNull()
  })

  it('previews script errors and applies insert/replace with configured timestamps', async () => {
    const user = userEvent.setup(), { props } = renderDialog()
    await user.click(screen.getByRole('tab', { name: '批量脚本' }))
    fireEvent.change(screen.getByLabelText('聊天脚本'), { target: { value: '孤立续行\n新成员：测试' } })
    expect(screen.getByRole('alert')).toHaveTextContent('第 1 行')
    expect(screen.getByRole('button', { name: '应用脚本' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('聊天脚本'), { target: { value: '新成员：第一条\n新成员：第二条' } })
    await user.selectOptions(screen.getByLabelText('应用方式'), 'insert')
    await user.selectOptions(screen.getByLabelText('插入位置'), 'm2')
    fireEvent.change(screen.getByLabelText('起始时间'), { target: { value: '2026-08-31T12:00' } })
    fireEvent.change(screen.getByLabelText('消息间隔（分钟）'), { target: { value: '3' } })
    await user.click(screen.getByRole('button', { name: '应用脚本' }))
    const inserted = props.onApply.mock.calls[0][0] as ChatDraft
    expect(inserted.messages.slice(2, 4).map(message => message.text)).toEqual(['第一条', '第二条'])
    expect(new Date(inserted.messages[3].sentAt).getTime() - new Date(inserted.messages[2].sentAt).getTime()).toBe(180000)
    await user.selectOptions(screen.getByLabelText('应用方式'), 'replace')
    await user.click(screen.getByRole('button', { name: '应用脚本' }))
    expect((props.onApply.mock.calls[1][0] as ChatDraft).messages).toHaveLength(2)
  })

  it('previews rich message kinds and blocks unsafe or malformed media commands', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('tab', { name: '批量脚本' }))
    fireEvent.change(screen.getByLabelText('聊天脚本'), { target: { value: '10:30\n小美：[图片]\n我：[语音 8s] 马上到\n我：[转账 52.00] 晚饭' } })
    expect(screen.getByText(/新增成员 0 位/)).toBeInTheDocument()
    expect(screen.getByRole('list', { name: '脚本预览' })).toHaveTextContent('10:30 小美 图片')
    expect(screen.getByRole('list', { name: '脚本预览' })).toHaveTextContent('我 语音 8 秒')
    expect(screen.getByRole('list', { name: '脚本预览' })).toHaveTextContent('我 转账 ¥52.00')
    fireEvent.change(screen.getByLabelText('聊天脚本'), { target: { value: '小美：[图片]https://example.com/a.png' } })
    expect(screen.getByRole('alert')).toHaveTextContent('本地占位')
    expect(screen.getByRole('button', { name: '应用脚本' })).toBeDisabled()
  })

  it('runs quality checks and supports tab arrow navigation and Escape', async () => {
    const user = userEvent.setup(), { props } = renderDialog()
    await user.click(screen.getByRole('tab', { name: '场景模板' }))
    fireEvent.keyDown(screen.getByRole('tab', { name: '场景模板' }), { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: '质量检查' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: '运行质量检查' }))
    await screen.findByText('小美没有上传自定义头像')
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledOnce()
  })
})
