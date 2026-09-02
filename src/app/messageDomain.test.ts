import { describe, expect, it } from 'vitest'
import { createMessage } from './messageFactory'
import {
  createMessageKindPatch,
  createMessageQuoteSnapshot,
  getMessageDomainAttachments,
  summarizeMessage,
  validateMessageDomain,
} from './messageDomain'

describe('messageDomain', () => {
  it('owns kind defaults without retaining fields from a previous kind', () => {
    expect(createMessageKindPatch('voice')).toMatchObject({ kind: 'voice', media: null, voice: { durationMode: 'manual', durationSeconds: 5 } })
    expect(createMessageKindPatch('text')).toMatchObject({ kind: 'text', voice: null, payment: null, system: null })
  })

  it('summarizes rich messages and creates durable quote snapshots', () => {
    const file = createMessage('p2', { id: 'file', kind: 'file', media: { assetId: 'asset', fileName: '报告.pdf', mimeType: 'application/pdf' } })
    expect(summarizeMessage(file)).toBe('文件 · 报告.pdf')
    expect(createMessageQuoteSnapshot(file, '阿花')).toEqual({ sourceMessageId: 'file', senderName: '阿花', kind: 'text', text: '[文件]报告.pdf', media: null })
  })

  it('enumerates direct and quoted attachments from one interface', () => {
    const message = createMessage('self', {
      media: { assetId: 'direct', fileName: 'a.png', mimeType: 'image/png' },
      quote: { sourceMessageId: null, senderName: '阿花', kind: 'image', text: '', media: { assetId: 'quote', fileName: 'b.png', mimeType: 'image/png' } },
    })
    expect(getMessageDomainAttachments(message).map(media => media.assetId)).toEqual(['direct', 'quote'])
  })

  it('reports structural requirements without accessing UI or storage', () => {
    const invalid = createMessage('self', { kind: 'link', link: { title: '', description: '', url: 'javascript:alert(1)', thumbnailDataUrl: null } })
    expect(validateMessageDomain(invalid)).toEqual([
      { severity: 'warning', code: 'invalid-link', message: '链接 URL 缺失或无效' },
      { severity: 'warning', code: 'incomplete-card', message: '卡片缺少关键内容' },
    ])
    expect(validateMessageDomain(createMessage('self', { kind: 'image' }))).toContainEqual({ severity: 'error', code: 'missing-asset', message: '消息缺少可读取的媒体素材，请重新上传' })
  })
})
