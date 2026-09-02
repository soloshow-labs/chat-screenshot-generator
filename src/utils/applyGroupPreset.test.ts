import { describe, expect, it } from 'vitest'
import { SAMPLE_DRAFT } from '../app/sampleDraft'
import type { GroupPresetRecord } from '../services/libraryStore'
import { applyGroupPreset } from './applyGroupPreset'

describe('applyGroupPreset', () => {
  it('replaces group identity, keeps matching messages, and does not mutate inputs', () => {
    const preset: GroupPresetRecord = {
      id: 'group-1',
      title: '保存的群聊',
      participants: [
        { ...SAMPLE_DRAFT.participants[0], isSelf: true },
        { ...SAMPLE_DRAFT.participants[2], isSelf: true },
      ],
      updatedAt: 1,
    }
    const draft = {
      ...SAMPLE_DRAFT,
      participants: SAMPLE_DRAFT.participants.map((participant) => ({ ...participant })),
      messages: SAMPLE_DRAFT.messages.map((message) => ({ ...message })),
    }
    const original = structuredClone(draft)

    const result = applyGroupPreset(draft, preset)

    expect(result.draft.title).toBe('保存的群聊')
    expect(result.draft.conversationType).toBe('group')
    expect(result.draft.participants.filter((participant) => participant.isSelf)).toHaveLength(1)
    expect(result.draft.participants[0].isSelf).toBe(true)
    expect(new Set(result.draft.messages.map((message) => message.participantId))).toEqual(new Set(['self', 'p3']))
    expect(result.removedMessageCount).toBe(
      SAMPLE_DRAFT.messages.filter((message) => !['self', 'p3'].includes(message.participantId)).length,
    )
    expect(draft).toEqual(original)
    expect(result.draft.participants).not.toBe(preset.participants)
  })
})
