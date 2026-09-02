import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInitialAvatar, processAvatar, decodeAvatar, encodeAvatar } from './avatarProcessor'

describe('avatarProcessor', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('creates deterministic escaped SVG fallback avatars', () => {
    const first = createInitialAvatar('  <小>美 ')
    const again = createInitialAvatar('  <小>美 ')
    expect(first).toBe(again)
    expect(first).toMatch(/^data:image\/svg\+xml;charset=utf-8,/)
    expect(decodeURIComponent(first)).toContain('&lt;')
    expect(decodeURIComponent(first)).not.toContain('><</text>')
  })

  it('rejects unsupported file formats', async () => {
    await expect(processAvatar(new File(['x'], 'avatar.bmp', { type: 'image/bmp' })))
      .rejects.toThrow('仅支持 JPEG、PNG、WebP 或 GIF 图片')
  })

  it('center-crops to a 512px square and exports webp', async () => {
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 1200, height: 800, close }))
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/webp;base64,done')

    await expect(processAvatar(new File(['x'], 'avatar.jpg', { type: 'image/jpeg' })))
      .resolves.toBe('data:image/webp;base64,done')
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 200, 0, 800, 800, 0, 0, 512, 512)
    expect(close).toHaveBeenCalled()
  })

  it('rejects files over 15 MB before decoding', async () => {
    const decode = vi.fn()
    vi.stubGlobal('createImageBitmap', decode)
    const file = new File(['x'], 'large.png', { type: 'image/png' })
    Object.defineProperty(file, 'size', { value: 15 * 1024 * 1024 + 1 })
    await expect(processAvatar(file)).rejects.toThrow('15 MB')
    expect(decode).not.toHaveBeenCalled()
  })

  it.each([[0, 10], [10, 0], [8001, 5000]])('rejects invalid bitmap dimensions %s × %s and closes them', async (width, height) => {
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width, height, close }))
    await expect(decodeAvatar(new File(['x'], 'a.png', { type: 'image/png' }))).rejects.toThrow(/尺寸|4000 万/)
    expect(close).toHaveBeenCalledOnce()
  })

  it('encodes the requested crop, avoids upscaling and falls back to JPEG', () => {
    const bitmap = { width: 800, height: 400, close: vi.fn() } as unknown as ImageBitmap
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
    const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValueOnce('data:image/png;base64,x').mockReturnValueOnce('data:image/jpeg;base64,x')
    expect(encodeAvatar(bitmap, { centerX: .75, centerY: .5, zoom: 2 })).toBe('data:image/jpeg;base64,x')
    expect(drawImage).toHaveBeenCalledWith(bitmap, 500, 100, 200, 200, 0, 0, 200, 200)
    expect(encode).toHaveBeenLastCalledWith('image/jpeg', .86)
    expect(bitmap.close).not.toHaveBeenCalled()
  })

  it('encodes a 15:7 map crop within 960 × 448 without enlarging the source', () => {
    const bitmap = { width: 1200, height: 800, close: vi.fn() } as unknown as ImageBitmap
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/webp;base64,map')
    expect(encodeAvatar(bitmap, { centerX: .5, centerY: .5, zoom: 1 }, { aspectRatio: 15 / 7, maxWidth: 960, maxHeight: 448 })).toBe('data:image/webp;base64,map')
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 120, 1200, 560, 0, 0, 960, 448)
  })

  it('rejects a map crop smaller than one 15:7 output pixel unit instead of upscaling it', () => {
    const bitmap = { width: 30, height: 14, close: vi.fn() } as unknown as ImageBitmap
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
    expect(() => encodeAvatar(bitmap, { centerX: .5, centerY: .5, zoom: 4 }, { aspectRatio: 15 / 7, maxWidth: 960, maxHeight: 448 })).toThrow('图片取景尺寸过小')
    expect(drawImage).not.toHaveBeenCalled()
  })

  it('closes the decoded bitmap if encoding fails', async () => {
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 800, height: 400, close }))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    await expect(processAvatar(new File(['x'], 'a.png', { type: 'image/png' }))).rejects.toThrow('浏览器')
    expect(close).toHaveBeenCalledOnce()
  })
})
