import { Component, type ErrorInfo, type ReactNode } from 'react'

import { DRAFT_STORAGE_KEY, migrateChatDraft } from '../../services/draftStore'
import { serializeProject } from '../../services/projectFile'
import styles from './EditorErrorBoundary.module.css'

interface EditorErrorBoundaryState {
  error: Error | null
  details: string
  backupBusy: boolean
  backupFailed: boolean
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.download = filename
  link.href = url
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export class EditorErrorBoundary extends Component<{ children: ReactNode }, EditorErrorBoundaryState> {
  state: EditorErrorBoundaryState = { error: null, details: '', backupBusy: false, backupFailed: false }

  static getDerivedStateFromError(error: Error): Partial<EditorErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ details: `${error.stack ?? error.message}\n${info.componentStack ?? ''}`.trim() })
  }

  private downloadCompleteProject = async (): Promise<void> => {
    if (this.state.backupBusy) return
    this.setState({ backupBusy: true, backupFailed: false })
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
      if (!raw) throw new Error('没有可恢复的本地草稿')
      const draft = migrateChatDraft(JSON.parse(raw))
      const json = await serializeProject(draft)
      downloadBlob(new Blob([json], { type: 'application/json' }), '聊天截图项目-异常恢复.json')
    } catch {
      this.setState({ backupFailed: true })
    } finally {
      this.setState({ backupBusy: false })
    }
  }

  private downloadRawDraft = (): void => {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return
    downloadBlob(new Blob([raw], { type: 'text/plain;charset=utf-8' }), '聊天截图草稿-原始恢复.txt')
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    const hasRawDraft = localStorage.getItem(DRAFT_STORAGE_KEY) !== null
    return <main className={styles.page}>
      <section className={styles.card} aria-labelledby="editor-crash-title">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="40" height="40" />
        <h1 id="editor-crash-title">编辑器发生异常</h1>
        <p>页面没有继续写入或清理本地数据。你可以先下载备份，再重新载入页面。</p>
        <div className={styles.actions}>
          <button type="button" onClick={() => window.location.reload()}>重新载入页面</button>
          <button type="button" disabled={!hasRawDraft || this.state.backupBusy} onClick={() => void this.downloadCompleteProject()}>{this.state.backupBusy ? '正在生成备份…' : '下载完整项目 JSON'}</button>
        </div>
        {this.state.backupFailed ? <div className={styles.fallback}>
          <p role="alert">完整项目备份生成失败。仍可下载未经改写的原始草稿文本；它不包含附件二进制，请同时保留当前浏览器数据。</p>
          <button type="button" disabled={!hasRawDraft} onClick={this.downloadRawDraft}>下载原始草稿文本</button>
        </div> : null}
        <details className={styles.details}>
          <summary>错误详情</summary>
          <pre>{this.state.details || this.state.error.message}</pre>
        </details>
      </section>
    </main>
  }
}
