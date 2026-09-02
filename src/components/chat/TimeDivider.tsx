import type { PropsWithChildren } from 'react'
import styles from './ChatCanvas.module.css'

export function TimeDivider({ children }: PropsWithChildren) {
  return <div className={styles.timeDivider} data-testid="time-divider">{children}</div>
}
