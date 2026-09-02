import type { ChatDraft } from '../app/chatTypes'
import { resolveCaptureRange } from '../utils/captureRange'
import { getMediaAsset } from './mediaAssetStore'
import { estimateProjectExportSize, LARGE_PROJECT_FILE_BYTES } from './projectFile'
import { exportSizeError } from './exportLimits'
import { getMessageAttachments } from '../utils/messageAttachments'
import { validateMessageDomain } from '../app/messageDomain'
export interface QualityIssue { severity: 'error' | 'warning'; code: string; message: string; messageId?: string }
export async function checkExportQuality(draft: ChatDraft, canvas?: HTMLElement | null): Promise<QualityIssue[]> {
  const issues: QualityIssue[] = []
  const add = (severity: QualityIssue['severity'], code: string, message: string, messageId?: string) => issues.push({ severity, code, message, ...(messageId ? { messageId } : {}) })
  const range = draft.outputMode === 'long' ? resolveCaptureRange(draft.messages, draft.captureStartMessageId, draft.captureEndMessageId) : { valid: true, messages: draft.messages }
  if (!range.valid) add('error', 'invalid-range', '截图范围不存在或顺序无效')
  else if (!range.messages.length) add('error', 'empty-range', '截图范围内没有消息')
  for (const [value, min, max, code, label] of [[draft.outputWidth, 320, 1290, 'invalid-width', '宽度'], [draft.outputHeight, 480, 3000, 'invalid-height', '高度'], [draft.exportScale, 1, 4, 'invalid-scale', '倍率']] as const) {
    if (!Number.isFinite(value) || value < min || value > max || !Number.isInteger(value)) add('error', code, `输出${label}必须在 ${min}–${max} 之间`)
  }
  for (const participant of draft.participants) if (!participant.avatarDataUrl) add('warning', 'missing-avatar', `${participant.name}没有上传自定义头像`)
  const assets = new Map<string, boolean>()
  for (const [index, message] of range.messages.entries()) {
    if (!draft.participants.some(participant => participant.id === message.participantId)) add('error', 'missing-sender', '消息发送人不存在', message.id)
    for (const issue of validateMessageDomain(message)) add(issue.severity, issue.code, issue.message, message.id)
    for (const media of getMessageAttachments(message)) {
      const id = media.assetId
      if (id && !assets.has(id)) {
        try { assets.set(id, Boolean(await getMediaAsset(id))) } catch { assets.set(id, false) }
      }
      if (!id || !assets.get(id)) add('error', 'missing-asset', '消息缺少可读取的媒体素材，请重新上传', message.id)
    }
    if (index > 0 && new Date(message.sentAt).getTime() < new Date(range.messages[index - 1].sentAt).getTime()) add('warning', 'reversed-time', '消息时间早于上一条消息', message.id)
  }
  if (canvas?.querySelector('[data-emoji-error]')) add('error', 'missing-emoji', '表情资源无法加载，请重试后导出')
  if (canvas?.querySelector('[data-quote-image-error]')) add('error', 'invalid-quote-image', '引用图片无法解码，请重新选择有效图片')
  if (canvas?.querySelector('[data-voice-error]')) add('error', 'invalid-voice', '音频无法播放，请更换有效音频或移除附件')
  if (canvas?.querySelector('[data-map-image-error]')) add('error', 'invalid-map-image', '地图截图无法解码，请重新上传有效图片')
  if (draft.wallpaper?.type === 'image') {
    try {
      if (!await getMediaAsset(draft.wallpaper.media.assetId)) add('error', 'missing-wallpaper', '聊天背景图片缺失，请重新上传')
    } catch { add('error', 'missing-wallpaper', '聊天背景图片缺失，请重新上传') }
  }
  if (canvas?.querySelector('[data-wallpaper-error], [data-wallpaper-loading]')) add('error', 'invalid-wallpaper', '聊天背景图片尚未加载完成或无法解码，请重新上传')
  const bounds = canvas?.getBoundingClientRect()
  // Canvas always lays out at logical 430px; preview transform and output width
  // are independent. Both horizontal bounds below are in viewport coordinates.
  const logicalHeight = bounds?.width ? bounds.height * 430 / bounds.width : draft.outputHeight
  const outputHeight = draft.outputMode === 'long' ? logicalHeight * draft.outputWidth / 430 : draft.outputHeight
  const sizeError = exportSizeError(draft.outputWidth * draft.exportScale, outputHeight * draft.exportScale)
  if (sizeError) add('error', 'canvas-limit', sizeError)
  if (draft.outputMode === 'long' && outputHeight > 16000) add('warning', 'long-height', '长图预计高度超过 16000px')
  if (draft.outputWidth * outputHeight * draft.exportScale ** 2 > 40_000_000) add('warning', 'large-pixels', '最终像素超过 4000 万，导出可能较慢')
  if (canvas && bounds?.width) {
    for (const element of canvas.querySelectorAll<HTMLElement>('*')) {
      const rect = element.getBoundingClientRect()
      if (!rect.width || !rect.height || rect.bottom <= bounds.top || rect.top >= bounds.bottom) continue
      const style = getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      // Ignore descendants wholly outside a scroll viewport, but not horizontal
      // clipping by that viewport: the latter is exactly what this check catches.
      let visible = true
      for (let parent = element.parentElement; parent && parent !== canvas; parent = parent.parentElement) {
        if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)) {
          const clip = parent.getBoundingClientRect()
          if (clip.height && (rect.bottom <= clip.top || rect.top >= clip.bottom)) visible = false
        }
      }
      if (visible && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1)) {
        add('error', 'horizontal-overflow', '聊天内容横向超出画布，请缩短内容或调整卡片')
        break
      }
    }
  }
  try {
    if (await estimateProjectExportSize(draft) >= LARGE_PROJECT_FILE_BYTES) add('warning', 'large-project', '项目 JSON 预计超过 50 MB')
  } catch {
    if (!issues.some(issue => issue.code === 'missing-asset')) add('error', 'missing-asset', '项目媒体素材无法读取，请重新上传')
  }
  return issues
}
