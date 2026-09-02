import type { Dispatch, SetStateAction } from 'react'
import type { ChatAction } from '../../app/chatReducer'
import type { ChatDraft } from '../../app/chatTypes'
import type { GroupPresetRecord } from '../../services/libraryStore'
import { applyGroupPreset } from '../../utils/applyGroupPreset'
import { ConfirmDialog } from './ConfirmDialog'

export type ConversationDialogState =
  | { type: 'reset' }
  | { type: 'remove-member'; participantId: string }
  | { type: 'direct' }
  | { type: 'apply-group'; preset: GroupPresetRecord }
  | null

interface ConversationDialogsProps {
  draft: ChatDraft
  dispatch: Dispatch<ChatAction>
  dialog: ConversationDialogState
  setDialog: Dispatch<SetStateAction<ConversationDialogState>>
  replacementId: string
  setReplacementId: Dispatch<SetStateAction<string>>
  counterpartId: string
  setCounterpartId: Dispatch<SetStateAction<string>>
  onReset: () => void
}

export function ConversationDialogs({ draft, dispatch, dialog, setDialog, replacementId, setReplacementId, counterpartId, setCounterpartId, onReset }: ConversationDialogsProps) {
  const self = draft.participants.find(participant => participant.isSelf)
  const otherParticipants = draft.participants.filter(participant => !participant.isSelf)
  const deletingParticipant = dialog?.type === 'remove-member'
    ? draft.participants.find(participant => participant.id === dialog.participantId)
    : undefined

  function confirmDirectChat() {
    if (!self || !counterpartId) return
    const participants = draft.participants.filter(participant => participant.id === self.id || participant.id === counterpartId)
    const participantIds = new Set(participants.map(participant => participant.id))
    dispatch({
      type: 'replace-draft',
      draft: {
        ...draft,
        conversationType: 'direct',
        participants,
        messages: draft.messages.filter(message => participantIds.has(message.participantId)),
      },
    })
    setDialog(null)
  }

  if (dialog?.type === 'reset') {
    return (
      <ConfirmDialog title="重置全部内容？" confirmLabel="确认重置" danger onCancel={() => setDialog(null)} onConfirm={onReset}>
        当前编辑内容会恢复为初始示例，头像和消息都将被覆盖。
      </ConfirmDialog>
    )
  }

  if (dialog?.type === 'remove-member' && deletingParticipant) {
    return (
      <ConfirmDialog title={`删除成员“${deletingParticipant.name}”？`} confirmLabel="确认删除成员" danger onCancel={() => setDialog(null)} onConfirm={() => {
        dispatch({ type: 'remove-participant', participantId: deletingParticipant.id, replacementId: replacementId || undefined })
        setDialog(null)
      }}>
        <p>这位成员仍有消息。你可以把消息交给另一位成员，或随成员一起删除。</p>
        <label>
          处理{deletingParticipant.name}的消息
          <select aria-label={`处理${deletingParticipant.name}的消息`} value={replacementId} onChange={(event) => setReplacementId(event.target.value)}>
            <option value="">同时删除这些消息</option>
            {draft.participants.filter(participant => participant.id !== deletingParticipant.id).map(participant => (
              <option value={participant.id} key={participant.id}>转给 {participant.name}</option>
            ))}
          </select>
        </label>
      </ConfirmDialog>
    )
  }

  if (dialog?.type === 'direct') {
    return (
      <ConfirmDialog title="切换为单聊？" confirmLabel="确认切换单聊" danger onCancel={() => setDialog(null)} onConfirm={confirmDirectChat}>
        <p>单聊只保留“我”和一位联系人，其他成员及其消息会被移除。</p>
        <label>
          保留联系人
          <select aria-label="保留联系人" value={counterpartId} onChange={(event) => setCounterpartId(event.target.value)}>
            {otherParticipants.map(participant => <option value={participant.id} key={participant.id}>{participant.name}</option>)}
          </select>
        </label>
      </ConfirmDialog>
    )
  }

  if (dialog?.type === 'apply-group') {
    const result = applyGroupPreset(draft, dialog.preset)
    return (
      <ConfirmDialog title={`应用群组“${dialog.preset.title}”？`} confirmLabel="确认应用群组" danger={result.removedMessageCount > 0}
        onCancel={() => setDialog(null)} onConfirm={() => { dispatch({ type: 'replace-draft', draft: result.draft }); setDialog(null) }}>
        将替换当前群标题和全部成员，并移除 {result.removedMessageCount} 条找不到发送人的消息。
      </ConfirmDialog>
    )
  }

  return null
}
