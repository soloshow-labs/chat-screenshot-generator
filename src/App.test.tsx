import 'fake-indexeddb/auto'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { SAMPLE_DRAFT } from './app/sampleDraft'
import { DRAFT_STORAGE_KEY } from './services/draftStore'
import { getMediaAsset, releaseMediaAssets, saveMediaAsset } from './services/mediaAssetStore'

const exportMocks = vi.hoisted(() => ({ exportChatImage: vi.fn() }))
vi.mock('./services/exportChatImage', () => ({ exportChatImage: exportMocks.exportChatImage }))

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear()
    exportMocks.exportChatImage.mockReset().mockResolvedValue({
      filename: '聊天.png',
      dataUrl: 'data:image/png;base64,abc',
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  })

  it('renders the tool name', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: '聊天截图生成器' })).toBeInTheDocument()
    expect(screen.getByTestId('brand-icon')).toHaveAttribute('src', '/favicon.svg')
    expect(screen.getByRole('button', { name: '导出 PNG' })).toBeInTheDocument()
  })

  it('opens the public project repository in a new tab', () => {
    render(<App />)
    expect(screen.getByRole('link', { name: '在 GitHub 查看项目' })).toHaveAttribute(
      'href',
      'https://github.com/soloshow-labs/chat-screenshot-generator',
    )
    expect(screen.getByRole('link', { name: '在 GitHub 查看项目' })).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: '在 GitHub 查看项目' })).toHaveAttribute('rel', 'noreferrer')
  })

  it('explains browser-local storage without displaying a permanent warning', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(await screen.findByText('已保存到此浏览器')).toHaveAttribute('role', 'status')
    const disclosure = screen.getByText('存储说明')
    expect(disclosure.closest('details')).not.toHaveAttribute('open')
    await user.click(disclosure)
    expect(disclosure.closest('details')).toHaveAttribute('open')
    expect(screen.getByText(/清除本站数据会删除这些内容/)).toBeVisible()
    expect(screen.getByText(/不会自动同步到云端或其他设备/)).toBeVisible()
    expect(screen.getByText(/备份文件包含消息、头像和原始媒体/)).toBeVisible()
    await user.click(disclosure)
    expect(disclosure.closest('details')).not.toHaveAttribute('open')
  })

  it('opens a distinct project manager after visiting the efficiency tools', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '效率工具' }))
    await user.click(await screen.findByRole('tab', { name: '质量检查' }))
    await user.click(screen.getByRole('button', { name: '关闭效率工具' }))

    const projects = screen.getByRole('button', { name: '项目' })
    await waitFor(() => expect(projects).toBeEnabled())
    await user.click(projects)
    expect(await screen.findByRole('dialog', { name: '本地项目' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist', { name: '效率工具分类' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导出项目 JSON' })).toBeEnabled()
    expect(screen.getByLabelText('导入项目 JSON')).toBeInTheDocument()
    expect(projects).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '关闭' }))
    expect(projects).toBeEnabled()
    expect(projects).toHaveFocus()
  })

  it('updates the local-save status after editing and persists the draft', async () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('聊天标题'), { target: { value: '本地保存测试' } })
    expect(screen.getByText('正在保存…')).toBeInTheDocument()
    await screen.findByText('已保存到此浏览器')
    expect(JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!)).toMatchObject({ title: '本地保存测试' })
  })

  it('keeps backup available when browser storage is full', async () => {
    const user = userEvent.setup()
    render(<App />)
    const failSave = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage is full', 'QuotaExceededError')
    })
    try {
      fireEvent.change(screen.getByLabelText('聊天标题'), { target: { value: '尚未保存的草稿' } })
      await screen.findByText('保存失败')
      expect(screen.getByText(/请先备份项目，暂勿关闭页面/)).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: '项目' }))
      expect(await screen.findByRole('button', { name: '导出项目 JSON' })).toBeEnabled()
      expect(screen.getByLabelText('聊天标题')).toHaveValue('尚未保存的草稿')
    } finally {
      failSave.mockRestore()
    }
  })

  it('places member management before screenshot and advanced settings', () => {
    render(<App />)

    const memberHeading = screen.getByRole('heading', { name: '成员列表' })
    const exportHeading = screen.getByRole('heading', { name: '截图与导出' })
    expect(memberHeading.compareDocumentPosition(exportHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('手机状态栏').closest('details')).not.toHaveAttribute('open')
    expect(screen.getByText('高级输出设置').closest('details')).not.toHaveAttribute('open')
  })

  it('switches mobile workspaces and clamps preview zoom', async () => {
    const user = userEvent.setup()
    render(<App />)

    fireEvent.click(screen.getByRole('tab', { name: '预览', hidden: true }))
    expect(screen.getByTestId('preview-panel')).not.toHaveAttribute('hidden')
    const zoomIn = screen.getByRole('button', { name: '放大预览' })
    const zoomOut = screen.getByRole('button', { name: '缩小预览' })
    for (let index = 0; index < 8; index += 1) await user.click(zoomIn)
    expect(screen.getByLabelText('预览缩放')).toHaveTextContent('120%')
    for (let index = 0; index < 12; index += 1) await user.click(zoomOut)
    expect(screen.getByLabelText('预览缩放')).toHaveTextContent('60%')
  })

  it('locates a preview message in the editor without changing the draft or undo history', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: '预览', hidden: true }))
    fireEvent.click(screen.getByRole('button', { name: '定位编辑' }))
    fireEvent.click(screen.getByRole('button', { name: '定位消息 2 到编辑器' }))

    expect(screen.getByRole('tab', { name: '消息', hidden: true })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('article', { name: '消息 2' })).toHaveFocus()
    expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled()
    expect(screen.getByLabelText('消息 2 内容', { exact: true })).toHaveValue(SAMPLE_DRAFT.messages[1].text)

    fireEvent.click(screen.getByRole('tab', { name: '预览', hidden: true }))
    expect(screen.getByRole('button', { name: '定位编辑' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: '定位编辑' }))
    fireEvent.click(screen.getByRole('button', { name: '定位消息 2 到编辑器' }))
    expect(screen.getByRole('article', { name: '消息 2' })).toHaveFocus()
  })

  it('confirms reset before restoring the sample draft', async () => {
    const user = userEvent.setup()
    render(<App />)
    const title = screen.getByLabelText('聊天标题')
    await user.clear(title)
    await user.type(title, '临时标题')
    await user.click(screen.getByRole('button', { name: '重置' }))
    expect(screen.getByRole('dialog', { name: '重置全部内容？' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认重置' }))
    expect(screen.getByLabelText('聊天标题')).toHaveValue('仙女驻凡大使馆')
  })

  it('resets custom output mode and closes advanced output settings', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.selectOptions(screen.getByLabelText('设备预设'), 'custom')
    expect(screen.getByText('高级输出设置').closest('details')).toHaveAttribute('open')

    await user.click(screen.getByRole('button', { name: '重置' }))
    await user.click(screen.getByRole('button', { name: '确认重置' }))

    expect(screen.getByLabelText('设备预设')).toHaveValue('iphone-15-pro-max')
    expect(screen.getByText('高级输出设置').closest('details')).not.toHaveAttribute('open')
  })

  it('offers a deletion choice for members with messages', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '删除成员：阿花' }))
    expect(screen.getByRole('dialog', { name: '删除成员“阿花”？' })).toBeInTheDocument()
    expect(screen.getByLabelText('处理阿花的消息')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认删除成员' }))
    expect(screen.queryByLabelText('昵称：阿花')).not.toBeInTheDocument()
  })

  it('requires a counterpart when switching a group to direct chat', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '单聊' }))
    expect(screen.getByRole('dialog', { name: '切换为单聊？' })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('保留联系人'), 'p3')
    await user.click(screen.getByRole('button', { name: '确认切换单聊' }))
    expect(screen.getByRole('button', { name: '单聊' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('仙女驻凡大使馆')).toBeInTheDocument()
    expect(screen.queryByText('仙女驻凡大使馆 (2)')).not.toBeInTheDocument()
  })

  it('disables export while running and restores it after failure', async () => {
    const user = userEvent.setup()
    let rejectExport!: (error: Error) => void
    exportMocks.exportChatImage.mockReturnValue(new Promise((_, reject) => { rejectExport = reject }))
    render(<App />)

    await user.click(screen.getByRole('button', { name: '导出 PNG' }))
    await user.click(await screen.findByRole('button', { name: '继续导出' }))
    expect(screen.getByRole('button', { name: '导出中…' })).toBeDisabled()
    await waitFor(() => expect(exportMocks.exportChatImage).toHaveBeenCalledOnce())
    rejectExport(new Error('too tall'))
    await waitFor(() => expect(screen.getByRole('button', { name: '导出 PNG' })).toBeEnabled())
    expect(screen.getByText('导出失败，请减少消息数量后重试')).toBeInTheDocument()
  })

  it('applies script as one undoable action and preserves native modal undo', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '效率工具' }))
    for (const name of ['批量脚本', '场景模板', '质量检查']) expect(await screen.findByRole('tab', { name })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '项目文件' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '批量脚本' }))
    await user.type(screen.getByLabelText('聊天脚本'), '新朋友：测试导入')
    expect(screen.getByText(/解析 1 条消息/)).toBeInTheDocument()
    fireEvent.keyDown(screen.getByLabelText('聊天脚本'), { key: 'z', ctrlKey: true })
    expect(screen.getByLabelText('聊天脚本')).toHaveValue('新朋友：测试导入')
    await user.click(screen.getByRole('button', { name: '应用脚本' }))
    await user.click(screen.getByRole('button', { name: '关闭效率工具' }))
    expect(screen.getByLabelText('昵称：新朋友')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '撤销' }))
    expect(screen.queryByLabelText('昵称：新朋友')).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })
    expect(screen.getByLabelText('昵称：新朋友')).toBeInTheDocument()
  })

  it('shows project upload errors without replacing and confirms templates', async () => {
    const user = userEvent.setup()
    render(<App />)
    const projects = screen.getByRole('button', { name: '项目' })
    await waitFor(() => expect(projects).toBeEnabled())
    await user.click(projects)
    await user.click(await screen.findByText('项目 JSON 备份与恢复'))
    await user.upload(screen.getByLabelText('导入项目 JSON'), new File(['invalid'], 'broken.json', { type: 'application/json' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('JSON')
    await user.click(screen.getByRole('button', { name: '关闭' }))
    await user.click(screen.getByRole('button', { name: '效率工具' }))
    await user.click(screen.getByRole('tab', { name: '场景模板' }))
    await user.click(screen.getByRole('button', { name: '应用两人日常单聊' }))
    expect(screen.getByText(/将替换当前成员和消息/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认应用模板' }))
    await screen.findByText('模板已应用')
    await user.click(screen.getByRole('button', { name: '关闭效率工具' }))
    expect(screen.getByRole('button', { name: '单聊' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: '撤销' }))
    expect(screen.getByLabelText('聊天标题')).toHaveValue('仙女驻凡大使馆')
  })

  it('blocks export errors instead of offering warning override', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...SAMPLE_DRAFT, messages: [] }))
    render(<App />)
    await user.click(screen.getByRole('button', { name: '导出 PNG' }))
    expect(await screen.findByText('截图范围内没有消息')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '继续导出' })).not.toBeInTheDocument()
    expect(exportMocks.exportChatImage).not.toHaveBeenCalled()
  })

  it('rechecks the latest draft after a warning confirmation', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '导出 PNG' }))
    await screen.findByRole('button', { name: '继续导出' })
    fireEvent.click(screen.getByRole('button', { name: '清空消息', hidden: true }))
    fireEvent.click(screen.getByRole('button', { name: '确认清空消息', hidden: true }))
    await user.click(screen.getByRole('button', { name: '继续导出' }))
    expect(await screen.findByText('截图范围内没有消息')).toBeInTheDocument()
    expect(exportMocks.exportChatImage).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '继续导出' })).not.toBeInTheDocument()
  })

  it('disables export when the long-image range is reversed', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '聊天长图' }))
    await user.selectOptions(screen.getByLabelText('开始消息'), 'm4')
    await user.selectOptions(screen.getByLabelText('结束消息'), 'm2')
    expect(screen.getByRole('alert')).toHaveTextContent('开始消息必须位于结束消息之前')
    expect(screen.getByRole('button', { name: '导出 PNG' })).toBeDisabled()
  })

  it('saves and confirms applying a local group template', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '打开素材库' }))
    await user.click(screen.getByRole('button', { name: '保存当前群组' }))
    await screen.findByRole('button', { name: '应用群组：仙女驻凡大使馆' })
    await user.click(screen.getByRole('button', { name: '关闭素材库' }))
    await user.clear(screen.getByLabelText('聊天标题'))
    await user.type(screen.getByLabelText('聊天标题'), '临时群名')

    await user.click(screen.getByRole('button', { name: '打开素材库' }))
    await user.click(screen.getByRole('button', { name: '应用群组：仙女驻凡大使馆' }))
    expect(screen.getByRole('dialog', { name: '应用群组“仙女驻凡大使馆”？' })).toHaveTextContent('移除 0 条')
    await user.click(screen.getByRole('button', { name: '确认应用群组' }))
    expect(screen.getByLabelText('聊天标题')).toHaveValue('仙女驻凡大使馆')
  })

  it('keeps shared media after deletion while undo history references it', async () => {
    const user = userEvent.setup()
    const asset = await saveMediaAsset(
      new File(['shared'], 'shared.png', { type: 'image/png' }),
      { width: 10, height: 10 },
    )
    const orphan = await saveMediaAsset(
      new File(['orphan'], 'orphan.png', { type: 'image/png' }),
      { width: 10, height: 10 },
    )
    releaseMediaAssets([orphan.id])
    const sharedMedia = {
      assetId: asset.id,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      width: 10,
      height: 10,
    }
    const messages = SAMPLE_DRAFT.messages.slice(0, 2).map((message, index) => ({
      ...message,
      id: `shared-${index}`,
      kind: 'image' as const,
      text: '',
      media: sharedMedia,
    }))
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...SAMPLE_DRAFT, messages }))
    render(<App />)
    await waitFor(async () => expect(await getMediaAsset(orphan.id)).toBeNull())

    await user.click(screen.getByRole('tab', { name: '消息', hidden: true }))
    await user.click(screen.getByRole('button', { name: '删除消息 1' }))
    await screen.findByText('正在保存…')
    await screen.findByText('已保存到此浏览器')
    expect(await getMediaAsset(asset.id)).not.toBeNull()

    await user.click(screen.getByRole('button', { name: '删除消息 1' }))
    await screen.findByText('正在保存…')
    await screen.findByText('已保存到此浏览器')
    expect(await getMediaAsset(asset.id)).not.toBeNull()
  })
})
