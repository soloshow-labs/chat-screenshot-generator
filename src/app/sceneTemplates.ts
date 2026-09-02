import type { ChatDraft } from './chatTypes'
import { SAMPLE_DRAFT } from './sampleDraft'
import { createMessage } from './messageFactory'
import { deleteMediaAsset, releaseMediaAssets, saveMediaAsset } from '../services/mediaAssetStore'

export const SCENE_TEMPLATES = [
  { id: 'direct', name: '两人日常单聊', description: '和朋友商量晚餐，轻松的双人对话。' },
  { id: 'three-person', name: '三人群聊', description: '三位朋友一起约周末出游。' },
  { id: 'work', name: '工作群', description: '项目进度、资料链接与会议安排。' },
  { id: 'family', name: '家庭群', description: '家人的日常问候与聚餐安排。' },
  { id: 'dark-long', name: '深色长聊天', description: '深色长图，多轮完整对话。' },
  { id: 'mixed', name: '图片与语音混合聊天', description: '本地生成的图片和可播放语音示例。' },
] as const

// A locally authored PNG: encode an uncompressed zlib scanline with CRC/Adler
// checksums. No canvas, network, external fixture, or missing-asset placeholder.
function makePng(): Uint8Array<ArrayBuffer> {
  const width = 96, height = 64
  const raw = new Uint8Array(height * (1 + width * 3))
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = y * (1 + width * 3) + 1 + x * 3
    const sun = (x - 70) ** 2 + (y - 18) ** 2 < 80
    raw.set(sun ? [255, 207, 99] : y > 42 ? [76, 139, 98] : [119, 191, 223], offset)
  }
  const crc = (data: Uint8Array): number => {
    let value = 0xffffffff
    for (const byte of data) { value ^= byte; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0) }
    return (value ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Uint8Array): Uint8Array => {
    const result = new Uint8Array(data.length + 12), view = new DataView(result.buffer)
    view.setUint32(0, data.length)
    result.set([...type].map(char => char.charCodeAt(0)), 4)
    result.set(data, 8)
    view.setUint32(result.length - 4, crc(result.subarray(4, result.length - 4)))
    return result
  }
  const header = new Uint8Array(13), headerView = new DataView(header.buffer)
  headerView.setUint32(0, width); headerView.setUint32(4, height); header[8] = 8; header[9] = 2
  const zlib = new Uint8Array(raw.length + 11), zView = new DataView(zlib.buffer)
  zlib.set([0x78, 0x01, 0x01], 0)
  zView.setUint16(3, raw.length, true); zView.setUint16(5, 0xffff ^ raw.length, true)
  zlib.set(raw, 7)
  let a = 1, b = 0
  for (const byte of raw) { a = (a + byte) % 65521; b = (b + a) % 65521 }
  zView.setUint32(zlib.length - 4, ((b << 16) | a) >>> 0)
  const chunks = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib), chunk('IEND', new Uint8Array())]
  const result = new Uint8Array(chunks.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of chunks) { result.set(part, offset); offset += part.length }
  return result
}

function makeWav(): Uint8Array<ArrayBuffer> {
  const samples = 8000
  const bytes = new Uint8Array(44 + samples * 2), view = new DataView(bytes.buffer)
  const text = (offset: number, value: string) => bytes.set([...value].map(char => char.charCodeAt(0)), offset)
  text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, samples, true); view.setUint32(28, samples * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  text(36, 'data'); view.setUint32(40, samples * 2, true)
  for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, Math.round(Math.sin(i / samples * Math.PI * 2 * 440) * 5000 * Math.sin(Math.PI * i / samples)), true)
  return bytes
}

/** Caller confirms replacement before invoking; dispatch returned draft once. */
export async function createSceneTemplate(id: string, now = new Date()): Promise<ChatDraft> {
  const template = SCENE_TEMPLATES.find(candidate => candidate.id === id)
  if (!template) throw new Error('场景模板不存在')
  if (!Number.isFinite(now.getTime())) throw new Error('模板时间无效')
  const names = id === 'work' ? ['我', '产品小林', '设计小周'] : id === 'family' ? ['我', '妈妈', '爸爸'] : ['我', '小林', '小周']
  const count = id === 'direct' || id === 'mixed' ? 2 : 3
  const participants = names.slice(0, count).map((name, index) => ({ id: crypto.randomUUID(), name, avatarDataUrl: null, isSelf: index === 0 }))
  const scripts: Record<string, string[]> = {
    direct: ['今晚一起吃饭吗？', '好呀，想吃什么？', '去上次那家面馆吧。', '六点见！'],
    'three-person': ['周末去公园走走？', '我可以带相机。', '那我准备野餐垫。', '集合时间定九点吧。'],
    work: ['今天同步一下项目进度。', '需求清单已整理好。', '设计稿下午可以评审。', '好的，三点会议室见。'],
    family: ['周末回家吃饭。', '给你做最爱吃的菜。', '我去买水果。', '好呀，大家周末见！'],
    'dark-long': Array.from({ length: 24 }, (_, index) => ['今天散步时发现一条新路线。', '沿途有什么好看的？', '有一排梧桐树，还有小咖啡馆。', '下次一起去走走吧。'][index % 4]),
    mixed: ['给你看我画的小风景。', '颜色好温柔！', '再听听这个本地生成的提示音。'],
  }
  const texts = scripts[id]
  const start = now.getTime() - (texts.length - 1) * 60_000
  if (!Number.isFinite(new Date(start).getTime())) throw new Error('模板时间超出有效范围')
  const messages = texts.map((text, index) => createMessage(participants[index % count].id, { text, sentAt: new Date(start + index * 60_000).toISOString() }))
  const draft: ChatDraft = {
    ...SAMPLE_DRAFT, participants, messages, title: id === 'direct' || id === 'mixed' ? '小林' : template.name,
    conversationType: count === 2 ? 'direct' : 'group', theme: id === 'dark-long' ? 'dark' : 'light',
    outputMode: id === 'dark-long' ? 'long' : 'screen', captureStartMessageId: null, captureEndMessageId: null, screenScrollTop: 0,
    wallpaper: null,
    statusTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
  }
  if (id !== 'mixed') return draft
  const savedIds: string[] = []
  try {
    const png = await saveMediaAsset(new File([makePng()], 'local-landscape.png', { type: 'image/png' }), { width: 96, height: 64 })
    savedIds.push(png.id)
    const wav = await saveMediaAsset(new File([makeWav()], 'local-tone.wav', { type: 'audio/wav' }), { durationSeconds: 1 })
    savedIds.push(wav.id)
    messages.splice(1, 0, createMessage(participants[0].id, { kind: 'image', sentAt: new Date(start + 30_000).toISOString(), media: { assetId: png.id, fileName: png.fileName, mimeType: png.mimeType, width: 96, height: 64, sizeBytes: png.blob.size } }))
    messages.push(createMessage(participants[0].id, { kind: 'voice', voice: { durationMode: 'auto', durationSeconds: 5, transcript: '', showTranscript: false }, sentAt: now.toISOString(), media: { assetId: wav.id, fileName: wav.fileName, mimeType: wav.mimeType, durationSeconds: 1, sizeBytes: wav.blob.size } }))
    return draft
  } catch (error) {
    const failed: string[] = []
    for (const assetId of savedIds) {
      try { await deleteMediaAsset(assetId) } catch { failed.push(assetId) }
      finally { releaseMediaAssets([assetId]) }
    }
    throw new Error(`模板创建失败：${error instanceof Error ? error.message : String(error)}${failed.length ? '；部分新素材清理失败' : ''}`, { cause: error })
  }
}
