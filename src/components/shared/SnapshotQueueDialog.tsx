import { useEffect, useRef } from 'react'
import { Download, Trash2, X } from 'lucide-react'
import type { StagedSnapshot } from '../../services/snapshotQueue'
import { stagedSnapshotBytes } from '../../services/snapshotQueue'
import styles from './SnapshotQueueDialog.module.css'

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function SnapshotQueueDialog({ items, busy, onClose, onDownload, onDownloadAll, onRemove, onClear }: {
  items: StagedSnapshot[]
  busy: boolean
  onClose: () => void
  onDownload: (item: StagedSnapshot) => void
  onDownloadAll: () => void
  onRemove: (id: string) => void
  onClear: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    return () => { if (opener?.isConnected) opener.focus() }
  }, [])

  return <div className={styles.overlay} onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="snapshot-queue-title" aria-busy={busy || undefined} onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); if (!busy) onClose(); return }
      if (event.key !== 'Tab') return
      const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled)')]
      const first = focusable[0], last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}>
      <header><div><h2 id="snapshot-queue-title">截图暂存盘</h2><p>{items.length} / 20 张 · {formatBytes(stagedSnapshotBytes(items))} / 100 MB · 刷新页面后清空</p></div><button type="button" aria-label="关闭截图暂存盘" disabled={busy} onClick={onClose}><X size={16} /></button></header>
      {items.length ? <ul className={styles.grid}>{items.map(item => <li key={item.id}>
        <img src={item.objectUrl} alt={item.filename} />
        <div><strong title={item.filename}>{item.filename}</strong><span>{formatBytes(item.blob.size)}</span></div>
        <button type="button" aria-label={`下载 ${item.filename}`} disabled={busy} onClick={() => onDownload(item)}><Download size={15} /></button>
        <button type="button" aria-label={`删除 ${item.filename}`} disabled={busy} onClick={() => onRemove(item.id)}><Trash2 size={15} /></button>
      </li>)}</ul> : <p className={styles.empty}>还没有暂存截图。点击顶部“暂存 PNG”即可加入。</p>}
      <footer><button type="button" disabled={busy || !items.length} onClick={onClear}>清空暂存盘</button><button type="button" disabled={busy || !items.length} onClick={onDownloadAll}>{busy ? '正在打包…' : '批量下载 ZIP'}</button></footer>
    </div>
  </div>
}
