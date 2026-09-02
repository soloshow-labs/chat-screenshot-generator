export interface MessageSlotMeasurement {
  messageId: string
  height: number
}

export interface MessageSegment {
  startMessageId: string
  endMessageId: string
}

export function measureMessageSlots(content: HTMLElement): MessageSlotMeasurement[] {
  const children = Array.from(content.children) as HTMLElement[]
  const targets = children
    .map((element, index) => ({ element, index }))
    .filter(({ element }) => Boolean(element.dataset.previewMessage))
  return targets.map(({ element, index }, targetIndex) => {
    const previous = children[index - 1]
    const start = previous && !previous.dataset.previewMessage ? previous.offsetTop : element.offsetTop
    const next = targets[targetIndex + 1]
    const nextPrevious = next ? children[next.index - 1] : null
    const end = next
      ? nextPrevious && !nextPrevious.dataset.previewMessage ? nextPrevious.offsetTop : next.element.offsetTop
      : content.scrollHeight
    return { messageId: element.dataset.previewMessage!, height: Math.max(1, end - start) }
  })
}

export function partitionMessageSlots(slots: MessageSlotMeasurement[], maxContentHeight: number): MessageSegment[] {
  if (!Number.isFinite(maxContentHeight) || maxContentHeight <= 0) throw new Error('无法确定分段截图的安全高度')
  const segments: MessageSegment[] = []
  let start: MessageSlotMeasurement | null = null
  let end: MessageSlotMeasurement | null = null
  let height = 0
  for (const slot of slots) {
    if (slot.height > maxContentHeight) throw new Error(`消息 ${slot.messageId} 本身超过单张图片的安全高度，请缩短内容后重试`)
    if (start && height + slot.height > maxContentHeight) {
      segments.push({ startMessageId: start.messageId, endMessageId: end!.messageId })
      start = slot
      height = slot.height
    } else {
      start ??= slot
      height += slot.height
    }
    end = slot
  }
  if (start && end) segments.push({ startMessageId: start.messageId, endMessageId: end.messageId })
  return segments
}

export function safeExportTitle(title: string): string {
  return title.trim().replaceAll(/[\\/:*?"<>|]+/g, '-').replaceAll(/\s+/g, ' ').replaceAll(/^-+|-+$/g, '') || '聊天截图'
}

export async function createSegmentZip(title: string, dataUrls: string[]): Promise<Blob> {
  const width = Math.max(2, String(dataUrls.length).length)
  const files = dataUrls.map((dataUrl, index) => ({
    filename: `${safeExportTitle(title)}-分段-${String(index + 1).padStart(width, '0')}.png`,
    dataUrl,
  }))
  const { createPngDataUrlZip } = await import('./pngZipArchive')
  return createPngDataUrlZip(files)
}
