const IMAGE_SIZE_LIMIT = 15 * 1024 * 1024
const AUDIO_SIZE_LIMIT = 30 * 1024 * 1024

export async function processFile(file: File) {
  if (file.size > 50 * 1024 * 1024) throw new Error('文件不能超过 50 MB')
  return { mimeType: file.type || 'application/octet-stream', sizeBytes: file.size, expired: false }
}

export async function processVideoFile(file: File) {
  const types: Record<string, string> = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' }
  const mimeType = Object.values(types).includes(file.type) ? file.type : types[file.name.split('.').pop()?.toLowerCase() ?? '']
  if (!mimeType) throw new Error('仅支持 MP4、WebM 或 MOV 视频')
  if (file.size > 100 * 1024 * 1024) throw new Error('视频不能超过 100 MB')
  const video = document.createElement('video')
  const url = URL.createObjectURL(file)
  try {
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timeout)
        video.onloadedmetadata = null
        video.onerror = null
        if (error) reject(error); else resolve()
      }
      const timeout = setTimeout(() => finish(new Error('读取视频超时，请换一个文件重试')), 10000)
      video.onloadedmetadata = () => Number.isFinite(video.duration) && video.duration > 0 && video.videoWidth > 0 && video.videoHeight > 0 ? finish() : finish(new Error('无法识别视频时长或尺寸'))
      video.onerror = () => finish(new Error('无法读取视频，浏览器不支持此编码，请换用 H.264 MP4 或 WebM'))
      video.preload = 'metadata'
      video.src = url
    })
    return { mimeType, durationSeconds: Math.ceil(video.duration), width: video.videoWidth, height: video.videoHeight, sizeBytes: file.size, posterDataUrl: null }
  } finally {
    video.removeAttribute('src')
    URL.revokeObjectURL(url)
  }
}

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

const AUDIO_MIME_TYPES: Record<string, string> = {
  'audio/mpeg': 'audio/mpeg',
  'audio/mp3': 'audio/mpeg',
  'audio/mp4': 'audio/mp4',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/wav': 'audio/wav',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
}

const AUDIO_EXTENSION_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
}

export interface ProcessedImageMetadata {
  mimeType: string
  width: number
  height: number
}

export interface ProcessedAudioMetadata {
  mimeType: string
  durationSeconds: number
}

export async function processImageFile(file: File): Promise<ProcessedImageMetadata> {
  if (!IMAGE_MIME_TYPES.has(file.type.toLowerCase())) {
    throw new Error('仅支持 JPG、PNG、WebP 或 GIF 图片')
  }
  if (file.size > IMAGE_SIZE_LIMIT) {
    throw new Error('图片不能超过 15 MB')
  }

  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file)
    if (bitmap.width <= 0 || bitmap.height <= 0) {
      throw new Error('无法识别图片尺寸')
    }
    return {
      mimeType: file.type.toLowerCase(),
      width: bitmap.width,
      height: bitmap.height,
    }
  } catch (error) {
    if (error instanceof Error && error.message === '无法识别图片尺寸') throw error
    throw new Error('无法读取图片，请换一张图片重试', { cause: error })
  } finally {
    bitmap?.close()
  }
}

function resolveAudioMimeType(file: File): string | null {
  const normalizedMime = file.type.toLowerCase()
  if (AUDIO_MIME_TYPES[normalizedMime]) return AUDIO_MIME_TYPES[normalizedMime]

  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return AUDIO_EXTENSION_TYPES[extension] ?? null
}

export async function processAudioFile(file: File): Promise<ProcessedAudioMetadata> {
  const mimeType = resolveAudioMimeType(file)
  if (!mimeType) throw new Error('仅支持 MP3、M4A 或 WAV 音频')
  if (file.size > AUDIO_SIZE_LIMIT) throw new Error('音频不能超过 30 MB')

  const objectUrl = URL.createObjectURL(file)
  try {
    const duration = await new Promise<number>((resolve, reject) => {
      const audio = new Audio()
      const finish = (error?: Error) => {
        clearTimeout(timeout)
        audio.removeEventListener('loadedmetadata', loaded)
        audio.removeEventListener('error', failed)
        if (error) reject(error); else resolve(audio.duration)
        audio.src = ''
      }
      const loaded = () => Number.isFinite(audio.duration) && audio.duration > 0 ? finish() : finish(new Error('无法识别音频时长'))
      const failed = () => finish(new Error('无法读取音频，请检查文件格式'))
      const timeout = setTimeout(() => finish(new Error('读取音频超时，请换一个文件重试')), 10000)
      audio.preload = 'metadata'
      audio.addEventListener('loadedmetadata', loaded, { once: true })
      audio.addEventListener('error', failed, { once: true })
      audio.src = objectUrl
    })

    return {
      mimeType,
      durationSeconds: Math.ceil(duration),
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
