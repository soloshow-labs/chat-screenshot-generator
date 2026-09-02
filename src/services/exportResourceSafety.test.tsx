import 'fake-indexeddb/auto'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { InlineMessageText } from '../components/emoji/InlineMessageText'
import { QuotePreview } from '../components/chat/QuotePreview'
import { SAMPLE_DRAFT } from '../app/sampleDraft'
import { createMessage } from '../app/messageFactory'
import { saveMediaAsset } from './mediaAssetStore'
import { checkExportQuality } from './exportQuality'
import { exportChatImage } from './exportChatImage'

const options = { outputMode: 'screen' as const, outputWidth: 430, outputHeight: 600, exportScale: 1 as const }

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

async function resourceFixture(kind: 'emoji' | 'quote') {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:quote-snapshot')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  const asset = await saveMediaAsset(new File(['image'], 'quote.png', { type: 'image/png' }), { width: 40, height: 20 })
  const quote = { sourceMessageId: null, senderName: '保存时姓名', kind: 'image' as const, text: '', media: { assetId: asset.id, fileName: 'quote.png', mimeType: 'image/png', width: 40, height: 20 } }
  const message = createMessage('self', kind === 'quote' ? { quote } : { text: '[微笑]' })
  const { container } = render(<div data-export-mode="false" style={{ '--capture-height': '932px' } as React.CSSProperties}><div style={{ overflowY: 'scroll' }}><div data-chat-message-content style={{ transform: 'translateY(-3px)' }}>{kind === 'emoji' ? <InlineMessageText text="[微笑]" /> : <QuotePreview quote={quote} side="right" />}</div></div></div>)
  const canvas = container.firstElementChild as HTMLElement
  await waitFor(() => expect(canvas.querySelector('img')).not.toBeNull())
  const image = canvas.querySelector('img')!
  const list = canvas.querySelector('[data-chat-message-content]')!.parentElement!
  list.scrollTop = 120
  const draft = { ...SAMPLE_DRAFT, messages: [message] }
  expect((await checkExportQuality(draft, canvas)).filter(issue => issue.severity === 'error')).toEqual([])
  return { canvas, image, list }
}

it.each(['emoji', 'quote'] as const)('rejects late %s decode failure after preflight instead of rendering the fallback', async kind => {
  const { canvas, image, list } = await resourceFixture(kind)
  let rejectDecode!: (reason: Error) => void
  const decode = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectDecode = reject }))
  Object.defineProperty(image, 'decode', { configurable: true, value: decode })
  const renderer = vi.fn(async () => 'data:image/png;base64,fallback')
  const exporting = exportChatImage(canvas, 'late failure', options, renderer)
  await waitFor(() => expect(decode).toHaveBeenCalledOnce())
  fireEvent.error(image)
  rejectDecode(new Error('late decoding failure'))
  await expect(exporting).rejects.toThrow()
  expect(renderer).not.toHaveBeenCalled()
  expect(canvas.querySelector(kind === 'emoji' ? '[data-emoji-error]' : '[data-quote-image-error]')).not.toBeNull()
  expect(canvas.dataset.exportMode).toBe('false')
  expect(canvas.style.getPropertyValue('--capture-height')).toBe('932px')
  expect(list.scrollTop).toBe(120)
  expect(list.style.overflowY).toBe('scroll')
  expect(list.dataset.captureScroll).toBeUndefined()
  expect((canvas.querySelector('[data-chat-message-content]') as HTMLElement).style.transform).toBe('translateY(-3px)')
})

it.each(['data-emoji-error', 'data-quote-image-error', 'data-voice-error', 'data-quote-image-loading'])('rechecks late %s after readiness frames immediately before renderer', async marker => {
  const node = document.createElement('div')
  let frames = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => {
    if (++frames === 4) { const state = document.createElement('span'); state.setAttribute(marker, ''); node.append(state) }
    callback(0)
  }, 0))
  const renderer = vi.fn(async () => 'data:image/png;base64,fallback')
  await expect(exportChatImage(node, 'late marker', options, renderer)).rejects.toThrow()
  expect(renderer).not.toHaveBeenCalled()
  expect(node.dataset.exportMode).toBeUndefined()
  expect(node.style.getPropertyValue('--capture-height')).toBe('')
})

it('rejects an image added during final readiness paint instead of rendering its loading state', async () => {
  const node = document.createElement('div')
  let frames = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => {
    if (++frames === 4) {
      const image = document.createElement('img')
      image.src = 'blob:still-loading'
      Object.defineProperty(image, 'decode', { value: async () => undefined })
      Object.defineProperty(image, 'complete', { value: false })
      node.append(image)
    }
    callback(0)
  }, 0))
  const renderer = vi.fn(async () => 'data:image/png;base64,loading')
  await expect(exportChatImage(node, 'loading image', options, renderer)).rejects.toThrow()
  expect(renderer).not.toHaveBeenCalled()
})

it('allows a decoded stable image and restores scroll/styles after successful rendering', async () => {
  const { canvas, image, list } = await resourceFixture('emoji')
  Object.defineProperties(image, { decode: { configurable: true, value: async () => undefined }, complete: { configurable: true, value: true }, naturalWidth: { configurable: true, value: 96 }, naturalHeight: { configurable: true, value: 96 } })
  const renderer = vi.fn(async (node: HTMLElement) => {
    expect(node.querySelector('img')).toBe(image)
    expect(node.dataset.exportMode).toBe('true')
    expect(list.scrollTop).toBe(0)
    return 'data:image/png;base64,valid'
  })
  await expect(exportChatImage(canvas, 'decoded', options, renderer)).resolves.toMatchObject({ dataUrl: 'data:image/png;base64,valid' })
  expect(renderer).toHaveBeenCalledOnce()
  expect(list.scrollTop).toBe(120)
  expect(canvas.dataset.exportMode).toBe('false')
  expect(canvas.style.getPropertyValue('--capture-height')).toBe('932px')
})
