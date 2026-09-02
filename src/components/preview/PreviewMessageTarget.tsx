import type { ReactNode } from 'react'
import styles from './PreviewMessageTarget.module.css'

export function PreviewMessageTarget({ messageId, number, onLocate, children }: {
  messageId: string
  number: number
  onLocate?: (messageId: string) => void
  children: ReactNode
}) {
  return <div className={styles.target} data-preview-message={messageId}>
    <div className={styles.content} inert={Boolean(onLocate)}>{children}</div>
    {onLocate ? <button type="button" className={styles.pick} data-preview-only
      aria-label={`定位消息 ${number} 到编辑器`} onClick={() => onLocate(messageId)} /> : null}
  </div>
}
