export class PngClipboardError extends Error {
  constructor(options?: ErrorOptions) {
    super('无法复制图片，请使用导出 PNG', options)
    this.name = 'PngClipboardError'
  }
}

/** Enter native write in the click call stack; the image can finish later. */
export async function copyPng(createPng: () => Promise<Blob>): Promise<void> {
  if (!globalThis.isSecureContext || typeof navigator === 'undefined' || typeof navigator.clipboard?.write !== 'function' || typeof ClipboardItem !== 'function') {
    throw new PngClipboardError()
  }
  const png = Promise.resolve().then(createPng)
  let write: Promise<void>
  try {
    write = Promise.resolve(navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]))
  } catch (error) {
    write = Promise.reject(error)
  }
  // Permission may reject before rendering settles. Observe both promises and
  // keep the caller's export lock held until the renderer's finally has run.
  const [generated, written] = await Promise.allSettled([png, write])
  if (generated.status === 'rejected') throw generated.reason
  if (written.status === 'rejected') throw new PngClipboardError({ cause: written.reason })
}

/** Decode only our generated data URL; never fetch a supplied URL. */
export function pngDataUrlToBlob(dataUrl: string): Blob {
  if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)) throw new Error('PNG 图像数据无效')
  const binary = atob(dataUrl.slice('data:image/png;base64,'.length))
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (signature.some((byte, index) => bytes[index] !== byte)) throw new Error('PNG 图像数据无效')
  return new Blob([bytes], { type: 'image/png' })
}
