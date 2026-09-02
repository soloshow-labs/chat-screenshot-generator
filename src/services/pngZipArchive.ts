import { strToU8, zipSync } from 'fflate'

function dataUrlBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) throw new Error('分段图片数据无效')
  const metadata = dataUrl.slice(0, comma)
  const body = dataUrl.slice(comma + 1)
  if (!metadata.includes(';base64')) return strToU8(decodeURIComponent(body))
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export function createPngDataUrlZip(files: Array<{ filename: string; dataUrl: string }>): Blob {
  return new Blob([zipSync(Object.fromEntries(files.map(file => [file.filename, dataUrlBytes(file.dataUrl)])), { level: 0 })], { type: 'application/zip' })
}
