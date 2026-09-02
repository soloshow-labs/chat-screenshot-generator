import { describe, expect, it, vi } from 'vitest'
import { clearStagedSnapshots, removeStagedSnapshot, stageSnapshot, type StagedSnapshot } from './snapshotQueue'

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlS8AAAAASUVORK5CYII='

describe('snapshotQueue', () => {
  it('stages generated PNGs and revokes URLs when removed or cleared', () => {
    const createUrl = vi.fn(() => 'blob:staged')
    const revokeUrl = vi.fn()
    const first = stageSnapshot([], { filename: 'chat.png', dataUrl: png }, 100, createUrl)
    expect(first).toMatchObject({ filename: 'chat.png', objectUrl: 'blob:staged', createdAt: 100 })
    expect(first.blob.type).toBe('image/png')
    expect(removeStagedSnapshot([first], first.id, revokeUrl)).toEqual([])
    expect(revokeUrl).toHaveBeenCalledWith('blob:staged')
    clearStagedSnapshots([first], revokeUrl)
    expect(revokeUrl).toHaveBeenCalledTimes(2)
  })

  it('rejects the 21st image and totals over 100MB without creating a URL', () => {
    const createUrl = vi.fn(() => 'blob:new')
    const full = Array.from({ length: 20 }, (_, index) => ({ id: String(index), filename: `${index}.png`, blob: new Blob(['x']), objectUrl: `blob:${index}`, createdAt: index })) satisfies StagedSnapshot[]
    expect(() => stageSnapshot(full, { filename: 'next.png', dataUrl: png }, 100, createUrl)).toThrow('暂存盘最多保留 20 张图片')
    const oversized = [{ ...full[0], blob: new Blob([new Uint8Array(100 * 1024 * 1024)]) }]
    expect(() => stageSnapshot(oversized, { filename: 'next.png', dataUrl: png }, 100, createUrl)).toThrow('暂存盘总大小不能超过 100 MB')
    expect(createUrl).not.toHaveBeenCalled()
  })
})
