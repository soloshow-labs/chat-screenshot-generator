import { describe, expect, it } from 'vitest'
import { computeAvatarCrop } from './avatarCropGeometry'

describe('computeAvatarCrop', () => {
  it('keeps an off-center subject instead of always center-cropping', () => {
    expect(computeAvatarCrop(800, 400, { centerX: .75, centerY: .5, zoom: 1 }))
      .toEqual({ sourceX: 400, sourceY: 0, sourceSize: 400 })
  })
  it('clamps zoom and centers at source edges without revealing empty space', () => {
    expect(computeAvatarCrop(800, 400, { centerX: 1, centerY: -1, zoom: 8 }))
      .toEqual({ sourceX: 700, sourceY: 0, sourceSize: 100 })
    expect(computeAvatarCrop(400, 800, { centerX: .5, centerY: .5, zoom: .2 }))
      .toEqual({ sourceX: 0, sourceY: 200, sourceSize: 400 })
  })
  it('uses normalized coordinates independently of the preview viewport', () => {
    expect(computeAvatarCrop(1200, 800, { centerX: .5, centerY: .75, zoom: 2 }))
      .toEqual({ sourceX: 400, sourceY: 400, sourceSize: 400 })
  })
  it('crops a 15:7 map viewport around its subject without exposing blank pixels', () => {
    expect(computeAvatarCrop(1200, 800, { centerX: .8, centerY: .2, zoom: 1 }, { aspectRatio: 15 / 7 }))
      .toEqual({ sourceX: 0, sourceY: 0, sourceWidth: 1200, sourceHeight: 560 })
    expect(computeAvatarCrop(1200, 800, { centerX: 1, centerY: 1, zoom: 2 }, { aspectRatio: 15 / 7 }))
      .toEqual({ sourceX: 600, sourceY: 520, sourceWidth: 600, sourceHeight: 280 })
  })
  it.each([[0, 400], [400, 0], [-1, 400], [Infinity, 400], [NaN, 400]])('rejects invalid source dimensions %s × %s', (width, height) => {
    expect(() => computeAvatarCrop(width, height, { centerX: .5, centerY: .5, zoom: 1 })).toThrow('尺寸')
  })
})
