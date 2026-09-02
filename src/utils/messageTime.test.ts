import { describe, expect, it } from 'vitest'
import type { Message } from '../app/chatTypes'
import { formatMessageTime, shouldShowMessageTime } from './messageTime'

const message = (id: string, sentAt: string): Message => ({
  id,
  sentAt,
  participantId: 'self',
  kind: 'text',
  text: id,
  showReeditLink: false,
  media: null,
  quote: null,
  voice: null,
  voiceUnread: false,
  call: null,
  side: 'auto',
  timeVisibility: 'auto',
})

describe('shouldShowMessageTime', () => {
  const messages = [
    message('a', '2026-08-27T10:00:00+08:00'),
    message('b', '2026-08-27T10:04:59+08:00'),
    message('c', '2026-08-27T10:10:00+08:00'),
  ]

  it('shows the first message and gaps of at least five minutes', () => {
    expect(shouldShowMessageTime(messages, 0, 'smart')).toBe(true)
    expect(shouldShowMessageTime(messages, 1, 'smart')).toBe(false)
    expect(shouldShowMessageTime(messages, 2, 'smart')).toBe(true)
  })

  it('hides every divider in hidden mode', () => {
    expect(shouldShowMessageTime(messages, 0, 'hidden')).toBe(false)
  })

  it('supports per-message force show and force hide', () => {
    const forced = [
      { ...message('a', '2026-08-27T10:00:00+08:00'), timeVisibility: 'hide' as const },
      { ...message('b', '2026-08-27T10:01:00+08:00'), timeVisibility: 'show' as const },
    ]
    expect(shouldShowMessageTime(forced, 0, 'smart')).toBe(false)
    expect(shouldShowMessageTime(forced, 1, 'smart')).toBe(true)
    expect(shouldShowMessageTime(forced, 1, 'hidden')).toBe(false)
  })

  it('does not show time for invalid indexes or invalid dates', () => {
    expect(shouldShowMessageTime(messages, -1, 'smart')).toBe(false)
    expect(shouldShowMessageTime(messages, messages.length, 'smart')).toBe(false)
    expect(shouldShowMessageTime([message('bad', 'invalid')], 0, 'smart')).toBe(false)
  })
})

describe('formatMessageTime', () => {
  const now = new Date('2026-08-27T18:00:00+08:00')

  it.each([
    ['2026-08-27T15:20:00+08:00', '15:20'],
    ['2026-08-26T21:08:00+08:00', '昨天 21:08'],
    ['2026-08-20T16:28:00+08:00', '8月20日 16:28'],
    ['2025-01-04T17:12:00+08:00', '2025年1月4日 17:12'],
  ])('formats %s as %s', (sentAt, expected) => {
    expect(formatMessageTime(sentAt, now)).toBe(expected)
  })

  it('returns an empty label for an invalid date', () => {
    expect(formatMessageTime('not-a-date', now)).toBe('')
  })

  it.each([
    ['2026-08-28T09:30:00+08:00', '星期五 09:30'],
    ['2026-08-24T09:30:00+08:00', '星期一 09:30'],
    ['2026-08-23T09:30:00+08:00', '8月23日 09:30'],
  ])('uses weekday labels only for two to six local calendar days: %s', (sentAt, expected) => {
    expect(formatMessageTime(sentAt, new Date('2026-08-30T12:00:00+08:00'))).toBe(expected)
  })
})
