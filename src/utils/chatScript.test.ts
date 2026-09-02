import { describe, expect, it } from 'vitest'
import { SAMPLE_DRAFT } from '../app/sampleDraft'
import { applyChatScript, parseChatScript } from './chatScript'

describe('chat scripts', () => {
  it('parses first Chinese/ASCII colon and continuation with line errors', () => {
    expect(parseChatScript('孤立行\n\n 小美：你好:朋友\n续行\n: 无名\n阿花: 好')).toEqual({
      entries: [
        { line: 3, name: '小美', kind: 'text', text: '你好:朋友\n续行\n: 无名' },
        { line: 6, name: '阿花', kind: 'text', text: '好' },
      ],
      errors: [{ line: 1, message: expect.any(String) }],
    })
  })
  it('parses local rich-message markers without treating inline emoji or escaped markers as commands', () => {
    expect(parseChatScript([
      '10:30',
      '小美：[图片]',
      '我：[语音 8s] 我马上到[微笑]',
      '小美：[红包 88.00] 周末快乐',
      '我：[转账]52.50:晚饭钱',
      String.raw`小美：\[语音 9s] 这是普通文字`,
    ].join('\n')).entries).toEqual([
      { line: 2, name: '小美', kind: 'image', text: '', time: '10:30' },
      { line: 3, name: '我', kind: 'voice', text: '', voice: { durationMode: 'manual', durationSeconds: 8, transcript: '我马上到[微笑]', showTranscript: true } },
      { line: 4, name: '小美', kind: 'payment', text: '', payment: { mode: 'red-packet', amount: 88, note: '周末快乐', status: 'pending' } },
      { line: 5, name: '我', kind: 'payment', text: '', payment: { mode: 'transfer', amount: 52.5, note: '晚饭钱', status: 'pending' } },
      { line: 6, name: '小美', kind: 'text', text: '[语音 9s] 这是普通文字' },
    ])
  })
  it('reports malformed time, voice and payment commands on their source lines', () => {
    expect(parseChatScript('25:61\n小美：测试\n我：[语音 0s]\n小美：[转账 abc] 备注').errors).toEqual([
      { line: 1, message: expect.stringContaining('时间') },
      { line: 3, message: expect.stringContaining('1–60') },
      { line: 4, message: expect.stringContaining('金额') },
    ])
  })
  it('parses structured and custom system lines without storing HTML', () => {
    expect(parseChatScript('[系统 邀请] 小美|阿花\n[系统] 你已开启朋友验证').entries).toEqual([
      { line: 1, name: '我', kind: 'system', text: '', system: { subtype: 'invite', actorId: null, actorName: '小美', targetId: null, targetName: '阿花', detail: '' } },
      { line: 2, name: '我', kind: 'system', text: '', system: { subtype: 'custom', actorId: null, actorName: '', targetId: null, targetName: '', detail: '你已开启朋友验证' } },
    ])
  })
  const options = { mode: 'append' as const, startTime: '2026-08-31T10:00:00+08:00', intervalMinutes: 2 }
  it('matches trimmed names, preserves self, creates members and literal explicit timestamps', () => {
    const draft = { ...SAMPLE_DRAFT, conversationType: 'direct' as const, participants: SAMPLE_DRAFT.participants.slice(0, 2), messages: [] }
    const result = applyChatScript(draft, [{ name: ' 小美 ', text: 'a' }, { name: '新人', text: 'b' }], options)
    expect(result.participants.filter(p => p.isSelf).map(p => p.id)).toEqual(['self'])
    expect(result.messages.map(m => m.sentAt)).toEqual(['2026-08-31T02:00:00.000Z', '2026-08-31T02:02:00.000Z'])
    expect(result.messages[0].participantId).toBe('self')
    expect(result.participants.find(p => p.id === result.messages[1].participantId)?.name).toBe('新人')
    expect(result.conversationType).toBe('group')
    expect(draft.messages).toEqual([])
  })
  it('creates typed messages, initializes payment identities and lets time lines reset the interval cursor', () => {
    const draft = { ...SAMPLE_DRAFT, conversationType: 'direct' as const, participants: SAMPLE_DRAFT.participants.slice(0, 2), messages: [] }
    const entries = parseChatScript('10:30\n小美：[图片]\n我：[语音 8s] 马上到\n我：[转账 52.00] 晚饭').entries
    const result = applyChatScript(draft, entries, options)
    expect(result.messages.map(message => [message.kind, message.sentAt])).toEqual([
      ['image', '2026-08-31T02:30:00.000Z'],
      ['voice', '2026-08-31T02:32:00.000Z'],
      ['payment', '2026-08-31T02:34:00.000Z'],
    ])
    expect(result.messages[1].voice).toEqual({ durationMode: 'manual', durationSeconds: 8, transcript: '马上到', showTranscript: true })
    expect(result.messages[2].payment).toMatchObject({ amount: 52, payerId: 'self', receiverId: 'p2', payerName: '小美', receiverName: '阿花' })
  })
  it('resolves structured system participants and creates a referenced missing member', () => {
    const draft = { ...SAMPLE_DRAFT, conversationType: 'direct' as const, participants: SAMPLE_DRAFT.participants.slice(0, 1), messages: [] }
    const result = applyChatScript(draft, parseChatScript('[系统 邀请] 小美|新人').entries, options)
    const system = result.messages[0].system!
    expect(system.actorId).toBe('self')
    expect(result.participants.find(participant => participant.id === system.targetId)?.name).toBe('新人')
    expect(result.conversationType).toBe('direct')
    const alias = applyChatScript(SAMPLE_DRAFT, parseChatScript('[系统 拍一拍] 我|阿花').entries, options).messages.at(-1)?.system
    expect(alias).toMatchObject({ actorId: 'self', actorName: '小美', targetId: 'p2', targetName: '阿花' })
  })
  it('inserts after selection, appends, and replace clears obsolete capture bounds', () => {
    const entries = [{ name: '小美', text: 'inserted' }]
    const draft = { ...SAMPLE_DRAFT, captureStartMessageId: 'm1', captureEndMessageId: 'm2' }
    expect(applyChatScript(draft, entries, options).messages.at(-1)?.text).toBe('inserted')
    expect(applyChatScript(draft, entries, { ...options, mode: 'insert', afterId: 'm2' }).messages[2].text).toBe('inserted')
    const replaced = applyChatScript(draft, entries, { ...options, mode: 'replace' })
    expect(replaced.messages).toHaveLength(1)
    expect(replaced.captureStartMessageId).toBeNull()
    expect(replaced.captureEndMessageId).toBeNull()
    expect(replaced.participants).toEqual(draft.participants)
  })
  it('makes the first sender self only for an empty participant list', () => {
    const result = applyChatScript({ ...SAMPLE_DRAFT, participants: [], messages: [] }, [{ name: '新我', text: 'hi' }], options)
    expect(result.participants[0].isSelf).toBe(true)
  })
  it('does not clear messages for an empty parsed script', () => {
    expect(applyChatScript(SAMPLE_DRAFT, [], { ...options, mode: 'replace' })).toEqual(SAMPLE_DRAFT)
  })
  it.each([-1, 1441, NaN, Infinity])('rejects invalid interval %s', intervalMinutes => {
    expect(() => applyChatScript(SAMPLE_DRAFT, [], { ...options, intervalMinutes })).toThrow()
  })
  it('rejects bad date, stale insert ID, blank sender, and out-of-range generated dates', () => {
    expect(() => applyChatScript(SAMPLE_DRAFT, [], { ...options, startTime: 'bad' })).toThrow()
    expect(() => applyChatScript(SAMPLE_DRAFT, [], { ...options, mode: 'insert', afterId: 'stale' })).toThrow()
    expect(() => applyChatScript(SAMPLE_DRAFT, [{ name: ' ', text: 'x' }], options)).toThrow()
    expect(() => applyChatScript(SAMPLE_DRAFT, [{ name: 'a', text: 'x' }, { name: 'b', text: 'y' }], { ...options, startTime: '+275760-09-13T00:00:00.000Z' })).toThrow()
  })
})
