import styles from './shared.module.css'

export function Toast({ children }: { children: string }) {
  return <div className={styles.toast} role="status">{children}</div>
}
