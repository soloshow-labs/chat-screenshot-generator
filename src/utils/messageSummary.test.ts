import { describe, expect, it } from 'vitest'
import { createMessage } from '../app/messageFactory'
import { messageOptionLabel } from './messageSummary'

describe('message option summaries', () => {
  it('uses rich kind and payload even when imported text is retained', () => {
    expect(messageOptionLabel(createMessage('self', { kind: 'link', text: '旧文本', link: { title: '周报', url: '', description: '', thumbnailDataUrl: null } }), 0)).toBe('1. 链接 · 周报')
    expect(messageOptionLabel(createMessage('self', { kind: 'recall', text: '撤回内容' }), 0)).toBe('1. 撤回内容')
  })
  it('distinguishes every kind with Chinese labels', () => {
    const kinds = ['text', 'image', 'voice', 'call', 'recall', 'link', 'video', 'file', 'payment', 'contact', 'location'] as const
    const labels = kinds.map(kind => messageOptionLabel(createMessage('self', { kind }), 0))
    expect(new Set(labels).size).toBe(kinds.length)
    expect(labels.join(' ')).not.toMatch(/image|voice|payment/)
    expect(messageOptionLabel(createMessage('self', { kind: 'payment', payment: { mode: 'red-packet', amount: 8, note: '', status: 'pending' } }), 2)).toBe('3. 红包 · ¥8.00')
  })
  it('includes card names and filenames and bounds long text', () => {
    expect(messageOptionLabel(createMessage('self', { kind: 'link', link: { title: '周报', url: '', description: '', thumbnailDataUrl: null } }), 1)).toBe('2. 链接 · 周报')
    expect(messageOptionLabel(createMessage('self', { text: '长'.repeat(50) }), 0)).toBe(`1. ${'长'.repeat(24)}`)
  })
})
