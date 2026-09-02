import { useState, type Dispatch, type ReactNode } from 'react'
import type { ChatAction } from '../../app/chatReducer'
import type { ChatDraft, ConversationType, Message } from '../../app/chatTypes'
import { AdvancedOutputSettings } from './AdvancedOutputSettings'
import { CaptureSettings } from './CaptureSettings'
import { ConversationSettings } from './ConversationSettings'
import { matchesIphone15ProMax } from './outputPreset'
import { StatusBarSettings } from './StatusBarSettings'

interface SettingsPanelProps {
  draft: ChatDraft
  messages: Message[]
  dispatch: Dispatch<ChatAction>
  onRequestConversationTypeChange: (type: ConversationType) => void
  memberList?: ReactNode
}

export function SettingsPanel({ draft, messages, dispatch, onRequestConversationTypeChange, memberList }: SettingsPanelProps) {
  const [customSizing, setCustomSizing] = useState(!matchesIphone15ProMax(draft))
  const [advancedOutputOpen, setAdvancedOutputOpen] = useState(false)

  return (
    <>
      <ConversationSettings draft={draft} dispatch={dispatch} onRequestConversationTypeChange={onRequestConversationTypeChange} />
      {memberList}
      <CaptureSettings draft={draft} messages={messages} dispatch={dispatch} customSizing={customSizing}
        onCustomSizingChange={setCustomSizing} onOpenAdvancedOutput={() => setAdvancedOutputOpen(true)} />
      <StatusBarSettings draft={draft} dispatch={dispatch} />
      <AdvancedOutputSettings draft={draft} dispatch={dispatch} open={advancedOutputOpen} onOpenChange={setAdvancedOutputOpen} />
    </>
  )
}
