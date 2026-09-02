import { forwardRef, useLayoutEffect, useRef, useState, type Dispatch } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import type { ChatAction } from '../../app/chatReducer'
import type { ChatDraft } from '../../app/chatTypes'
import { ChatCanvas } from '../chat/ChatCanvas'
import styles from './PreviewStage.module.css'
import { fitPreviewZoom } from './previewZoom'

const CANVAS_WIDTH = 430

interface PreviewStageProps {
  draft: ChatDraft
  dispatch: Dispatch<ChatAction>
  onLocateMessage?: (messageId: string) => void
}

export const PreviewStage = forwardRef<HTMLDivElement, PreviewStageProps>(function PreviewStage({ draft, dispatch, onLocateMessage }, ref) {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasFrameRef = useRef<HTMLDivElement>(null)
  const [autoZoom, setAutoZoom] = useState(1)
  const [manualZoom, setManualZoom] = useState(0.88)
  const [usesAutoZoom, setUsesAutoZoom] = useState(true)
  const [canvasHeight, setCanvasHeight] = useState<number | null>(null)
  const [locating, setLocating] = useState(false)
  const zoom = usesAutoZoom ? autoZoom : manualZoom

  useLayoutEffect(() => {
    const stage = stageRef.current
    const canvasFrame = canvasFrameRef.current
    if (!stage || !canvasFrame || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === stage && entry.contentRect.width > 0) {
          setAutoZoom(fitPreviewZoom(entry.contentRect.width))
        }
        if (entry.target === canvasFrame && entry.contentRect.height > 0) {
          setCanvasHeight(entry.contentRect.height)
        }
      }
    })
    observer.observe(stage)
    observer.observe(canvasFrame)

    return () => observer.disconnect()
  }, [])

  function changeZoom(amount: number) {
    const currentZoom = usesAutoZoom ? Math.min(1.2, Math.max(0.6, autoZoom)) : manualZoom
    setUsesAutoZoom(false)
    setManualZoom(Math.min(1.2, Math.max(0.6, Number((currentZoom + amount).toFixed(2)))))
  }

  return (
    <section className={styles.preview} aria-labelledby="preview-title">
      <div className={styles.header}>
        <h2 id="preview-title">实时预览</h2>
        {onLocateMessage ? <button type="button" className={styles.locateButton} aria-pressed={locating}
          onClick={() => setLocating(current => !current)}>{locating ? '取消定位' : '定位编辑'}</button> : null}
        <div className={styles.zoomControls}>
          <button type="button" aria-label="缩小预览" onClick={() => changeZoom(-0.1)}><Minus size={16} /></button>
          <output aria-label="预览缩放">{Math.round(zoom * 100)}%</output>
          <button type="button" aria-label="恢复适应宽度" onClick={() => setUsesAutoZoom(true)}><RotateCcw size={15} /></button>
          <button type="button" aria-label="放大预览" onClick={() => changeZoom(0.1)}><Plus size={16} /></button>
        </div>
      </div>
      <div ref={stageRef} className={styles.stage} tabIndex={0} aria-label="聊天预览滚动区域">
        {locating ? <p className={styles.locateHint} role="status">点击预览中的消息，定位到对应编辑行。按 Tab 可选择消息。</p> : null}
        <div className={styles.canvasFrame} style={{ width: CANVAS_WIDTH * zoom, height: canvasHeight ? canvasHeight * zoom : undefined }}>
          <div ref={canvasFrameRef} className={styles.scaler} style={{ '--preview-zoom': zoom } as React.CSSProperties}>
            <ChatCanvas
              ref={ref}
              draft={draft}
              exportMode={false}
              onLocateMessage={locating && onLocateMessage ? messageId => { setLocating(false); onLocateMessage(messageId) } : undefined}
              onScrollTopChange={(screenScrollTop) => {
                if (Math.abs(screenScrollTop - draft.screenScrollTop) > 0.5) {
                  dispatch({ type: 'set-field', field: 'screenScrollTop', value: screenScrollTop })
                }
              }}
            />
          </div>
        </div>
      </div>
    </section>
  )
})
