const CANVAS_WIDTH = 430

export function fitPreviewZoom(availableWidth: number): number {
  return Math.min(1, availableWidth / CANVAS_WIDTH)
}
