import type { Message, Participant } from '../../app/chatTypes'
import { createInitialAvatar } from '../../services/avatarProcessor'
import { formatCallRecord } from '../../utils/callRecord'
import styles from './ChatCanvas.module.css'
import { DeliveryFailure } from './DeliveryFailure'

interface CallMessageProps {
  message: Message
  sender: Participant
  side: 'left' | 'right'
  showName: boolean
}

export function CallMessage({ message, sender, side, showName }: CallMessageProps) {
  const call = message.call ?? { mode: 'voice' as const, status: 'duration' as const, durationSeconds: 0 }
  const icon = call.mode === 'video' ? (
    <svg data-testid="call-icon" data-call-mode="video" viewBox="0 0 24 24" aria-label="视频通话">
      <rect x="3.5" y="6.5" width="12" height="11" rx="2" />
      <path d="m15.5 10 5-3v10l-5-3" />
    </svg>
  ) : (
    <svg data-testid="call-icon" data-call-mode="voice" viewBox="0 0 24 24" aria-label="语音通话">
      <path d="M7.3 3.5 10 7.8 7.8 10c1.2 2.8 3.4 5 6.2 6.2l2.2-2.2 4.3 2.7c.3.2.5.6.4 1-.4 2-2.1 3.4-4.1 3.2C9.5 20.1 3.9 14.5 3.1 7.2 2.9 5.2 4.3 3.5 6.3 3c.4-.1.8.1 1 .5Z" />
    </svg>
  )

  return (
    <div className={`${styles.messageRow} ${side === 'right' ? styles.messageRowRight : ''}`}>
      <img
        className={styles.avatar}
        src={sender.avatarDataUrl || createInitialAvatar(sender.name)}
        alt={`${sender.name}的头像`}
      />
      <div className={styles.bubbleWrap}>
        {showName ? <div className={styles.senderName} data-sender-name>{sender.name}</div> : null}
        <div className={`${styles.bubble} ${styles.callBubble} ${side === 'right' ? styles.bubbleRight : styles.bubbleLeft}`}>
          {side === 'right' ? <><span>{formatCallRecord(call)}</span>{icon}</> : <>{icon}<span>{formatCallRecord(call)}</span></>}
        </div>
      </div>
      <DeliveryFailure message={message} />
    </div>
  )
}
