import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildExportFilename, exportChatImage, getExportGeometry } from './exportChatImage'

describe('exportChatImage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps the 430px layout while scaling and cropping custom output sizes', () => {
    expect(getExportGeometry({ outputMode: 'screen', outputWidth: 430, outputHeight: 932, exportScale: 3 })).toEqual({
      width: 430,
      height: 932,
      pixelRatio: 3,
    })
    expect(getExportGeometry({ outputMode: 'screen', outputWidth: 860, outputHeight: 1864, exportScale: 2 })).toEqual({
      width: 430,
      height: 932,
      pixelRatio: 4,
    })
    expect(getExportGeometry({ outputMode: 'long', outputWidth: 860, outputHeight: 1864, exportScale: 2 })).toEqual({
      width: 430,
      height: undefined,
      pixelRatio: 4,
    })
  })

  it('applies custom geometry during rendering and restores the preview node', async () => {
    const node = document.createElement('div')
    node.style.backgroundColor = 'rgb(237, 237, 237)'
    const renderer = vi.fn().mockResolvedValue('data:image/png;base64,custom')
    await exportChatImage(
      node,
      '自定义',
      { outputMode: 'screen', outputWidth: 860, outputHeight: 1200, exportScale: 2 },
      renderer,
      new Date('2026-08-30T10:00:00+08:00'),
    )

    expect(renderer).toHaveBeenCalledWith(node, expect.objectContaining({
      width: 430,
      height: 600,
      pixelRatio: 4,
    }))
    expect(node.style.getPropertyValue('--capture-height')).toBe('')
    expect(node.dataset.exportMode).toBeUndefined()
  })

  it('renders the 430px canvas at 3x and builds a safe timestamped name', async () => {
    const node = document.createElement('div')
    node.style.backgroundColor = 'rgb(17, 17, 17)'
    document.body.append(node)
    const renderer = vi.fn().mockResolvedValue('data:image/png;base64,abc')
    const result = await exportChatImage(
      node,
      '项目/群',
      { outputMode: 'screen', outputWidth: 430, outputHeight: 932, exportScale: 3 },
      renderer,
      new Date('2026-08-27T10:35:00+08:00'),
    )

    expect(renderer).toHaveBeenCalledWith(node, expect.objectContaining({
      pixelRatio: 3,
      width: 430,
      cacheBust: false,
      backgroundColor: 'rgb(17, 17, 17)',
    }))
    expect(result).toEqual({
      filename: '项目-群-20260827-103500.png',
      dataUrl: 'data:image/png;base64,abc',
    })
    node.remove()
  })

  it('sanitizes forbidden characters and falls back for an empty title', () => {
    const now = new Date('2026-08-27T10:35:00+08:00')
    expect(buildExportFilename('  A/B:C*D?"E<F>G|  ', now)).toBe('A-B-C-D-E-F-G-20260827-103500.png')
    expect(buildExportFilename('   ', now)).toBe('聊天截图-20260827-103500.png')
  })

  it('waits for fonts before rendering', async () => {
    let release!: () => void
    const ready = new Promise<void>((resolve) => { release = resolve })
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready } })
    const renderer = vi.fn().mockResolvedValue('data:image/png;base64,abc')
    const promise = exportChatImage(
      document.createElement('div'),
      '测试',
      { outputMode: 'screen', outputWidth: 430, outputHeight: 932, exportScale: 3 },
      renderer,
    )
    await Promise.resolve()
    expect(renderer).not.toHaveBeenCalled()
    release()
    await promise
    expect(renderer).toHaveBeenCalledOnce()
  })

  it('propagates renderer failures', async () => {
    const renderer = vi.fn().mockRejectedValue(new Error('canvas limit'))
    await expect(exportChatImage(
      document.createElement('div'),
      '测试',
      { outputMode: 'screen', outputWidth: 430, outputHeight: 932, exportScale: 3 },
      renderer,
    )).rejects.toThrow('canvas limit')
  })
})
