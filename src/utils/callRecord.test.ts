import { describe, expect, it } from 'vitest'
import type { CallRecord } from '../app/chatTypes'
import { formatCallRecord } from './callRecord'

describe('formatCallRecord', () => {
  it.each([
    [{ mode: 'voice', status: 'duration', durationSeconds: 30 }, '通话时长 00:30'],
    [{ mode: 'video', status: 'duration', durationSeconds: 3723 }, '通话时长 01:02:03'],
    [{ mode: 'voice', status: 'cancelled', durationSeconds: 0 }, '已取消'],
    [{ mode: 'voice', status: 'missed', durationSeconds: 0 }, '未接听'],
    [{ mode: 'video', status: 'unanswered', durationSeconds: 0 }, '对方无应答'],
  ] satisfies Array<[CallRecord, string]>)('formats %j', (record, expected) => {
    expect(formatCallRecord(record)).toBe(expected)
  })
})
