import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import type { QualityIssue } from '../../services/exportQuality'
import styles from './ExportQualityDialog.module.css'

type ExportDelivery = 'download' | 'clipboard' | 'stage'

export function ExportQualityDialog({ delivery, issues, onClose, onContinue, onSegmentExport, busy = false }: {
  delivery: ExportDelivery
  issues: QualityIssue[]
  onClose: () => void
  onContinue: () => void
  onSegmentExport?: () => void
  busy?: boolean
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const action = delivery === 'clipboard' ? '复制' : delivery === 'stage' ? '暂存' : '导出'
  const title = `${action}前检查`
  const hasError = issues.some(issue => issue.severity === 'error')
  const canSegment = delivery === 'download'
    && issues.some(issue => issue.code === 'canvas-limit')
    && !issues.some(issue => issue.severity === 'error' && issue.code !== 'canvas-limit')

  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const firstEnabled = dialogRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')
    if (firstEnabled) firstEnabled.focus()
    else dialogRef.current?.focus()
    return () => { if (openerRef.current?.isConnected) openerRef.current.focus() }
  }, [])

  return <div className={styles.overlay} onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="export-quality-title" aria-busy={busy || undefined} tabIndex={-1} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); return }
      if (event.key !== 'Tab') return
      const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled)')]
      const first = focusable[0], last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}>
      <header className={styles.header}>
        <div>
          <h2 id="export-quality-title">{title}</h2>
          <p>{hasError ? `请先修复以下问题，再重新${action}。` : `发现以下提醒，确认后仍可继续${action}。`}</p>
        </div>
        <button type="button" disabled={busy} aria-label={`关闭${title}`} onClick={onClose}><X size={16} /></button>
      </header>
      <ul className={styles.issueList}>
        {issues.map((issue, index) => <li key={`${issue.code}-${index}`} data-severity={issue.severity} data-quality-code={issue.code}>
          <strong>{issue.severity === 'error' ? '错误' : '提醒'}</strong>
          <span>{issue.message}</span>
        </li>)}
      </ul>
      <footer className={styles.actions}>
        <button type="button" disabled={busy} className={styles.secondary} onClick={onClose}>{hasError ? '返回修改' : '取消'}</button>
        {canSegment && onSegmentExport ? <button type="button" disabled={busy} className={styles.primary} onClick={onSegmentExport}>自动分段导出 ZIP</button> : null}
        {!hasError ? <button type="button" disabled={busy} className={styles.primary} onClick={onContinue}>继续{action}</button> : null}
      </footer>
    </div>
  </div>
}
