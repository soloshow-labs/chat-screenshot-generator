import { MESSAGE_KIND_REGISTRY } from '../../app/messageKindRegistry'
import type { Message, Participant, ThemeMode } from '../../app/chatTypes'
import { CallMessage } from './CallMessage'
import { ImageMessage } from './ImageMessage'
import { MessageBubble } from './MessageBubble'
import { PaymentNotice } from './PaymentNotice'
import { RecallNotice } from './RecallNotice'
import { RichMessage } from './RichMessage'
import { SystemMessage } from './SystemMessage'
import { VoiceMessage } from './VoiceMessage'

interface MessageRendererProps {
  message: Message
  sender: Participant
  side: 'left' | 'right'
  showName: boolean
  exportMode: boolean
  theme: ThemeMode
  selfId?: string
  activeVoiceMessageId: string | null
  onPlaybackStart: (messageId: string) => void
  onPlaybackStop: (messageId: string) => void
}

export function MessageRenderer({
  message, sender, side, showName, exportMode, theme, selfId,
  activeVoiceMessageId, onPlaybackStart, onPlaybackStop,
}: MessageRendererProps) {
  if (message.kind === 'payment' && message.payment?.role === 'notice') {
    return <PaymentNotice payment={message.payment} selfId={selfId} />
  }

  switch (MESSAGE_KIND_REGISTRY[message.kind].renderer) {
    case 'system':
      return <SystemMessage system={message.system} />
    case 'recall':
      return <RecallNotice message={message} sender={sender} />
    case 'image':
      return <ImageMessage message={message} sender={sender} side={side} showName={showName} />
    case 'voice':
      return <VoiceMessage message={message} sender={sender} side={side} showName={showName} activeVoiceMessageId={activeVoiceMessageId} onPlaybackStart={onPlaybackStart} onPlaybackStop={onPlaybackStop} />
    case 'call':
      return <CallMessage message={message} sender={sender} side={side} showName={showName} />
    case 'rich':
      return <RichMessage key={`${message.id}:${message.media?.assetId ?? message.kind}`} message={message} sender={sender} side={side} showName={showName} exportMode={exportMode} theme={theme} selfId={selfId} />
    case 'bubble':
      return <MessageBubble message={message} sender={sender} side={side} showName={showName} />
  }
}
