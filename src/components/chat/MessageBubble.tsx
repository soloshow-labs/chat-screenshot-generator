import type { Message, Participant } from '../../app/chatTypes'
import { createInitialAvatar } from '../../services/avatarProcessor'
import { InlineMessageText } from '../emoji/InlineMessageText'
import { QuotePreview } from './QuotePreview'
import { DeliveryFailure } from './DeliveryFailure'
import styles from './ChatCanvas.module.css'

interface MessageBubbleProps {
  message: Message
  sender: Participant
  side: 'left' | 'right'
  showName: boolean
}

export function MessageBubble({ message, sender, side, showName }: MessageBubbleProps) {
  return (
    <div className={`${styles.messageRow} ${side === 'right' ? styles.messageRowRight : ''}`}>
      {sender.avatarDataUrl ? (
        <img className={styles.avatar} src={sender.avatarDataUrl} alt={`${sender.name}的头像`} />
      ) : (
        <img className={styles.avatar} src={createInitialAvatar(sender.name)} alt={`${sender.name}的头像`} />
      )}
      <div className={styles.bubbleWrap}>
        {showName ? <div className={styles.senderName} data-sender-name>{sender.name}</div> : null}
        <div data-message-bubble className={`${styles.bubble} ${side === 'right' ? styles.bubbleRight : styles.bubbleLeft}`}>
          <InlineMessageText text={message.text} />
        </div>
        {message.quote ? <QuotePreview quote={message.quote} side={side} /> : null}
      </div>
      <DeliveryFailure message={message} />
    </div>
  )
}
