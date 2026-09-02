import { useEffect, useRef, useState } from 'react'

import type { ChatDraft } from '../../app/chatTypes'
import type { ProjectWorkspace } from '../../hooks/useProjectWorkspace'
import { ProjectPanel, type RunProductivityTask } from '../editor/ProjectPanel'
import { ConfirmDialog } from '../shared/ConfirmDialog'
import { releaseMediaAssets } from '../../services/mediaAssetStore'
import { getDraftMedia } from '../../utils/draftMedia'
import styles from './ProjectManagerDialog.module.css'

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '未知'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  const megabytes = bytes / (1024 * 1024)
  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(timestamp)
}

const reasonLabel = { interval: '自动恢复点', destructive: '手动恢复点', switch: '切换前恢复点' } as const

export function ProjectManagerDialog({ draft, workspace, onClose }: {
  draft: ChatDraft
  workspace: ProjectWorkspace
  onClose: () => void
}) {
  const [selection, setSelection] = useState({ projectId: workspace.activeProjectId, activeProjectId: workspace.activeProjectId })
  const [nameEdit, setNameEdit] = useState<{ projectId: string | null; value: string }>({ projectId: null, value: '' })
  const [confirm, setConfirm] = useState<{ type: 'delete' } | { type: 'restore'; checkpointId: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const active = useRef(true)
  const selectedId = selection.activeProjectId === workspace.activeProjectId ? selection.projectId : workspace.activeProjectId
  const selected = workspace.projects.find(project => project.id === selectedId) ?? workspace.projects.find(project => project.id === workspace.activeProjectId) ?? workspace.projects[0]
  const name = nameEdit.projectId === selected?.id ? nameEdit.value : selected?.title ?? ''
  const controlsBusy = busy || workspace.status === 'saving'

  useEffect(() => {
    active.current = true
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => { active.current = false; previous?.focus() }
  }, [])

  async function runAction(work: () => Promise<void>, success?: string) {
    if (busy) return
    setBusy(true); setError(null); setNotice(null)
    try {
      await work()
      if (success) setNotice(success)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '项目操作失败，请重试')
    } finally { setBusy(false) }
  }

  const runProjectTask: RunProductivityTask = async (work, success) => {
    await runAction(async () => {
      const next = await work(() => true)
      if (!next) return
      if (!active.current) {
        const existing = new Set(getDraftMedia(draft).map(media => media.assetId))
        releaseMediaAssets(getDraftMedia(next).map(media => media.assetId).filter(id => !existing.has(id)))
        return
      }
      await workspace.replaceCurrent(next)
    }, success)
  }

  const checkpointList = workspace.checkpoints
  return <>
    <div className={styles.overlay} onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="project-manager-title" onKeyDown={event => {
        if (event.key === 'Escape' && !busy) { event.stopPropagation(); onClose() }
        if (event.key !== 'Tab') return
        const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), summary')]
        const first = focusable[0], last = focusable.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }}>
        <header><div><h2 id="project-manager-title">本地项目</h2><p>项目和恢复点只保存在当前浏览器。</p></div><button type="button" disabled={busy} onClick={onClose}>关闭</button></header>
        {error || workspace.error ? <p role="alert">{error ?? workspace.error}</p> : null}
        {notice ? <p role="status">{notice}</p> : null}
        {busy || workspace.status === 'saving' ? <p role="status">正在处理项目…</p> : null}

        <div className={styles.layout}>
          <section aria-labelledby="project-list-title" className={styles.projectList}>
            <div className={styles.sectionHeader}><h3 id="project-list-title">项目列表</h3><button type="button" disabled={controlsBusy} onClick={() => void runAction(workspace.createNew, '已新建项目')}>新建项目</button></div>
            <div className={styles.projectCards}>{workspace.projects.map(project => <button type="button" key={project.id} className={project.id === selected?.id ? styles.selectedProject : ''} aria-label={`选择项目 ${project.title}`} onClick={() => {
              setSelection({ projectId: project.id, activeProjectId: workspace.activeProjectId })
              setNameEdit({ projectId: project.id, value: project.title })
            }}>
              <strong>{project.title}</strong><span data-dynamic-project-time>{project.draft.messages.length} 条消息 · {formatTime(project.updatedAt)}</span>{project.id === workspace.activeProjectId ? <em>当前项目</em> : null}
            </button>)}</div>
          </section>

          <section aria-labelledby="project-actions-title" className={styles.details}>
            <h3 id="project-actions-title">项目操作</h3>
            {selected ? <>
              <label>项目名称<input aria-label="项目名称" disabled={controlsBusy} value={name} onChange={event => setNameEdit({ projectId: selected.id, value: event.target.value })} /></label>
              <div className={styles.actions}>
                <button type="button" disabled={busy || !name.trim()} onClick={() => void runAction(() => workspace.rename(selected.id, name), '名称已保存')}>保存项目名称</button>
                <button type="button" disabled={busy || selected.id === workspace.activeProjectId} onClick={() => void runAction(() => workspace.switchTo(selected.id), '项目已打开')}>打开选中项目</button>
                <button type="button" disabled={busy} onClick={() => void runAction(() => workspace.duplicate(selected.id), '项目已复制')}>复制当前项目</button>
                <button type="button" disabled={busy || workspace.projects.length < 2} onClick={() => setConfirm({ type: 'delete' })}>删除当前项目</button>
              </div>
            </> : <p>暂无本地项目。</p>}

            <div className={styles.sectionHeader}><h3>恢复版本</h3><button type="button" disabled={busy || !workspace.activeProjectId} onClick={() => void runAction(() => workspace.checkpointNow('destructive'), '恢复点已创建')}>创建恢复点</button></div>
            {checkpointList.length ? <ul className={styles.checkpoints}>{checkpointList.map(checkpoint => <li key={checkpoint.id}><span><strong>{reasonLabel[checkpoint.reason]}</strong><small>{formatTime(checkpoint.createdAt)} · {checkpoint.draft.messages.length} 条消息</small></span><button type="button" aria-label={`恢复这个版本 ${formatTime(checkpoint.createdAt)}`} disabled={busy} onClick={() => setConfirm({ type: 'restore', checkpointId: checkpoint.id })}>恢复</button></li>)}</ul> : <p className={styles.muted}>还没有恢复点。</p>}
          </section>
        </div>

        <details className={styles.backup}><summary>项目 JSON 备份与恢复</summary><ProjectPanel draft={draft} run={runProjectTask} /></details>
        <section className={styles.storage} aria-labelledby="storage-title"><h3 id="storage-title">浏览器存储</h3>
          <p data-dynamic-storage-usage>已使用 {formatBytes(workspace.storageUsage)} / {formatBytes(workspace.storageQuota)}</p>
          {workspace.persistence === 'granted' ? <p>浏览器已允许持久保存</p> : workspace.persistence === 'unsupported' ? <p>当前环境不支持申请持久保存</p> : <button type="button" disabled={busy} onClick={() => void runAction(workspace.requestPersistence)}>请求持久保存</button>}
          {workspace.persistence === 'denied' ? <p>浏览器未允许持久保存，仍建议定期导出 JSON。</p> : null}
        </section>
      </div>
    </div>
    {confirm?.type === 'delete' && selected ? <ConfirmDialog title="删除当前项目？" confirmLabel="确认删除" danger onCancel={() => setConfirm(null)} onConfirm={() => { setConfirm(null); void runAction(() => workspace.remove(selected.id), '项目已删除') }}>项目“{selected.title}”及其恢复点会从当前浏览器删除；其他项目不会受影响。</ConfirmDialog> : null}
    {confirm?.type === 'restore' ? <ConfirmDialog title="恢复这个版本？" confirmLabel="确认恢复" danger onCancel={() => setConfirm(null)} onConfirm={() => { const id = confirm.checkpointId; setConfirm(null); void runAction(() => workspace.restore(id), '项目版本已恢复') }}>当前内容会先生成恢复点，再替换为所选版本。</ConfirmDialog> : null}
  </>
}
