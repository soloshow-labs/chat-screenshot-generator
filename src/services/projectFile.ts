import type { ChatDraft, MediaAttachment } from '../app/chatTypes'
import { migrateChatDraft } from './draftStore'
import { deleteMediaAsset, getMediaAsset, releaseMediaAssets, saveMediaAsset } from './mediaAssetStore'
import { getDraftMedia } from '../utils/draftMedia'
import { remapPaymentIds } from '../utils/paymentMessage'

const PROJECT_FILE_TYPE = 'chat-screenshot-project'

export interface ProjectFileV1 {
  fileType: typeof PROJECT_FILE_TYPE
  formatVersion: 1
  exportedAt: string
  draft: ChatDraft
  assets: { originalAssetId: string; fileName: string; mimeType: string; dataUrl: string }[]
}
export const MAX_PROJECT_FILE_BYTES = 150 * 1024 * 1024
export const LARGE_PROJECT_FILE_BYTES = 50 * 1024 * 1024
const MIME = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i

function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function canonicalMime(value: string): string {
  if (!value) return 'application/octet-stream'
  if (!MIME.test(value)) throw new Error('媒体 MIME 类型无效')
  return value.toLowerCase()
}
function references(draft: ChatDraft): Map<string, MediaAttachment> {
  const refs = new Map<string, MediaAttachment>()
  for (const media of getDraftMedia(draft)) refs.set(media.assetId, media)
  return refs
}
function dataUrlPayload(value: string, mimeType: string): string {
  const prefix = `data:${mimeType};base64,`
  if (!value.startsWith(prefix)) throw new Error('媒体 Data URL 与 MIME 类型不一致')
  const payload = value.slice(prefix.length)
  if (payload.length % 4 !== 0) throw new Error('媒体 Base64 编码无效')
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0
  // An explicit scan has constant stack usage even near the project size limit.
  // '=' is only permitted in the already counted trailing padding positions.
  for (let index = 0; index < payload.length - padding; index++) {
    const code = payload.charCodeAt(index)
    if (!((code >= 65 && code <= 90) || (code >= 97 && code <= 122)
      || (code >= 48 && code <= 57) || code === 43 || code === 47)) throw new Error('媒体 Base64 编码无效')
  }
  // Canonical padding bits, checked without decoding large payloads.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  if ((payload.endsWith('==') && (alphabet.indexOf(payload.at(-3)!) & 15) !== 0)
    || (payload.endsWith('=') && !payload.endsWith('==') && (alphabet.indexOf(payload.at(-2)!) & 3) !== 0)) throw new Error('媒体 Base64 编码无效')
  return payload
}
function validateLocalImage(value: string | null | undefined): void {
  if (value == null) return
  const match = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,/.exec(value)
  if (!match) throw new Error('内联图片必须是本地图片 Data URL')
  if (!dataUrlPayload(value, match[1])) throw new Error('内联图片 Base64 编码不能为空')
}
function checkedDraft(value: unknown, repairMissingSources = false): ChatDraft {
  // Only absent IDs are repairable. Bad field types and self references must
  // still reach the schema validator unchanged and be rejected.
  if (repairMissingSources && record(value) && value.schemaVersion === 3 && Array.isArray(value.messages)) {
    const ids = new Set(value.messages.filter(record).map(message => message.id))
    value = { ...value, messages: value.messages.map(message => {
      if (!record(message)) return message
      let next = message
      for (const field of ['quote', 'payment'] as const) {
        const payload = message[field]
        if (record(payload) && typeof payload.sourceMessageId === 'string' && !ids.has(payload.sourceMessageId)) {
          // Original cards cannot have a source; do not repair that invalid shape.
          if (field === 'payment' && payload.role !== 'receipt' && payload.role !== 'notice') continue
          next = { ...next, [field]: { ...payload, sourceMessageId: null } }
        }
      }
      return next
    }) }
  }
  const draft = migrateChatDraft(value)
  for (const participant of draft.participants) validateLocalImage(participant.avatarDataUrl)
  for (const message of draft.messages) {
    for (const media of [message.media, message.quote?.media].filter((media): media is MediaAttachment => media != null)) validateLocalImage(media.posterDataUrl)
    validateLocalImage(message.link?.thumbnailDataUrl)
    validateLocalImage(message.contactCard?.avatarDataUrl)
    validateLocalImage(message.location?.mapDataUrl)
    if (message.media) message.media = { ...message.media, mimeType: canonicalMime(message.media.mimeType) }
    if (message.quote?.media) message.quote = { ...message.quote, media: { ...message.quote.media, mimeType: canonicalMime(message.quote.media.mimeType) } }
  }
  if (draft.wallpaper?.type === 'image') draft.wallpaper = { ...draft.wallpaper, media: { ...draft.wallpaper.media, mimeType: canonicalMime(draft.wallpaper.media.mimeType) } }
  return draft
}
function ensureSize(bytes: number): void {
  if (bytes > MAX_PROJECT_FILE_BYTES) throw new Error('项目文件超过 150 MB 上限，请减少媒体素材')
}
function blobDataUrl(blob: Blob, mimeType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(`data:${mimeType};base64,${String(reader.result).split(',')[1]}`)
    reader.onerror = () => reject(new Error('无法读取项目媒体素材'))
    reader.readAsDataURL(blob)
  })
}

/** UI calls this with estimateProjectExportSize before starting a large export. */
export function getProjectExportWarning(bytes: number): string | null {
  return bytes >= LARGE_PROJECT_FILE_BYTES ? '项目包含较多媒体，导出可能占用较多内存和时间。是否继续？' : null
}

/** Conservative JSON byte estimate; no Base64 conversion. Throws for missing media. */
export async function estimateProjectExportSize(draft: ChatDraft): Promise<number> {
  let size = new Blob([JSON.stringify(draft)]).size + 256
  for (const [id] of references(draft)) {
    const asset = await getMediaAsset(id)
    if (!asset) throw new Error(`媒体素材缺失：${id}`)
    size += Math.ceil(asset.blob.size / 3) * 4 + new Blob([JSON.stringify({ originalAssetId: id, fileName: asset.fileName, mimeType: asset.mimeType })]).size + 128
  }
  return size
}

export async function serializeProject(input: ChatDraft): Promise<string> {
  // Snapshot before asynchronous reads; editing the caller draft cannot change export.
  const draft = checkedDraft(JSON.parse(JSON.stringify(input)))
  ensureSize(await estimateProjectExportSize(draft))
  const assets: ProjectFileV1['assets'] = []
  for (const [id] of references(draft)) {
    const asset = await getMediaAsset(id)
    if (!asset) throw new Error(`媒体素材缺失：${id}`)
    const mimeType = canonicalMime(asset.mimeType)
    for (const media of getDraftMedia(draft)) if (media.assetId === id && media.mimeType !== mimeType) throw new Error('媒体记录与消息的 MIME 类型不一致')
    assets.push({ originalAssetId: id, fileName: asset.fileName, mimeType, dataUrl: await blobDataUrl(asset.blob, mimeType) })
  }
  const project: ProjectFileV1 = { fileType: PROJECT_FILE_TYPE, formatVersion: 1, exportedAt: new Date().toISOString(), draft, assets }
  const json = JSON.stringify(project)
  ensureSize(new Blob([json]).size)
  return json
}

/**
 * Validates everything before persistence. Returned draft owns fresh, pinned IDs.
 * Dispatch it as one history action; do not release success pins before cleanup
 * observes the committed draft. This function never updates the current draft.
 */
export async function importProject(json: string): Promise<ChatDraft> {
  ensureSize(json.length)
  ensureSize(new Blob([json]).size)
  let parsed: unknown
  try { parsed = JSON.parse(json) } catch { throw new Error('项目 JSON 格式无效') }
  if (!record(parsed) || parsed.fileType !== PROJECT_FILE_TYPE) throw new Error('不是有效的聊天项目文件')
  if (parsed.formatVersion !== 1) throw new Error('不支持的项目文件版本')
  if (typeof parsed.exportedAt !== 'string' || !Number.isFinite(new Date(parsed.exportedAt).getTime())) throw new Error('项目导出时间无效')
  if (!Array.isArray(parsed.assets)) throw new Error('项目媒体列表无效')
  const draft = checkedDraft(parsed.draft, true)
  const refs = references(draft)
  const seen = new Set<string>()
  const validated = parsed.assets.map((asset: unknown) => {
    if (!record(asset) || typeof asset.originalAssetId !== 'string' || !asset.originalAssetId || typeof asset.fileName !== 'string' || typeof asset.mimeType !== 'string' || typeof asset.dataUrl !== 'string') throw new Error('项目媒体条目无效')
    if (seen.has(asset.originalAssetId)) throw new Error('项目包含重复的媒体素材')
    seen.add(asset.originalAssetId)
    if (!refs.has(asset.originalAssetId)) throw new Error('项目包含未引用的媒体素材')
    const mimeType = canonicalMime(asset.mimeType)
    const payload = dataUrlPayload(asset.dataUrl, mimeType)
    for (const media of getDraftMedia(draft)) {
      if (media.assetId !== asset.originalAssetId) continue
      if (media.mimeType !== mimeType) throw new Error('媒体记录与消息的 MIME 类型不一致')
      // Message sizeBytes is editable display metadata; the stored asset size
      // is derived from decoded bytes below, independently of this label.
    }
    return { id: asset.originalAssetId, fileName: asset.fileName, mimeType, payload }
  })
  if ([...refs.keys()].some(id => !seen.has(id))) throw new Error('项目缺少消息引用的媒体素材')

  const participantIds = new Map(draft.participants.map(participant => [participant.id, crypto.randomUUID()]))
  const messageIds = new Map(draft.messages.map(message => [message.id, crypto.randomUUID()]))
  const assetIds = new Map<string, string>()
  try {
    for (const asset of validated) {
      const bytes = Uint8Array.from(atob(asset.payload), char => char.charCodeAt(0))
      const attachment = refs.get(asset.id)!
      const metadata = {
        mimeType: asset.mimeType, width: attachment.width, height: attachment.height,
        durationSeconds: attachment.durationSeconds, sizeBytes: bytes.length,
        expired: attachment.expired, posterDataUrl: attachment.posterDataUrl,
      }
      const saved = await saveMediaAsset(new File([bytes], asset.fileName, { type: asset.mimeType }), metadata)
      assetIds.set(asset.id, saved.id)
    }
  } catch (error) {
    const cleanupErrors: unknown[] = []
    for (const id of assetIds.values()) {
      try { await deleteMediaAsset(id) } catch (cleanupError) { cleanupErrors.push(cleanupError) }
      finally { releaseMediaAssets([id]) }
    }
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`项目导入失败：${reason}${cleanupErrors.length ? '；部分新素材清理失败，请重试' : ''}`, { cause: error })
  }
  return {
    ...draft,
    participants: draft.participants.map(participant => ({ ...participant, id: participantIds.get(participant.id)! })),
    messages: draft.messages.map(message => ({
      ...message, id: messageIds.get(message.id)!, participantId: participantIds.get(message.participantId)!,
      payment: message.payment ? remapPaymentIds(message.payment, participantIds, messageIds) : message.payment,
      system: message.system ? {
        ...message.system,
        actorId: message.system.actorId === null ? null : participantIds.get(message.system.actorId) ?? null,
        targetId: message.system.targetId === null ? null : participantIds.get(message.system.targetId) ?? null,
      } : message.system,
      media: message.media ? { ...message.media, assetId: assetIds.get(message.media.assetId)! } : null,
      quote: message.quote ? {
        ...message.quote,
        sourceMessageId: message.quote.sourceMessageId === null ? null : messageIds.get(message.quote.sourceMessageId) ?? null,
        media: message.quote.media ? { ...message.quote.media, assetId: assetIds.get(message.quote.media.assetId)! } : null,
      } : null,
    })),
    wallpaper: draft.wallpaper?.type === 'image'
      ? { ...draft.wallpaper, media: { ...draft.wallpaper.media, assetId: assetIds.get(draft.wallpaper.media.assetId)! } }
      : draft.wallpaper,
    captureStartMessageId: draft.captureStartMessageId === null ? null : messageIds.get(draft.captureStartMessageId)!,
    captureEndMessageId: draft.captureEndMessageId === null ? null : messageIds.get(draft.captureEndMessageId)!,
  }
}
