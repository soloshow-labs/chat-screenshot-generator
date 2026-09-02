export interface AvatarCropPosition { centerX: number; centerY: number; zoom: number }
export interface AvatarCrop { sourceX: number; sourceY: number; sourceSize: number }
export interface RectangularCrop { sourceX: number; sourceY: number; sourceWidth: number; sourceHeight: number }
export interface AvatarCropOptions { aspectRatio?: number }

export const INITIAL_AVATAR_CROP: AvatarCropPosition = { centerX: .5, centerY: .5, zoom: 1 }

export function computeAvatarCrop(width: number, height: number, position: AvatarCropPosition): AvatarCrop
export function computeAvatarCrop(width: number, height: number, position: AvatarCropPosition, options: AvatarCropOptions): AvatarCrop | RectangularCrop
export function computeAvatarCrop(width: number, height: number, position: AvatarCropPosition, options?: AvatarCropOptions): AvatarCrop | RectangularCrop {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('图片尺寸无效，请重新选择图片')
  }
  const zoom = Number.isFinite(position.zoom) ? Math.min(4, Math.max(1, position.zoom)) : 1
  const centerX = Number.isFinite(position.centerX) ? position.centerX : .5
  const centerY = Number.isFinite(position.centerY) ? position.centerY : .5
  const aspectRatio = options?.aspectRatio
  if (!Number.isFinite(aspectRatio) || !aspectRatio || aspectRatio === 1) {
    const sourceSize = Math.min(width, height) / zoom
    return {
      sourceX: Math.max(0, Math.min(width - sourceSize, centerX * width - sourceSize / 2)),
      sourceY: Math.max(0, Math.min(height - sourceSize, centerY * height - sourceSize / 2)),
      sourceSize,
    }
  }
  const sourceHeight = Math.min(height, width / aspectRatio) / zoom
  const sourceWidth = sourceHeight * aspectRatio
  return {
    sourceX: Math.max(0, Math.min(width - sourceWidth, centerX * width - sourceWidth / 2)),
    sourceY: Math.max(0, Math.min(height - sourceHeight, centerY * height - sourceHeight / 2)),
    sourceWidth,
    sourceHeight,
  }
}
