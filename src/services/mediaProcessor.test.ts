import { afterEach, describe, expect, it, vi } from 'vitest'

import { processAudioFile, processImageFile } from './mediaProcessor'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('processImageFile', () => {
  it('reads dimensions from an allowed image', async () => {
    const close = vi.fn()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 640, height: 480, close }),
    )

    const result = await processImageFile(
      new File(['image'], 'photo.png', { type: 'image/png' }),
    )

    expect(result).toEqual({ mimeType: 'image/png', width: 640, height: 480 })
    expect(close).toHaveBeenCalledOnce()
  })

  it('rejects unsupported and oversized images', async () => {
    await expect(
      processImageFile(new File(['svg'], 'icon.svg', { type: 'image/svg+xml' })),
    ).rejects.toThrow('仅支持 JPG、PNG、WebP 或 GIF 图片')

    await expect(
      processImageFile({
        name: 'large.png',
        type: 'image/png',
        size: 15 * 1024 * 1024 + 1,
      } as File),
    ).rejects.toThrow('图片不能超过 15 MB')
  })
})

describe('processAudioFile', () => {
  it.each([
    ['clip.mp3', '', 'audio/mpeg'],
    ['clip.m4a', '', 'audio/mp4'],
    ['clip.wav', '', 'audio/wav'],
  ])('accepts %s by extension fallback', async (name, type, mimeType) => {
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:audio'),
      revokeObjectURL,
    })
    vi.stubGlobal(
      'Audio',
      class extends EventTarget {
        duration = 2.01
        preload = ''
        src = ''

        addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
          super.addEventListener(type, listener)
          if (type === 'loadedmetadata') {
            queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata')))
          }
        }
      },
    )

    await expect(
      processAudioFile(new File(['audio'], name, { type })),
    ).resolves.toEqual({ mimeType, durationSeconds: 3 })
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:audio')
  })

  it('rejects audio over 30 MB before reading metadata', async () => {
    await expect(
      processAudioFile({
        name: 'large.wav',
        type: 'audio/wav',
        size: 30 * 1024 * 1024 + 1,
      } as File),
    ).rejects.toThrow('音频不能超过 30 MB')
  })
})
