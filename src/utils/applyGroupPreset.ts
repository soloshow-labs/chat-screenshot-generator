import type { ChatDraft, Participant } from '../app/chatTypes'
import type { GroupPresetRecord } from '../services/libraryStore'
import { reconcilePaymentReferences } from './paymentMessage'

export interface AppliedGroupPreset {
  draft: ChatDraft
  removedMessageCount: number
}

function normalizeParticipants(draft: ChatDraft, preset: GroupPresetRecord): Participant[] {
  const source = preset.participants.length > 0
    ? preset.participants
    : draft.participants.filter((participant) => participant.isSelf).slice(0, 1)
  const selectedSelfIndex = Math.max(0, source.findIndex((participant) => participant.isSelf))
  return source.map((participant, index) => ({
    ...participant,
    isSelf: index === selectedSelfIndex,
  }))
}

export function applyGroupPreset(draft: ChatDraft, preset: GroupPresetRecord): AppliedGroupPreset {
  const participants = normalizeParticipants(draft, preset)
  const participantIds = new Set(participants.map((participant) => participant.id))
  const messages = draft.messages.filter((message) => participantIds.has(message.participantId))
  const messageIds = new Set(messages.map((message) => message.id))

  return {
    draft: reconcilePaymentReferences({
      ...draft,
      conversationType: 'group',
      title: preset.title,
      participants,
      messages,
      captureStartMessageId: draft.captureStartMessageId && messageIds.has(draft.captureStartMessageId)
        ? draft.captureStartMessageId
        : null,
      captureEndMessageId: draft.captureEndMessageId && messageIds.has(draft.captureEndMessageId)
        ? draft.captureEndMessageId
        : null,
      screenScrollTop: 0,
    }),
    removedMessageCount: draft.messages.length - messages.length,
  }
}
