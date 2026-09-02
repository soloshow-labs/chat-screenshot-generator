import { useEffect, useRef, useState } from 'react'
import type { ChatDraft } from '../../app/chatTypes'
import { releaseMediaAssets } from '../../services/mediaAssetStore'
import { getDraftMedia } from '../../utils/draftMedia'
import { checkExportQuality } from '../../services/exportQuality'
import { ProjectPanel, type RunProductivityTask } from './ProjectPanel'
import { ScriptPanel } from './ScriptPanel'
import { TemplatePanel } from './TemplatePanel'
import { QualityPanel } from './QualityPanel'
import styles from './ProductivityDialog.module.css'

const TOOL_TABS = ['批量脚本', '场景模板', '质量检查'] as const
const PROJECT_TAB = '项目文件' as const
type ProductivityTab = typeof PROJECT_TAB | typeof TOOL_TABS[number]

export function ProductivityDialog({ draft, getCanvas, onApply, onClose, onBusy, externalBusy = false, includeProjectFiles = false }: {
  draft: ChatDraft
  getCanvas: () => HTMLElement | null | Promise<HTMLElement | null>
  onApply: (draft: ChatDraft) => void | Promise<void>
  onClose: () => void
  onBusy: (busy: boolean) => void
  externalBusy?: boolean
  includeProjectFiles?: boolean
}) {
  const tabs: readonly ProductivityTab[] = includeProjectFiles ? [PROJECT_TAB, ...TOOL_TABS] : TOOL_TABS
  const [tab, setTab] = useState<ProductivityTab>(tabs[0])
  const [issues, setIssues] = useState<Awaited<ReturnType<typeof checkExportQuality>> | null>(null)
  const [working, setBusy] = useState(false)
  const busy = working || externalBusy
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const active = useRef(true), running = useRef(false), panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    active.current = true
    const previous = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => { active.current = false; previous?.focus() }
  }, [])
  const run: RunProductivityTask = async (work, success) => {
    if (running.current || externalBusy) return
    running.current = true; setBusy(true); onBusy(true); setError(null); setNotice(null)
    try {
      const next = await work(() => active.current)
      if (!active.current) {
        if (next) {
          const existing = new Set(getDraftMedia(draft).map(media => media.assetId))
          releaseMediaAssets(getDraftMedia(next).map(media => media.assetId).filter(id => !existing.has(id)))
        }
        return
      }
      if (next) await onApply(next)
      if (success) setNotice(success)
    } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : '操作失败，请重试') }
    finally { running.current = false; if (active.current) { setBusy(false); onBusy(false) } }
  }
  return <div className={styles.overlay} onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <div ref={panel} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="productivity-title" data-productivity-dialog onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); if (!busy) onClose() }
      if (event.key === 'Tab') {
        const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)')].filter(element => !element.closest('fieldset:disabled'))
        const first = focusable[0], last = focusable.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }}>
      <header><h2 id="productivity-title">效率工具</h2><button type="button" disabled={busy} aria-label="关闭效率工具" onClick={onClose}>关闭</button></header>
      <div role="tablist" aria-label="效率工具分类">{tabs.map((name, index) => <button type="button" role="tab" key={name} aria-selected={tab === name} aria-controls="productivity-panel" id={`productivity-tab-${index}`} disabled={busy} onClick={() => setTab(name)} onKeyDown={event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        const next = (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length
        setTab(tabs[next]); document.getElementById(`productivity-tab-${next}`)?.focus()
      }}>{name}</button>)}</div>
      {error ? <p role="alert">{error}</p> : null}{notice ? <p role="status">{notice}</p> : null}{busy ? <p role="status">处理中，请稍候…</p> : null}
      <fieldset disabled={busy} id="productivity-panel" role="tabpanel" aria-labelledby={`productivity-tab-${tabs.indexOf(tab)}`}>
        {includeProjectFiles && tab === PROJECT_TAB ? <ProjectPanel draft={draft} run={run} /> : null}
        {tab === '批量脚本' ? <ScriptPanel draft={draft} onApply={next => { void Promise.resolve(onApply(next)).then(() => setNotice('脚本已应用')).catch(cause => setError(cause instanceof Error ? cause.message : '脚本应用失败')) }} /> : null}
        {tab === '场景模板' ? <TemplatePanel run={run} /> : null}
        {tab === '质量检查' ? <QualityPanel issues={issues} onCheck={() => void run(async isCurrent => { const result = await checkExportQuality(draft, await getCanvas()); if (isCurrent()) setIssues(result) })} /> : null}
      </fieldset>
    </div>
  </div>
}
