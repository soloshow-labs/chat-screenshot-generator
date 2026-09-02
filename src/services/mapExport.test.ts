import { describe, expect, it, vi } from 'vitest'
import { SAMPLE_DRAFT } from '../app/sampleDraft'
import { createMessage } from '../app/messageFactory'
import { checkExportQuality } from './exportQuality'
import { exportChatImage } from './exportChatImage'

describe('map and payment export checks', () => {
  it('blocks an uploaded map that reports an error before PNG generation', async () => {
    const canvas = document.createElement('div')
    const map = document.createElement('div')
    map.dataset.mapImageError = 'true'
    canvas.append(map)
    expect(await checkExportQuality(SAMPLE_DRAFT, canvas)).toContainEqual(expect.objectContaining({ severity: 'error', code: 'invalid-map-image' }))
  })

  it('rechecks late map failure before invoking the renderer and restores export styles', async () => {
    const canvas = document.createElement('div')
    const image = document.createElement('img')
    image.dataset.exportImage = ''
    image.decode = async () => { image.dataset.mapImageError = 'true' }
    Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 960 }, naturalHeight: { value: 448 } })
    canvas.append(image)
    canvas.dataset.exportMode = 'false'
    const renderer = vi.fn(async () => 'data:image/png;base64,AAAA')
    await expect(exportChatImage(canvas, 'map', undefined, renderer)).rejects.toThrow('地图')
    expect(renderer).not.toHaveBeenCalled()
    expect(canvas.dataset.exportMode).toBe('false')
    expect(canvas.style.getPropertyValue('--capture-height')).toBe('')
  })

  it('warns when manually changed message authors contradict the payment actors', async () => {
    for (const role of ['original', 'receipt', 'notice'] as const) {
      const message = createMessage('p3', { id: 'payment', kind: 'payment', payment: {
        mode: role === 'notice' ? 'red-packet' : 'transfer', role, status: 'received', amount: 66, note: '',
        payerId: 'self', receiverId: 'p2', payerName: '小美', receiverName: '阿花', sourceMessageId: null,
      } })
      const issues = await checkExportQuality({ ...SAMPLE_DRAFT, messages: [message] })
      expect(issues).toContainEqual(expect.objectContaining({ severity: 'warning', code: 'payment-actor-mismatch', messageId: 'payment' }))
    }
  })
})
