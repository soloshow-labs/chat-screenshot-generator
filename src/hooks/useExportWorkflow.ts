import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { ChatDraft } from '../app/chatTypes'
import { exportChatImage } from '../services/exportChatImage'
import { ExportResourceError } from '../services/exportResourceError'
import { checkExportQuality, type QualityIssue } from '../services/exportQuality'
import { copyPng, pngDataUrlToBlob, PngClipboardError } from '../services/pngClipboard'
import { hasPendingMediaImports } from './useMediaImportActivity'
import { createSegmentZip, measureMessageSlots, partitionMessageSlots, safeExportTitle } from '../services/segmentedExport'
import {
  clearStagedSnapshots,
  removeStagedSnapshot,
  stageSnapshot,
  type StagedSnapshot,
} from '../services/snapshotQueue'

export type ExportDelivery = 'download' | 'clipboard' | 'stage'
class ExportPaused extends Error {}

interface UseExportWorkflowOptions {
  draft: ChatDraft
  captureRangeValid: boolean
  productivityBusy: boolean
  setActiveTab: Dispatch<SetStateAction<'settings' | 'messages' | 'preview'>>
}

export function useExportWorkflow({ draft, captureRangeValid, productivityBusy, setActiveTab }: UseExportWorkflowOptions) {
  const [exporting, setExporting] = useState(false)
  const [exportDelivery, setExportDelivery] = useState<ExportDelivery>('download')
  const [qualityDelivery, setQualityDelivery] = useState<ExportDelivery>('download')
  const [exportNotice, setExportNotice] = useState<string | null>(null)
  const [qualityIssues, setQualityIssues] = useState<QualityIssue[] | undefined>()
  const [stagedSnapshots, setStagedSnapshots] = useState<StagedSnapshot[]>([])
  const [snapshotQueueBusy, setSnapshotQueueBusy] = useState(false)
  const chatCanvasRef = useRef<HTMLDivElement>(null)
  const segmentedCanvasRef = useRef<HTMLDivElement>(null)
  const [segmentedDraft, setSegmentedDraft] = useState<ChatDraft | null>(null)
  const segmentReady = useRef<(() => void) | null>(null)
  const draftRef = useRef(draft)
  const exportLock = useRef(false)
  const mounted = useRef(true)
  const stagedSnapshotsRef = useRef<StagedSnapshot[]>([])

  useLayoutEffect(() => { draftRef.current = draft }, [draft])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      clearStagedSnapshots(stagedSnapshotsRef.current)
      stagedSnapshotsRef.current = []
    }
  }, [])
  useLayoutEffect(() => {
    if (!segmentedDraft || !segmentReady.current) return
    const resolve = segmentReady.current
    segmentReady.current = null
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  }, [segmentedDraft])

  const prepareCanvas = useCallback(async () => {
    setActiveTab('preview')
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    return mounted.current ? chatCanvasRef.current : null
  }, [setActiveTab])

  const renderExport = useCallback(async (delivery: ExportDelivery, acknowledgeWarnings: boolean) => {
    const canvas = await prepareCanvas()
    if (!canvas) throw new ExportPaused()
    let snapshot = draftRef.current
    let issues = await checkExportQuality(snapshot, canvas)
    while (mounted.current && snapshot !== draftRef.current) {
      snapshot = draftRef.current
      issues = await checkExportQuality(snapshot, canvas)
    }
    if (!mounted.current) throw new ExportPaused()
    if (issues.some(issue => issue.severity === 'error') || (issues.length > 0 && !acknowledgeWarnings)) {
      setQualityIssues(issues)
      setQualityDelivery(delivery)
      throw new ExportPaused()
    }
    setQualityIssues(undefined)
    const result = await exportChatImage(canvas, snapshot.title, {
      outputMode: snapshot.outputMode,
      outputWidth: snapshot.outputWidth,
      outputHeight: snapshot.outputHeight,
      exportScale: snapshot.exportScale,
    })
    if (!mounted.current) throw new ExportPaused()
    return result
  }, [prepareCanvas])

  const handleExport = useCallback(async (delivery: ExportDelivery, acknowledgeWarnings = false) => {
    if (!chatCanvasRef.current || exportLock.current || productivityBusy || hasPendingMediaImports() || !captureRangeValid) return
    exportLock.current = true
    setExporting(true)
    setExportDelivery(delivery)
    setExportNotice(null)
    try {
      if (delivery === 'clipboard') {
        await copyPng(async () => pngDataUrlToBlob((await renderExport(delivery, acknowledgeWarnings)).dataUrl))
        if (mounted.current) setExportNotice('PNG 已复制')
      } else if (delivery === 'download') {
        const result = await renderExport(delivery, acknowledgeWarnings)
        const link = document.createElement('a')
        link.download = result.filename
        link.href = result.dataUrl
        document.body.append(link)
        link.click()
        link.remove()
        setExportNotice('PNG 已导出')
      } else {
        const result = await renderExport(delivery, acknowledgeWarnings)
        const item = stageSnapshot(stagedSnapshotsRef.current, result)
        const next = [item, ...stagedSnapshotsRef.current]
        stagedSnapshotsRef.current = next
        setStagedSnapshots(next)
        setExportNotice(`PNG 已暂存（${next.length} / 20）`)
      }
    } catch (error) {
      if (mounted.current && !(error instanceof ExportPaused)) {
        setExportNotice(error instanceof ExportResourceError || error instanceof PngClipboardError
          ? error.message
          : error instanceof Error && /^(暂存盘|PNG 图像)/.test(error.message)
            ? error.message
            : '导出失败，请减少消息数量后重试')
      }
    } finally {
      exportLock.current = false
      if (mounted.current) setExporting(false)
    }
  }, [captureRangeValid, productivityBusy, renderExport])

  const removeSnapshot = useCallback((id: string) => {
    const next = removeStagedSnapshot(stagedSnapshotsRef.current, id)
    stagedSnapshotsRef.current = next
    setStagedSnapshots(next)
  }, [])

  const clearSnapshots = useCallback(() => {
    clearStagedSnapshots(stagedSnapshotsRef.current)
    stagedSnapshotsRef.current = []
    setStagedSnapshots([])
  }, [])

  const downloadSnapshot = useCallback((item: StagedSnapshot) => {
    const link = document.createElement('a')
    link.download = item.filename
    link.href = item.objectUrl
    document.body.append(link)
    link.click()
    link.remove()
  }, [])

  const downloadSnapshotZip = useCallback(async () => {
    if (!stagedSnapshotsRef.current.length || snapshotQueueBusy) return
    setSnapshotQueueBusy(true)
    setExportNotice(null)
    try {
      const { createSnapshotZip } = await import('../services/snapshotQueueZip')
      const archive = await createSnapshotZip(stagedSnapshotsRef.current)
      if (!mounted.current) return
      const url = URL.createObjectURL(archive)
      const link = document.createElement('a')
      link.download = `${safeExportTitle(draftRef.current.title)}-暂存截图.zip`
      link.href = url
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
      setExportNotice(`已打包 ${stagedSnapshotsRef.current.length} 张暂存 PNG`)
    } catch {
      if (mounted.current) setExportNotice('暂存截图打包失败，请尝试单张下载')
    } finally {
      if (mounted.current) setSnapshotQueueBusy(false)
    }
  }, [snapshotQueueBusy])

  const handleSegmentedExport = useCallback(async () => {
    if (!chatCanvasRef.current || exportLock.current || productivityBusy || hasPendingMediaImports() || !captureRangeValid) return
    exportLock.current = true
    setExporting(true)
    setExportDelivery('download')
    setExportNotice(null)
    try {
      const canvas = await prepareCanvas()
      if (!canvas) throw new ExportPaused()
      const snapshot = draftRef.current
      if (snapshot.outputMode !== 'long') throw new Error('只有长图模式可以自动分段')
      const issues = await checkExportQuality(snapshot, canvas)
      const otherErrors = issues.filter(issue => issue.severity === 'error' && issue.code !== 'canvas-limit')
      if (otherErrors.length) {
        setQualityIssues(issues)
        throw new ExportPaused()
      }
      const content = canvas.querySelector<HTMLElement>('[data-chat-message-content]')
      if (!content) throw new Error('无法读取长图消息布局')
      const pixelRatio = snapshot.exportScale * snapshot.outputWidth / 430
      const safeLogicalHeight = Math.floor(16384 / pixelRatio)
      const canvasHeight = canvas.scrollHeight || canvas.offsetHeight
      const chromeHeight = Math.max(188, canvasHeight - content.scrollHeight)
      const segments = partitionMessageSlots(measureMessageSlots(content), safeLogicalHeight - chromeHeight - 16)
      if (!segments.length) throw new Error('截图范围内没有可分段的消息')

      const dataUrls: string[] = []
      for (const [index, segment] of segments.entries()) {
        const segmentDraft: ChatDraft = {
          ...snapshot,
          outputMode: 'long',
          captureStartMessageId: segment.startMessageId,
          captureEndMessageId: segment.endMessageId,
          showInputBar: index === segments.length - 1 ? snapshot.showInputBar : false,
          showHomeIndicator: index === segments.length - 1 ? snapshot.showHomeIndicator : false,
        }
        await new Promise<void>(resolve => {
          segmentReady.current = resolve
          setSegmentedDraft(segmentDraft)
        })
        const segmentCanvas = segmentedCanvasRef.current
        if (!segmentCanvas) throw new Error('分段画布没有准备完成')
        const result = await exportChatImage(segmentCanvas, snapshot.title, {
          outputMode: 'long',
          outputWidth: snapshot.outputWidth,
          outputHeight: snapshot.outputHeight,
          exportScale: snapshot.exportScale,
        })
        dataUrls.push(result.dataUrl)
      }
      const archive = await createSegmentZip(snapshot.title, dataUrls)
      const url = URL.createObjectURL(archive)
      const link = document.createElement('a')
      link.download = `${safeExportTitle(snapshot.title)}-分段.zip`
      link.href = url
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
      setQualityIssues(undefined)
      setExportNotice(`已导出 ${segments.length} 张分段 PNG`)
    } catch (error) {
      if (mounted.current && !(error instanceof ExportPaused)) {
        const safeMessage = error instanceof ExportResourceError
          ? error.message
          : error instanceof Error && /^(消息 |无法|只有|截图范围|分段画布)/.test(error.message)
            ? error.message
            : '分段导出失败，请缩短单条消息后重试'
        setExportNotice(safeMessage)
      }
    } finally {
      segmentReady.current = null
      setSegmentedDraft(null)
      exportLock.current = false
      if (mounted.current) setExporting(false)
    }
  }, [captureRangeValid, prepareCanvas, productivityBusy])

  return {
    chatCanvasRef,
    segmentedCanvasRef,
    segmentedDraft,
    exporting,
    exportDelivery,
    exportNotice,
    qualityDelivery,
    qualityIssues,
    setQualityIssues,
    prepareCanvas,
    handleExport,
    handleSegmentedExport,
    stagedSnapshots,
    snapshotQueueBusy,
    removeSnapshot,
    clearSnapshots,
    downloadSnapshot,
    downloadSnapshotZip,
  }
}
