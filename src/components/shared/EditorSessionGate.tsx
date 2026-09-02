import { useEffect, useState, type ReactNode } from 'react'
import styles from './EditorSessionGate.module.css'
import { EditorErrorBoundary } from './EditorErrorBoundary'

type SessionState = 'checking' | 'active' | 'blocked' | 'unavailable'

/** Mount persistence and media cleanup only while this document owns the editor. */
export function EditorSessionGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>('checking')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    let release: () => void = () => {}
    const lifetime = new Promise<void>((resolve) => { release = resolve })

    const acquire = async () => {
      try {
        // StrictMode tears down its probe effect synchronously. Let that cleanup
        // cancel the probe before it can contend with the real effect's lock.
        await Promise.resolve()
        if (cancelled) return
        if (!navigator.locks?.request) throw new Error('Web Locks unavailable')
        await navigator.locks.request('chat-screenshot-generator:editor', { ifAvailable: true }, async (lock) => {
          if (cancelled) return
          if (!lock) {
            setState('blocked')
            return
          }
          setState('active')
          await lifetime
        })
      } catch {
        if (!cancelled) setState('unavailable')
      }
    }

    void acquire()
    return () => {
      cancelled = true
      release()
    }
  }, [attempt])

  if (state === 'active') return <EditorErrorBoundary>{children}</EditorErrorBoundary>

  return (
    <main className={styles.screen}>
      <section className={styles.card} aria-live="polite">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="40" height="40" />
        <h1>{state === 'checking' ? '正在打开编辑器' : state === 'blocked' ? '已在其他标签页打开' : '无法安全打开编辑器'}</h1>
        <p>{state === 'checking'
          ? '正在检查本地草稿的编辑权限…'
          : state === 'blocked'
            ? '为保护草稿和上传素材，同一网站只允许一个编辑页面。请关闭其他编辑标签页或窗口，再重试打开。'
            : '当前浏览器无法锁定本地草稿。请通过 HTTPS（本地开发可用 localhost）访问，并使用新版 Chrome、Edge 或 Safari。'}</p>
        {state !== 'checking' && <button type="button" onClick={() => {
          setState('checking')
          setAttempt((value) => value + 1)
        }}>重试打开</button>}
      </section>
    </main>
  )
}
