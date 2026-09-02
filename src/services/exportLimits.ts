// Stay within html-to-image's conservative per-axis limit. Never silently
// downsample an image after the user selected its output dimensions.
export function exportSizeError(width: number, height: number): string | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return '无法确定有效的导出尺寸'
  if (width > 16384 || height > 16384) return '最终图片任一边不能超过 16384px，请降低倍率、缩小输出尺寸或分段导出'
  return null
}
