import type { ExportScale, OutputMode } from '../app/chatTypes'
import { exportSizeError } from './exportLimits'
import { ExportResourceError } from './exportResourceError'

export interface ExportGeometryOptions {
  outputMode: OutputMode
  outputWidth: number
  outputHeight: number
  exportScale: ExportScale
}

export interface ExportGeometry {
  width: number
  height: number | undefined
  pixelRatio: number
}

export function getExportGeometry(options: ExportGeometryOptions): ExportGeometry {
  return {
    width: 430,
    height: options.outputMode === 'screen' ? options.outputHeight * 430 / options.outputWidth : undefined,
    pixelRatio: options.exportScale * options.outputWidth / 430,
  }
}

interface RenderOptions {
  pixelRatio: number
  width: number
  height?: number
  cacheBust: boolean
  backgroundColor: string
  skipAutoScale: boolean
}

export type ChatImageRenderer = (node: HTMLElement, options: RenderOptions) => Promise<string>

async function waitForPaint(): Promise<void> {
  if (typeof requestAnimationFrame !== 'function') return
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

async function waitForImages(node: HTMLElement): Promise<void> {
  await Promise.all(Array.from(node.querySelectorAll('img')).map(async (image) => {
    try {
      await image.decode()
    } catch (cause) {
      // React may replace a failed image with readable fallback text. The PNG
      // renderer cannot distinguish that fallback from successfully loaded UI.
      const kind = image.hasAttribute('data-inline-emoji') ? 'emoji' : image.closest('[data-quote-preview]') ? 'quote' : 'image'
      throw new ExportResourceError(kind, { cause })
    }
  }))
}

function assertResourcesReady(node: HTMLElement): void {
  if (node.querySelector('[data-emoji-error]')) throw new ExportResourceError('emoji')
  if (node.querySelector('[data-quote-image-error]')) throw new ExportResourceError('quote')
  if (node.querySelector('[data-voice-error]')) throw new ExportResourceError('voice')
  if (node.querySelector('[data-map-image-error]')) throw new ExportResourceError('map')
  if (node.querySelector('[data-wallpaper-error], [data-wallpaper-loading]')) throw new ExportResourceError('wallpaper')
  if (node.querySelector('[data-quote-image-loading]')) throw new ExportResourceError('loading')
  for (const image of node.querySelectorAll('img')) {
    // Also reject images mounted after the decode snapshot was taken.
    if (!image.complete || !image.naturalWidth || !image.naturalHeight) throw new ExportResourceError('image')
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function buildExportFilename(title: string, now = new Date()): string {
  const cleanedTitle = title
    .trim()
    .replaceAll(/[\\/:*?"<>|]+/g, '-')
    .replaceAll(/\s+/g, ' ')
    .replaceAll(/^-+|-+$/g, '') || '聊天截图'
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `${cleanedTitle}-${stamp}.png`
}

export async function exportChatImage(
  node: HTMLElement,
  title: string,
  options: ExportGeometryOptions = { outputMode: 'screen', outputWidth: 430, outputHeight: 932, exportScale: 3 },
  renderer?: ChatImageRenderer,
  now = new Date(),
): Promise<{ filename: string; dataUrl: string }> {
  const activeRenderer = renderer ?? (await import('./htmlToImageRenderer')).renderChatImage
  await document.fonts?.ready
  const geometry = getExportGeometry(options)
  const previousExportMode = node.dataset.exportMode
  const previousCaptureHeight = node.style.getPropertyValue('--capture-height')
  const content = options.outputMode === 'screen' ? node.querySelector<HTMLElement>('[data-chat-message-content]') : null
  const list = content?.parentElement
  const scrollTop = list?.scrollTop ?? 0
  const previousTransform = content?.style.transform ?? ''
  const previousOverflow = list?.style.overflowY ?? ''
  const previousScrollMarker = list?.dataset.captureScroll
  // Native scrollTop is not cloned by html-to-image. Freeze it into a CSS
  // transform before the custom capture height can clamp the live scroll offset.
  if (content && list) {
    list.dataset.captureScroll = 'true'
    list.style.overflowY = 'hidden'
    content.style.transform = `translateY(-${scrollTop}px)`
    list.scrollTop = 0
  }
  node.dataset.exportMode = 'true'
  if (geometry.height === undefined) node.style.removeProperty('--capture-height')
  else node.style.setProperty('--capture-height', `${geometry.height}px`)
  try {
    await waitForPaint()
    await waitForImages(node)
    // Flush late resource callbacks and React fallbacks before the final check.
    await waitForPaint()
    const sizeError = exportSizeError(geometry.width * geometry.pixelRatio, (geometry.height ?? (node.offsetHeight || options.outputHeight)) * geometry.pixelRatio)
    if (sizeError) throw new Error(sizeError)
    // No asynchronous work may separate this guard from entering the renderer.
    assertResourcesReady(node)
    const dataUrl = await activeRenderer(node, {
      pixelRatio: geometry.pixelRatio,
      width: geometry.width,
      height: geometry.height,
      // Appending a cache-busting query makes browser Blob URLs invalid.
      // Uploaded media already has a unique asset URL, so the cached value is safe here.
      cacheBust: false,
      skipAutoScale: true,
      backgroundColor: getComputedStyle(node).backgroundColor,
    })
    return { filename: buildExportFilename(title, now), dataUrl }
  } finally {
    if (previousExportMode === undefined) delete node.dataset.exportMode
    else node.dataset.exportMode = previousExportMode
    if (previousCaptureHeight) node.style.setProperty('--capture-height', previousCaptureHeight)
    else node.style.removeProperty('--capture-height')
    if (content && list) {
      content.style.transform = previousTransform
      list.style.overflowY = previousOverflow
      list.scrollTop = scrollTop
      // Drain synthetic scroll events while the persistence callback is paused.
      await waitForPaint()
      if (previousScrollMarker === undefined) delete list.dataset.captureScroll
      else list.dataset.captureScroll = previousScrollMarker
    }
  }
}
