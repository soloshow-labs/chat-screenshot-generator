import { useEffect, useRef, useState } from 'react'
import type { ChatDraft } from '../../app/chatTypes'
import type { SaveResult } from '../../services/draftStore'
import { importProject, MAX_PROJECT_FILE_BYTES } from '../../services/projectFile'
import { releaseMediaAssets } from '../../services/mediaAssetStore'
import { getMessageAttachments } from '../../utils/messageAttachments'
import styles from './DraftRecoveryPanel.module.css'

function releaseDraft(draft: ChatDraft | null) {
  if (draft) releaseMediaAssets(draft.messages.flatMap(getMessageAttachments).map(media => media.assetId))
}

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('无法读取项目文件'))
    reader.readAsText(file)
  })
}

export function DraftRecoveryPanel({ error, onRetry, onRecover }: {
  error: Error; onRetry: () => void; onRecover: (draft: ChatDraft) => SaveResult
}) {
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<ChatDraft | null>(null)
  const [operationError, setOperationError] = useState<string | null>(null)
  const active = useRef(true), running = useRef(false), pendingRef = useRef<ChatDraft | null>(null)
  useEffect(() => {
    active.current = true
    return () => { active.current = false; releaseDraft(pendingRef.current); pendingRef.current = null }
  }, [])

  async function readProject(file: File) {
    if (running.current) return
    running.current = true
    setBusy(true); setOperationError(null)
    try {
      if (file.size > MAX_PROJECT_FILE_BYTES) throw new Error('项目文件超过 150 MB 上限，请减少媒体素材')
      const json = await readText(file)
      if (!active.current) return
      const imported = await importProject(json)
      if (!active.current) { releaseDraft(imported); return }
      releaseDraft(pendingRef.current)
      pendingRef.current = imported
      setPending(imported)
    } catch (cause) {
      if (active.current) setOperationError(cause instanceof Error ? cause.message : '项目恢复失败')
    } finally {
      running.current = false
      if (active.current) setBusy(false)
    }
  }

  function confirmRecovery() {
    if (running.current || !pendingRef.current) return
    running.current = true
    try {
      const result = onRecover(pendingRef.current)
      if (!result.ok) { setOperationError(result.error.message); return }
      // A successful save transferred ownership to the committed draft. Its
      // first cleanup, not this panel's unmount, completes pin adoption.
      pendingRef.current = null
    } finally { running.current = false }
  }

  return <main className={styles.page}>
    <section className={styles.panel} aria-labelledby="draft-recovery-title">
      <h1 id="draft-recovery-title">本地草稿恢复失败</h1>
      <p role="alert">{error.message}</p>
      <p>原草稿和素材尚未清除。为保护数据，编辑、自动保存和素材清理已暂停。请重试读取，或选择有效的项目 JSON，确认后替换恢复。</p>
      <button type="button" disabled={busy || Boolean(pending)} onClick={onRetry}>重试读取本地草稿</button>
      <label className={styles.file}>从项目 JSON 恢复<input type="file" accept=".json,application/json" aria-label="从项目 JSON 恢复" disabled={busy || Boolean(pending)} onChange={event => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (file) void readProject(file)
      }} /></label>
      {busy ? <p role="status">正在校验项目，请稍候…</p> : null}
      {operationError ? <p role="alert">{operationError}</p> : null}
      {pending ? <div className={styles.confirm}>
        <p>项目「{pending.title || '未命名项目'}」校验通过，包含 {pending.messages.length} 条消息。确认后将替换当前浏览器中的原草稿，此操作无法撤销。</p>
        <div className={styles.actions}>
          <button type="button" onClick={confirmRecovery}>确认替换并恢复</button>
          <button type="button" onClick={() => { releaseDraft(pendingRef.current); pendingRef.current = null; setPending(null); setOperationError(null) }}>取消恢复</button>
        </div>
      </div> : null}
    </section>
  </main>
}
