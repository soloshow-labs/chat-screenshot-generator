import { expect, it } from 'vitest'
import { createMessage } from '../app/messageFactory'
import { createQuoteSnapshot } from './messageQuote'
import { getVoiceDuration } from './voiceMessage'
import { getMessageAttachments } from './messageAttachments'

const sender = { id: 'sender', name: '小明', avatarDataUrl: null, isSelf: false }
it('captures only text body or a separately owned image metadata snapshot', () => {
  const source = createMessage(sender.id, { text: '旧内容' })
  const quote = createQuoteSnapshot(source, sender)
  source.text = '新内容'; sender.name = '新名字'
  expect(quote).toMatchObject({ senderName: '小明', text: '旧内容', kind: 'text', media: null })
  const image = createMessage(sender.id, { kind: 'image', media: { assetId: 'a', fileName: 'a.png', mimeType: 'image/png', width: 40, height: 20 } })
  expect(createQuoteSnapshot(image, sender)?.media).toEqual(image.media)
  expect(createQuoteSnapshot(image, sender)?.media).not.toBe(image.media)
  expect(createQuoteSnapshot(createMessage(sender.id, { kind: 'image' }), sender)).toBeNull()
  expect(createQuoteSnapshot(createMessage(sender.id, { kind: 'voice' }), sender)).toMatchObject({ kind: 'text', text: '[语音] 5秒', media: null })
})

it('captures durable text summaries for voice, file, video and contact sources', () => {
  const quoteSender = { id: 'quote-sender', name: '小明', avatarDataUrl: null, isSelf: false }
  const sources = [
    createMessage(quoteSender.id, { id: 'voice', kind: 'voice', voice: { durationMode: 'auto', durationSeconds: 5, transcript: '', showTranscript: false }, media: { assetId: 'voice-asset', fileName: 'voice.mp3', mimeType: 'audio/mpeg', durationSeconds: 9.2 } }),
    createMessage(quoteSender.id, { id: 'file', kind: 'file', media: { assetId: 'file-asset', fileName: '报告.pdf', mimeType: 'application/pdf' } }),
    createMessage(quoteSender.id, { id: 'video', kind: 'video' }),
    createMessage(quoteSender.id, { id: 'contact', kind: 'contact', contactCard: { name: '小红', description: '', avatarDataUrl: null } }),
  ]
  const quotes = sources.map(source => createQuoteSnapshot(source, quoteSender))

  sources[0].media!.durationSeconds = 30
  sources[1].media!.fileName = '已改名.pdf'
  sources[3].contactCard!.name = '新姓名'
  quoteSender.name = '新发送人'

  expect(quotes).toEqual([
    { sourceMessageId: 'voice', senderName: '小明', kind: 'text', text: '[语音] 10秒', media: null },
    { sourceMessageId: 'file', senderName: '小明', kind: 'text', text: '[文件]报告.pdf', media: null },
    { sourceMessageId: 'video', senderName: '小明', kind: 'text', text: '[视频]', media: null },
    { sourceMessageId: 'contact', senderName: '小明', kind: 'text', text: '[个人名片]小红', media: null },
  ])
})
it('marks an automatic voice without readable duration as unknown instead of inventing a duration', () => {
  const missingDuration = createMessage(sender.id, { kind: 'voice', voice: { durationMode: 'auto', durationSeconds: 5, transcript: '', showTranscript: false }, media: null })
  expect(createQuoteSnapshot(missingDuration, sender)).toMatchObject({ kind: 'text', text: '[语音] 时长未知', media: null })
})
it('enumerates quote-only and shared image ownership without erasing either position', () => {
  const media = { assetId: 'a', fileName: 'a.png', mimeType: 'image/png', width: 40, height: 20 }
  const quote = { sourceMessageId: null, senderName: '小明', text: '', kind: 'image' as const, media }
  expect(getMessageAttachments(createMessage('self', { quote }))).toEqual([media])
  expect(getMessageAttachments(createMessage('self', { media, quote }))).toEqual([media, media])
})
it('keeps manual seconds independent of real audio and rounds long auto audio without truncation', () => {
  const message = createMessage('self', { kind: 'voice', media: { assetId: 'audio', fileName: 'a.mp3', mimeType: 'audio/mpeg', durationSeconds: 125.4 } })
  expect(getVoiceDuration(message)).toBe(5)
  expect(getVoiceDuration({ ...message, voice: { ...message.voice!, durationMode: 'auto' } })).toBe(126)
  expect(message.media?.durationSeconds).toBe(125.4)
  expect(getVoiceDuration({ ...message, voice: { ...message.voice!, durationMode: 'auto' }, media: null })).toBe(0)
})
