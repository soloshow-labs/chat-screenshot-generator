import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { SAMPLE_DRAFT } from '../app/sampleDraft'
import { checkExportQuality } from './exportQuality'
import * as projectFile from './projectFile'
import { createMessage } from '../app/messageFactory'

describe('export quality', () => {
  it('allows a manual voice without media but reports missing automatic or attached audio and quote-only images', async () => {
    const manual = createMessage('self', { kind: 'voice' })
    expect((await checkExportQuality({ ...SAMPLE_DRAFT, messages: [manual] })).filter(issue => issue.severity === 'error')).toEqual([])
    for (const message of [
      { ...manual, voice: { ...manual.voice!, durationMode: 'auto' as const } },
      { ...manual, media: { assetId: 'broken', fileName: 'a.mp3', mimeType: 'audio/mpeg', durationSeconds: 5 } },
      createMessage('self', { quote: { sourceMessageId: null, senderName: '旧成员', kind: 'image', text: '', media: { assetId: 'broken-image', fileName: 'a.png', mimeType: 'image/png', width: 20, height: 30 } } }),
    ]) expect(await checkExportQuality({ ...SAMPLE_DRAFT, messages: [message] })).toContainEqual(expect.objectContaining({ code: 'missing-asset', severity: 'error', messageId: message.id }))
  })
  it('blocks failed emoji resources only inside the actual export canvas', async () => {
    const canvas = document.createElement('div'), missing = document.createElement('span')
    missing.dataset.emojiError = 'smile'
    document.body.append(missing)
    expect((await checkExportQuality(SAMPLE_DRAFT, canvas)).some(issue => issue.code === 'missing-emoji')).toBe(false)
    canvas.append(missing)
    expect(await checkExportQuality(SAMPLE_DRAFT, canvas)).toContainEqual(expect.objectContaining({ code: 'missing-emoji', severity: 'error' }))
  })
  it('blocks a quoted image that exists in storage but fails browser decoding', async () => {
    const canvas = document.createElement('div'), missing = document.createElement('span')
    missing.dataset.quoteImageError = 'true'
    canvas.append(missing)
    expect(await checkExportQuality(SAMPLE_DRAFT, canvas)).toContainEqual(expect.objectContaining({ code: 'invalid-quote-image', severity: 'error' }))
  })
  it('blocks an attached voice that fails actual decoding even in manual display mode', async () => {
    const canvas = document.createElement('div'), error = document.createElement('span')
    error.dataset.voiceError = ''
    canvas.append(error)
    expect(await checkExportQuality(SAMPLE_DRAFT, canvas)).toContainEqual(expect.objectContaining({ code: 'invalid-voice', severity: 'error' }))
  })
  it('blocks final pixel height above the encoder limit even below the large-pixel warning', async () => {
    const canvas = document.createElement('div')
    canvas.getBoundingClientRect = () => ({ left: 0, right: 430, top: 0, bottom: 6000, width: 430, height: 6000 } as DOMRect)
    const issues = await checkExportQuality({ ...SAMPLE_DRAFT, outputMode: 'long', outputWidth: 430, exportScale: 3 }, canvas)
    expect(issues).toContainEqual(expect.objectContaining({ code: 'canvas-limit', severity: 'error' }))
    expect(issues.some(issue => issue.code === 'large-pixels')).toBe(false)
  })
  it('blocks empty and reversed ranges before normalization', async () => {
    expect(await checkExportQuality({ ...SAMPLE_DRAFT, messages: [] })).toContainEqual(expect.objectContaining({ code: 'empty-range', severity: 'error' }))
    expect(await checkExportQuality({ ...SAMPLE_DRAFT, outputMode: 'long', captureStartMessageId: 'm4', captureEndMessageId: 'm2' })).toContainEqual(expect.objectContaining({ code: 'invalid-range', severity: 'error' }))
  })
  it.each(['image', 'voice', 'video', 'file'] as const)('requires %s assets including null and absent records', async kind => {
    for (const media of [null, { assetId: 'missing', fileName: 'x', mimeType: 'image/png' }]) {
      const issues = await checkExportQuality({ ...SAMPLE_DRAFT, messages: [{ ...SAMPLE_DRAFT.messages[0], kind, media }] })
      expect(issues).toContainEqual(expect.objectContaining({ code: 'missing-asset', severity: 'error' }))
    }
  })
  it('checks sender, raw dimensions, time and cards', async () => {
    const issues = await checkExportQuality({ ...SAMPLE_DRAFT, outputWidth: 319, outputHeight: 3001, exportScale: 5 as 1, messages: [
      { ...SAMPLE_DRAFT.messages[0], sentAt: '2026-09-02', participantId: 'absent', kind: 'link', link: { title: '', description: '', url: 'javascript:alert(1)', thumbnailDataUrl: null } },
      { ...SAMPLE_DRAFT.messages[1], sentAt: '2026-09-01', kind: 'contact', contactCard: null },
    ] })
    for (const code of ['missing-sender', 'invalid-width', 'invalid-height', 'invalid-scale']) expect(issues).toContainEqual(expect.objectContaining({ code, severity: 'error' }))
    for (const code of ['reversed-time', 'missing-avatar', 'incomplete-card', 'invalid-link']) expect(issues).toContainEqual(expect.objectContaining({ code, severity: 'warning' }))
  })
  it('compares scaled visible geometry rather than output width or vertical clipped content', async () => {
    const canvas = document.createElement('div'), child = document.createElement('div')
    canvas.append(child)
    canvas.getBoundingClientRect = () => ({ left: 10, right: 225, top: 0, bottom: 400, width: 215, height: 400 } as DOMRect)
    child.getBoundingClientRect = () => ({ left: 15, right: 220, top: -10, bottom: 500, width: 205, height: 510 } as DOMRect)
    expect((await checkExportQuality({ ...SAMPLE_DRAFT, outputWidth: 320 }, canvas)).some(issue => issue.code === 'horizontal-overflow')).toBe(false)
    child.getBoundingClientRect = () => ({ left: 15, right: 240, top: 10, bottom: 100, width: 225, height: 90 } as DOMRect)
    expect(await checkExportQuality(SAMPLE_DRAFT, canvas)).toContainEqual(expect.objectContaining({ code: 'horizontal-overflow', severity: 'error' }))
  })
  it('warns for high-resolution long images', async () => {
    const canvas = document.createElement('div')
    canvas.getBoundingClientRect = () => ({ left: 0, right: 215, top: 0, bottom: 9000, width: 215, height: 9000 } as DOMRect)
    const issues = await checkExportQuality({ ...SAMPLE_DRAFT, outputMode: 'long', outputWidth: 1290, exportScale: 4 }, canvas)
    for (const code of ['long-height', 'large-pixels']) expect(issues).toContainEqual(expect.objectContaining({ code, severity: 'warning' }))
  })

  it('warns about estimated portable size without serializing assets', async () => {
    const estimate = vi.spyOn(projectFile, 'estimateProjectExportSize').mockResolvedValue(51 * 1024 * 1024)
    try { expect(await checkExportQuality(SAMPLE_DRAFT)).toContainEqual(expect.objectContaining({ code: 'large-project', severity: 'warning' })) }
    finally { estimate.mockRestore() }
  })

  it.each([
    { kind: 'location' as const, location: { name: '公园', address: '' } },
    { kind: 'payment' as const, payment: null },
    { kind: 'file' as const, media: { assetId: 'missing', fileName: '', mimeType: 'text/plain' } },
    { kind: 'system' as const, system: { subtype: 'invite' as const, actorId: null, actorName: '', targetId: null, targetName: '', detail: '' } },
  ])('warns on incomplete $kind cards', async payload => {
    expect(await checkExportQuality({ ...SAMPLE_DRAFT, messages: [{ ...SAMPLE_DRAFT.messages[0], ...payload }] })).toContainEqual(expect.objectContaining({ code: 'incomplete-card', severity: 'warning' }))
  })

  it('accepts a zero-amount red packet but rejects a zero-amount transfer or missing payment', async () => {
    const issueCodes = async (payment: { mode: 'transfer' | 'red-packet'; amount: number; note: string; status: 'pending' | 'received' | 'refunded' | 'expired' } | null) => (await checkExportQuality({
      ...SAMPLE_DRAFT,
      messages: [{ ...SAMPLE_DRAFT.messages[0], kind: 'payment', payment }],
    })).filter(issue => issue.messageId === SAMPLE_DRAFT.messages[0].id).map(issue => issue.code)

    expect(await issueCodes({ mode: 'red-packet', amount: 0, note: '', status: 'pending' })).not.toContain('incomplete-card')
    expect(await issueCodes({ mode: 'transfer', amount: 0, note: '', status: 'pending' })).toContain('incomplete-card')
    expect(await issueCodes(null)).toContain('incomplete-card')
  })

  it('allows exact dimension boundaries and ignores fully offscreen content', async () => {
    const canvas = document.createElement('div'), child = document.createElement('div')
    canvas.append(child)
    canvas.getBoundingClientRect = () => ({ left: 0, right: 430, top: 0, bottom: 932, width: 430, height: 932 } as DOMRect)
    child.getBoundingClientRect = () => ({ left: -100, right: 600, top: 933, bottom: 1000, width: 700, height: 67 } as DOMRect)
    for (const dimensions of [{ outputWidth: 320, outputHeight: 480, exportScale: 1 as const }, { outputWidth: 1290, outputHeight: 3000, exportScale: 4 as const }]) {
      const issues = await checkExportQuality({ ...SAMPLE_DRAFT, ...dimensions }, canvas)
      expect(issues.filter(issue => issue.severity === 'error')).toEqual([])
    }
  })
})
