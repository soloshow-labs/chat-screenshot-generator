import 'fake-indexeddb/auto'

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useChatDraft } from '../../app/useChatDraft'
import { useProjectWorkspace } from '../../hooks/useProjectWorkspace'
import { deleteProject, listProjects } from '../../services/localProjectStore'
import { ProjectManagerDialog } from './ProjectManagerDialog'

function Harness() {
  const chat = useChatDraft()
  const workspace = useProjectWorkspace({ draft: chat.draft, saveState: chat.saveState, recoverDraft: chat.recoverDraft })
  if (workspace.status === 'loading') return <p>加载项目…</p>
  return <ProjectManagerDialog draft={chat.draft} workspace={workspace} onClose={() => undefined} />
}

describe('ProjectManagerDialog', () => {
  beforeEach(() => localStorage.clear())
  afterEach(async () => {
    for (const project of await listProjects()) await deleteProject(project.id)
  })

  it('manages distinct local projects without presenting the productivity-tool tabs', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(await screen.findByRole('dialog', { name: '本地项目' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '批量脚本' })).not.toBeInTheDocument()
    expect(screen.getByText('仙女驻凡大使馆')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '新建项目' }))
    expect(await screen.findByText('新聊天')).toBeInTheDocument()
    expect(screen.getByText('当前项目')).toBeInTheDocument()

    const name = screen.getByLabelText('项目名称')
    await waitFor(() => expect(name).toBeEnabled())
    await user.clear(name)
    await user.type(name, '旅行聊天')
    await user.click(screen.getByRole('button', { name: '保存项目名称' }))
    expect(await screen.findByText('旅行聊天')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '复制当前项目' }))
    expect(await screen.findByText('旅行聊天 - 副本')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /选择项目/ })).toHaveLength(3)
  })

  it('requires confirmation before delete and restore, while retaining JSON backup controls', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await screen.findByRole('dialog', { name: '本地项目' })
    await user.click(screen.getByRole('button', { name: '创建恢复点' }))
    expect(await screen.findByText(/手动恢复点/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /恢复这个版本/ }))
    expect(screen.getByRole('dialog', { name: '恢复这个版本？' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认恢复' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '恢复这个版本？' })).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: '新建项目' }))
    expect(await screen.findByText('新聊天')).toBeInTheDocument()
    const deleteButton = screen.getByRole('button', { name: '删除当前项目' })
    await waitFor(() => expect(deleteButton).toBeEnabled())
    await user.click(deleteButton)
    expect(screen.getByRole('dialog', { name: '删除当前项目？' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog', { name: '删除当前项目？' })).not.toBeInTheDocument()

    expect(screen.getByRole('button', { name: '导出项目 JSON' })).toBeInTheDocument()
    expect(screen.getByLabelText('导入项目 JSON')).toBeInTheDocument()
  })

  it('shows quota information and keeps persistence behind a user action', async () => {
    const user = userEvent.setup()
    const originalStorage = navigator.storage
    Object.defineProperty(navigator, 'storage', { configurable: true, value: {
      estimate: async () => ({ usage: 2 * 1024 * 1024, quota: 10 * 1024 * 1024 }),
      persisted: async () => false,
      persist: async () => true,
    } })
    try {
      render(<Harness />)
      expect(await screen.findByText('已使用 2 MB / 10 MB')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: '请求持久保存' }))
      expect(await screen.findByText('浏览器已允许持久保存')).toBeInTheDocument()
    } finally {
      Object.defineProperty(navigator, 'storage', { configurable: true, value: originalStorage })
    }
  })
})
