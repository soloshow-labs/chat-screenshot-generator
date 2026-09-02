import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useMediaImportTracker } from '../../hooks/useMediaImportActivity'
import { computeAvatarCrop, INITIAL_AVATAR_CROP, type AvatarCropPosition } from '../../services/avatarCropGeometry'
import { decodeAvatar, drawAvatarCrop, encodeAvatar, type AvatarEncodeOptions } from '../../services/avatarProcessor'
import styles from './AvatarCropDialog.module.css'

interface AvatarCropDialogLabels { title: string; viewport: string; zoom: string; confirm: string }
export interface AvatarCropDialogProps { file: File; onConfirm: (dataUrl: string) => void; onCancel: () => void; options?: AvatarEncodeOptions; labels?: Partial<AvatarCropDialogLabels>; compact?: boolean }
interface BitmapResource { bitmap: ImageBitmap; closed: boolean }
function release(resource: BitmapResource | null) {
  if (resource && !resource.closed) { resource.closed = true; resource.bitmap.close() }
}

export function AvatarCropDialog({ file, onConfirm, onCancel, options, labels, compact = false }: AvatarCropDialogProps) {
  const titleId = useId()
  const helpId = useId()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const resourceRef = useRef<BitmapResource | null>(null)
  const finishRef = useRef<() => void>(() => {})
  const closed = useRef(false)
  const submitting = useRef(false)
  const drag = useRef<{ pointerId: number; x: number; y: number; width: number; height: number; crop: AvatarCropPosition } | null>(null)
  const [decoded, setDecoded] = useState<{ file: File; bitmap: ImageBitmap | null; error: string | null } | null>(null)
  const [cropState, setCropState] = useState({ file, position: INITIAL_AVATAR_CROP })
  const [submitState, setSubmitState] = useState<{ file: File; busy: boolean; error: string | null }>({ file, busy: false, error: null })
  const beginMediaImport = useMediaImportTracker()
  const dialogLabels: AvatarCropDialogLabels = { title: '头像取景', viewport: '头像取景区', zoom: '缩放头像', confirm: '确认头像', ...labels }
  const aspectRatio = options?.aspectRatio ?? 1
  const bitmap = decoded?.file === file ? decoded.bitmap : null
  const position = cropState.file === file ? cropState.position : INITIAL_AVATAR_CROP
  const busy = submitState.file === file && submitState.busy
  const error = (decoded?.file === file ? decoded.error : null) || (submitState.file === file ? submitState.error : null)

  useLayoutEffect(() => {
    const previousFocus = document.activeElement
    canvasRef.current?.focus()
    return () => {
      queueMicrotask(() => {
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
      })
    }
  }, [])

  useEffect(() => {
    let disposed = false
    let resource: BitmapResource | null = null
    closed.current = false
    submitting.current = false
    drag.current = null
    const finish = beginMediaImport()
    finishRef.current = finish
    void decodeAvatar(file).then(image => {
      resource = { bitmap: image, closed: false }
      if (disposed || closed.current) { release(resource); return }
      resourceRef.current = resource
      setDecoded({ file, bitmap: image, error: null })
    }).catch(cause => {
      if (!disposed && !closed.current) setDecoded({ file, bitmap: null, error: cause instanceof Error ? cause.message : '图片处理失败，请重新选择图片' })
    })
    return () => {
      disposed = true
      release(resource)
      if (resourceRef.current === resource) resourceRef.current = null
      finish()
    }
  }, [file, beginMediaImport])

  useLayoutEffect(() => {
    if (!bitmap || !canvasRef.current) return
    let disposed = false
    try { drawAvatarCrop(canvasRef.current, bitmap, position, options) }
    catch (cause) {
      release(resourceRef.current)
      queueMicrotask(() => {
        if (!disposed && !closed.current) setDecoded({ file, bitmap: null, error: cause instanceof Error ? cause.message : '图片预览失败，请重新选择图片' })
      })
    }
    return () => { disposed = true }
  }, [bitmap, position, file, options])

  function end() {
    closed.current = true
    drag.current = null
    release(resourceRef.current)
    finishRef.current()
  }
  function cancel() {
    if (submitting.current || closed.current) return
    end()
    onCancel()
  }
  function confirm() {
    if (!bitmap || submitting.current || closed.current) return
    submitting.current = true
    setSubmitState({ file, busy: true, error: null })
    try {
      const dataUrl = encodeAvatar(bitmap, position, options)
      onConfirm(dataUrl)
      end()
    } catch (cause) {
      submitting.current = false
      setSubmitState({ file, busy: false, error: cause instanceof Error ? cause.message : '头像编码失败，请重试或取消' })
    }
  }
  function changeCrop(update: (current: AvatarCropPosition) => AvatarCropPosition) {
    if (!bitmap || busy || closed.current) return
    setCropState(current => {
      const next = update(current.file === file ? current.position : INITIAL_AVATAR_CROP)
      const crop = options ? computeAvatarCrop(bitmap.width, bitmap.height, next, options) : computeAvatarCrop(bitmap.width, bitmap.height, next)
      const sourceWidth = 'sourceWidth' in crop ? crop.sourceWidth : crop.sourceSize
      const sourceHeight = 'sourceHeight' in crop ? crop.sourceHeight : crop.sourceSize
      return { file, position: { centerX: (crop.sourceX + sourceWidth / 2) / bitmap.width, centerY: (crop.sourceY + sourceHeight / 2) / bitmap.height, zoom: Math.max(1, Math.min(4, next.zoom)) } }
    })
  }
  function pointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (!bitmap || busy || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.focus()
    const { width, height } = event.currentTarget.getBoundingClientRect()
    if (width <= 0 || height <= 0) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, width, height, crop: position }
  }
  function pointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const start = drag.current
    if (!bitmap || !start || start.pointerId !== event.pointerId) return
    const crop = options ? computeAvatarCrop(bitmap.width, bitmap.height, start.crop, options) : computeAvatarCrop(bitmap.width, bitmap.height, start.crop)
    const sourceWidth = 'sourceWidth' in crop ? crop.sourceWidth : crop.sourceSize
    const sourceHeight = 'sourceHeight' in crop ? crop.sourceHeight : crop.sourceSize
    changeCrop(() => ({ ...start.crop, centerX: start.crop.centerX - (event.clientX - start.x) / start.width * sourceWidth / bitmap.width, centerY: start.crop.centerY - (event.clientY - start.y) / start.height * sourceHeight / bitmap.height }))
  }
  function pointerEnd(event: PointerEvent<HTMLCanvasElement>) {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  function keyboardCrop(event: KeyboardEvent<HTMLCanvasElement>) {
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
    if (!direction) return
    event.preventDefault()
    const step = event.shiftKey ? .05 : .01
    changeCrop(current => ({ ...current, centerX: current.centerX + direction[0] * step, centerY: current.centerY + direction[1] * step }))
  }
  function keyboardDialog(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); return }
    if (event.key !== 'Tab') return
    event.stopPropagation()
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')
    if (!focusable?.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  return createPortal(<div className={styles.backdrop}>
    <div ref={dialogRef} className={`${styles.dialog} ${compact ? styles.compact : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={keyboardDialog}>
      <h2 id={titleId}>{dialogLabels.title}</h2>
      <p id={helpId}>拖动照片调整位置，或聚焦取景区后用方向键微调。</p>
      <canvas ref={canvasRef} className={styles.viewport} style={{ aspectRatio }} role="img" aria-label={dialogLabels.viewport} aria-describedby={helpId} tabIndex={0} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={() => { drag.current = null }} onKeyDown={keyboardCrop} />
      {!bitmap && !error ? <p role="status">正在读取图片…</p> : null}
      <label className={styles.zoom}><span>缩放 <output>{position.zoom.toFixed(2)}×</output></span><input type="range" aria-label={dialogLabels.zoom} min="1" max="4" step="0.01" value={position.zoom} disabled={!bitmap || busy} onChange={event => { const zoom = Number(event.target.value); changeCrop(current => ({ ...current, zoom })) }} /></label>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <p className={styles.note}>仅保存裁剪结果；重新取景需再次上传原图。</p>
      <div className={styles.actions}>
        <button type="button" disabled={!bitmap || busy} onClick={() => changeCrop(() => INITIAL_AVATAR_CROP)}>重置取景</button>
        <button type="button" disabled={busy} onClick={cancel}>取消</button>
        <button type="button" className={styles.primary} disabled={!bitmap || busy} onClick={confirm}>{dialogLabels.confirm}</button>
      </div>
    </div>
  </div>, document.body)
}
