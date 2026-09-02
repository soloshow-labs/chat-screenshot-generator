import { describe, expect, it } from 'vitest'
import { SAMPLE_DRAFT } from './sampleDraft'
import { chatReducer } from './chatReducer'

describe('chatReducer', () => {
  it('keeps exactly one self participant when identity changes', () => {
    const next = chatReducer(SAMPLE_DRAFT, { type: 'mark-self', participantId: 'p2' })
    expect(next.participants.filter((participant) => participant.isSelf)).toHaveLength(1)
    expect(next.participants.find((participant) => participant.id === 'p2')?.isSelf).toBe(true)
  })

  it('updates a participant by id without mutating the source draft', () => {
    const next = chatReducer(SAMPLE_DRAFT, {
      type: 'update-participant',
      participantId: 'p2',
      patch: { name: '新昵称' },
    })
    expect(next.participants.find((participant) => participant.id === 'p2')?.name).toBe('新昵称')
    expect(SAMPLE_DRAFT.participants.find((participant) => participant.id === 'p2')?.name).toBe('阿花')
  })

  it('reassigns messages when a participant is removed with a replacement', () => {
    const next = chatReducer(SAMPLE_DRAFT, {
      type: 'remove-participant',
      participantId: 'p2',
      replacementId: 'p3',
    })
    expect(next.participants.some((participant) => participant.id === 'p2')).toBe(false)
    expect(next.messages
      .filter((message) => ['m3', 'm4', 'm7'].includes(message.id))
      .map((message) => message.participantId))
      .toEqual(['p3', 'p3', 'p3'])
  })

  it('deletes associated messages when a participant is removed without a replacement', () => {
    const next = chatReducer(SAMPLE_DRAFT, { type: 'remove-participant', participantId: 'p4' })
    expect(next.messages.some((message) => message.participantId === 'p4')).toBe(false)
  })

  it('does not remove the self participant', () => {
    expect(chatReducer(SAMPLE_DRAFT, { type: 'remove-participant', participantId: 'self' }))
      .toBe(SAMPLE_DRAFT)
  })

  it('detaches removed structured-system references while keeping their name snapshots', () => {
    const system = {
      ...SAMPLE_DRAFT.messages[0], kind: 'system' as const,
      system: { subtype: 'invite' as const, actorId: 'self', actorName: '小美', targetId: 'p2', targetName: '阿花', detail: '' },
    }
    const next = chatReducer({ ...SAMPLE_DRAFT, messages: [system] }, { type: 'remove-participant', participantId: 'p2', replacementId: 'p3' })
    expect(next.messages[0].system).toEqual({ ...system.system, targetId: null })
  })

  it('supports message add, update, duplicate, delete, reorder, and scalar fields', () => {
    const newMessage = {
      id: 'new',
      participantId: 'self',
      kind: 'text' as const,
      text: '新消息',
      showReeditLink: false,
      media: null,
      quote: null,
      voice: null,
      voiceUnread: false,
      call: null,
      side: 'auto' as const,
      sentAt: '2026-08-27T12:00:00+08:00',
      timeVisibility: 'auto' as const,
    }
    const added = chatReducer(SAMPLE_DRAFT, { type: 'add-message', message: newMessage })
    const updated = chatReducer(added, { type: 'update-message', messageId: 'new', patch: { text: '已编辑' } })
    const duplicated = chatReducer(updated, { type: 'duplicate-message', messageId: 'new', newId: 'copy' })
    const reordered = chatReducer(duplicated, { type: 'reorder-messages', activeId: 'copy', overId: 'm1' })
    const deleted = chatReducer(reordered, { type: 'delete-message', messageId: 'new' })
    const titled = chatReducer(deleted, { type: 'set-field', field: 'title', value: '新标题' })

    expect(updated.messages.at(-1)?.text).toBe('已编辑')
    expect(duplicated.messages.at(-1)).toMatchObject({ id: 'copy', text: '已编辑' })
    expect(reordered.messages[0].id).toBe('copy')
    expect(deleted.messages.some((message) => message.id === 'new')).toBe(false)
    expect(titled.title).toBe('新标题')
  })

  it('applies related draft fields atomically and preserves identity for no-op edits', () => {
    const resized = chatReducer(SAMPLE_DRAFT, {
      type: 'set-fields',
      patch: { outputWidth: 390, outputHeight: 844, exportScale: 2 },
    })
    expect(resized).toMatchObject({ outputWidth: 390, outputHeight: 844, exportScale: 2 })
    expect(chatReducer(SAMPLE_DRAFT, { type: 'set-field', field: 'title', value: SAMPLE_DRAFT.title })).toBe(SAMPLE_DRAFT)
    expect(chatReducer(SAMPLE_DRAFT, { type: 'delete-message', messageId: 'missing' })).toBe(SAMPLE_DRAFT)
    expect(chatReducer(SAMPLE_DRAFT, { type: 'clear-messages' })).not.toBe(SAMPLE_DRAFT)
    const empty = { ...SAMPLE_DRAFT, messages: [] }
    expect(chatReducer(empty, { type: 'clear-messages' })).toBe(empty)
  })

  it('sends the input-bar draft as the current self and clears it atomically', () => {
    const draft = { ...SAMPLE_DRAFT, inputBarMode: 'text' as const, inputDraft: '  从输入栏发送  ' }
    const next = chatReducer(draft, {
      type: 'send-input-draft',
      messageId: 'quick-message',
      sentAt: '2026-09-01T09:00:00.000Z',
    } as Parameters<typeof chatReducer>[1])

    expect(next.inputDraft).toBe('')
    expect(next.messages.at(-1)).toMatchObject({
      id: 'quick-message',
      participantId: 'self',
      kind: 'text',
      text: '  从输入栏发送  ',
      sentAt: '2026-09-01T09:00:00.000Z',
    })
    expect(chatReducer({ ...draft, inputDraft: '   ' }, {
      type: 'send-input-draft', messageId: 'ignored', sentAt: '2026-09-01T09:00:00.000Z',
    } as Parameters<typeof chatReducer>[1])).toEqual({ ...draft, inputDraft: '   ' })
  })

})
