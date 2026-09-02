import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copyPng, pngDataUrlToBlob } from './pngClipboard'

const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
function readBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}
class TestClipboardItem {
  constructor(private data: Record<string, Promise<Blob>>) {}
  getType(type: string) { return this.data[type] }
}
const written: Blob[] = []
const write = vi.fn(async (items: TestClipboardItem[]) => { written.push(await items[0].getType('image/png')) })
beforeEach(() => {
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('ClipboardItem', TestClipboardItem)
  vi.stubGlobal('navigator', { clipboard: { write } })
  written.length = 0
  write.mockClear().mockImplementation(async items => { written.push(await items[0].getType('image/png')) })
})
afterEach(() => vi.unstubAllGlobals())

describe('copyPng', () => {
  it('writes the generated PNG bytes as an image, not a Data URL string', async () => {
    await copyPng(async () => new Blob([signature], { type: 'image/png' }))
    expect(written).toHaveLength(1)
    expect(written[0].type).toBe('image/png')
    expect(await readBytes(written[0])).toEqual(signature)
  })

  it('calls the native write entry before the asynchronous renderer completes', async () => {
    let finish!: (blob: Blob) => void
    const factory = vi.fn(() => new Promise<Blob>(resolve => { finish = resolve }))
    const result = copyPng(factory)
    void result.catch(() => undefined)
    expect(write).toHaveBeenCalledOnce()
    expect(written).toHaveLength(0)
    await Promise.resolve()
    finish(new Blob([signature], { type: 'image/png' }))
    await result
    expect(written).toHaveLength(1)
  })

  it.each(['insecure', 'clipboard', 'item'] as const)('fails clearly without starting a render when %s is unavailable', async missing => {
    if (missing === 'insecure') vi.stubGlobal('isSecureContext', false)
    if (missing === 'clipboard') vi.stubGlobal('navigator', {})
    if (missing === 'item') vi.stubGlobal('ClipboardItem', undefined)
    const factory = vi.fn(async () => new Blob([signature], { type: 'image/png' }))
    await expect(copyPng(factory)).rejects.toThrow('无法复制图片，请使用导出 PNG')
    expect(factory).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
  })

  it('keeps the operation pending until renderer cleanup finishes after early permission denial', async () => {
    write.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'))
    let finish!: (blob: Blob) => void
    let settled = false
    const result = copyPng(() => new Promise(resolve => { finish = resolve }))
    const observed = result.catch(error => { settled = true; return error })
    await Promise.resolve(); await Promise.resolve()
    expect(settled).toBe(false)
    finish(new Blob([signature], { type: 'image/png' }))
    expect(await observed).toMatchObject({ message: '无法复制图片，请使用导出 PNG' })
    expect(written).toHaveLength(0)
  })

  it('preserves the render failure even if the native write rejects first', async () => {
    write.mockRejectedValueOnce(new Error('native clipboard failure'))
    const failure = new Error('image could not load')
    await expect(copyPng(async () => { throw failure })).rejects.toBe(failure)
    expect(written).toHaveLength(0)
  })

  it('observes synchronous factory and write failures without leaving orphan promises', async () => {
    write.mockImplementationOnce(() => { throw new Error('native synchronous failure') })
    const failure = new Error('render failure')
    await expect(copyPng(() => { throw failure })).rejects.toBe(failure)
  })

  it('waits for a started renderer even when ClipboardItem construction throws', async () => {
    vi.stubGlobal('ClipboardItem', class { constructor() { throw new Error('unsupported item') } })
    let finished = false
    await expect(copyPng(async () => {
      await Promise.resolve()
      finished = true
      return new Blob([signature], { type: 'image/png' })
    })).rejects.toThrow('无法复制图片，请使用导出 PNG')
    expect(finished).toBe(true)
  })
})

describe('pngDataUrlToBlob', () => {
  it('decodes only the already-rendered PNG without a network request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const blob = pngDataUrlToBlob(dataUrl)
    expect(blob.type).toBe('image/png')
    expect(await readBytes(blob)).toEqual(signature)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
  it.each(['https://example.com/image.png', 'data:image/jpeg;base64,aGVsbG8=', 'data:image/png;base64,???', 'data:image/png;base64,aGVsbG8='])('rejects a non-PNG or invalid generated value: %s', value => {
    expect(() => pngDataUrlToBlob(value)).toThrow()
  })
})
