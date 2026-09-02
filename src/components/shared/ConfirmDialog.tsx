import type { ReactNode } from 'react'
import styles from './shared.module.css'

interface ConfirmDialogProps {
  title: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  children: ReactNode
  danger?: boolean
}

export function ConfirmDialog({ title, confirmLabel, onConfirm, onCancel, children, danger = false }: ConfirmDialogProps) {
  const titleId = `dialog-${title.replaceAll(/\W/g, '')}`
  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel()
    }}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>{title}</h2>
        <div className={styles.dialogBody}>{children}</div>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.secondaryButton} onClick={onCancel}>取消</button>
          <button type="button" className={danger ? styles.dangerButton : styles.primaryButton} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
