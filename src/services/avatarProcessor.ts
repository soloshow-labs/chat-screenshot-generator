import { computeAvatarCrop, INITIAL_AVATAR_CROP, type AvatarCropOptions, type AvatarCropPosition } from './avatarCropGeometry'

const acceptedAvatarTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
export interface AvatarEncodeOptions extends AvatarCropOptions { maxWidth?: number; maxHeight?: number }
const fallbackColors = ['#C8D8EE', '#E8C9C1', '#BFD8C7', '#D7C7E8', '#E6D6AF', '#BFDADD']

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function firstCharacter(name: string): string {
  return Array.from(name.trim())[0] || '？'
}

function colorForName(name: string): string {
  const total = Array.from(name).reduce((sum, character) => sum + character.codePointAt(0)!, 0)
  return fallbackColors[total % fallbackColors.length]
}

export function createInitialAvatar(name: string): string {
  const character = escapeXml(firstCharacter(name))
  const color = colorForName(name)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="12" fill="${color}"/><text x="64" y="68" text-anchor="middle" dominant-baseline="middle" font-family="-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif" font-size="52" font-weight="600" fill="#25313D">${character}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export async function decodeAvatar(file: File): Promise<ImageBitmap> {
  if (!acceptedAvatarTypes.has(file.type)) {
    throw new Error('仅支持 JPEG、PNG、WebP 或 GIF 图片')
  }
  if (file.size > 15 * 1024 * 1024) throw new Error('头像图片不能超过 15 MB')
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(file) }
  catch { throw new Error('图片无法解码，请重新选择 JPEG、PNG、WebP 或 GIF 图片') }
  try {
    computeAvatarCrop(bitmap.width, bitmap.height, INITIAL_AVATAR_CROP)
    if (bitmap.width * bitmap.height > 40_000_000) throw new Error('图片不能超过 4000 万像素')
    return bitmap
  } catch (error) {
    bitmap.close()
    throw error
  }
}

/** Caller owns the bitmap. Preview and encoding use this exact source rectangle. */
export function drawAvatarCrop(canvas: HTMLCanvasElement, bitmap: ImageBitmap, position: AvatarCropPosition, options?: AvatarEncodeOptions): void {
  const crop = options ? computeAvatarCrop(bitmap.width, bitmap.height, position, options) : computeAvatarCrop(bitmap.width, bitmap.height, position)
  const rectangular = 'sourceWidth' in crop
  const sourceWidth = rectangular ? crop.sourceWidth : crop.sourceSize
  const sourceHeight = rectangular ? crop.sourceHeight : crop.sourceSize
  let outputWidth: number
  let outputHeight: number
  if (!rectangular) {
    outputWidth = Math.max(1, Math.min(512, Math.floor(sourceWidth)))
    outputHeight = outputWidth
  } else {
    const maxWidth = Math.max(1, Math.floor(options?.maxWidth ?? sourceWidth))
    const maxHeight = Math.max(1, Math.floor(options?.maxHeight ?? sourceHeight))
    const aspectRatio = sourceWidth / sourceHeight
    if (Math.abs(aspectRatio - 15 / 7) < .000001) {
      const multiplier = Math.max(1, Math.floor(Math.min(sourceWidth / 15, sourceHeight / 7, maxWidth / 15, maxHeight / 7)))
      outputWidth = multiplier * 15
      outputHeight = multiplier * 7
    } else {
      const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight)
      outputWidth = Math.max(1, Math.floor(sourceWidth * scale))
      outputHeight = Math.max(1, Math.round(outputWidth / aspectRatio))
    }
  }
  canvas.width = outputWidth
  canvas.height = outputHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器无法处理头像图片')
  context.drawImage(bitmap, crop.sourceX, crop.sourceY, sourceWidth, sourceHeight, 0, 0, outputWidth, outputHeight)
}

export function encodeAvatar(bitmap: ImageBitmap, position: AvatarCropPosition = INITIAL_AVATAR_CROP, options?: AvatarEncodeOptions): string {
  if (options?.aspectRatio && Math.abs(options.aspectRatio - 15 / 7) < .000001) {
    const crop = computeAvatarCrop(bitmap.width, bitmap.height, position, options)
    if ('sourceWidth' in crop && (crop.sourceWidth < 15 || crop.sourceHeight < 7)) throw new Error('图片取景尺寸过小，请缩小后重试')
  }
  const canvas = document.createElement('canvas')
  drawAvatarCrop(canvas, bitmap, position, options)
  const webp = canvas.toDataURL('image/webp', .82)
  const result = webp.startsWith('data:image/webp;') ? webp : canvas.toDataURL('image/jpeg', .86)
  if (!/^data:image\/(?:webp|jpeg);base64,/.test(result)) throw new Error('头像编码失败，请重试')
  return result
}

export async function processAvatar(file: File): Promise<string> {
  const bitmap = await decodeAvatar(file)
  try { return encodeAvatar(bitmap) }
  finally { bitmap.close() }
}
