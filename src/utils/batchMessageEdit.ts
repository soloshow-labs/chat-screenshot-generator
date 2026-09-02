import type { ChatDraft, Message } from '../app/chatTypes'

export interface BatchMessageEdit {
  messageIds: string[]
  participantId?: string
  firstSentAt?: string
}

type BatchEditableDraft = Pick<ChatDraft, 'messages' | 'participants'>

function selectedMessages(draft: BatchEditableDraft, edit: BatchMessageEdit): Message[] {
  const selectedIds = new Set(edit.messageIds)
  return draft.messages.filter(message => selectedIds.has(message.id))
}

export function validateBatchMessageEdit(draft: BatchEditableDraft, edit: BatchMessageEdit): string | null {
  if (!edit.messageIds.length) return '请先选择至少一条消息'
  if (new Set(edit.messageIds).size !== edit.messageIds.length || selectedMessages(draft, edit).length !== edit.messageIds.length) return '所选消息已失效，请重新选择'
  if (edit.participantId === undefined && edit.firstSentAt === undefined) return '请至少启用一项批量修改'
  if (edit.participantId !== undefined && !draft.participants.some(participant => participant.id === edit.participantId)) return '所选发送人已不存在'
  if (edit.firstSentAt === undefined) return null

  const firstTime = Date.parse(edit.firstSentAt)
  const firstSelected = selectedMessages(draft, edit)[0]
  const selectedTimes = selectedMessages(draft, edit).map(message => Date.parse(message.sentAt))
  if (!Number.isFinite(firstTime) || !firstSelected || selectedTimes.some(time => !Number.isFinite(time))) return '日期时间无效，请重新输入'
  const delta = firstTime - Date.parse(firstSelected.sentAt)
  if (!Number.isFinite(delta) || selectedTimes.some(time => !Number.isFinite(time + delta))) return '日期时间超出有效范围'
  try {
    selectedTimes.forEach(time => new Date(time + delta).toISOString())
  } catch {
    return '日期时间超出有效范围'
  }
  return null
}

export function applyBatchMessageEdit(draft: ChatDraft, edit: BatchMessageEdit): ChatDraft {
  if (validateBatchMessageEdit(draft, edit)) return draft
  const selected = selectedMessages(draft, edit)
  const selectedIds = new Set(edit.messageIds)
  const delta = edit.firstSentAt === undefined ? null : Date.parse(edit.firstSentAt) - Date.parse(selected[0].sentAt)
  const participant = edit.participantId === undefined ? null : draft.participants.find(item => item.id === edit.participantId)!

  let changed = false
  const messages = draft.messages.map(message => {
    if (!selectedIds.has(message.id)) return message
    const participantId = participant?.id ?? message.participantId
    const sentAt = delta === null ? message.sentAt : new Date(Date.parse(message.sentAt) + delta).toISOString()
    const showReeditLink = message.kind === 'recall' && participant && !participant.isSelf ? false : message.showReeditLink
    if (participantId === message.participantId && sentAt === message.sentAt && showReeditLink === message.showReeditLink) return message
    changed = true
    return {
      ...message,
      participantId,
      sentAt,
      showReeditLink,
    }
  })
  return changed ? { ...draft, messages } : draft
}
