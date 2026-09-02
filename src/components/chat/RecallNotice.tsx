import type { Message, Participant } from '../../app/chatTypes'
import styles from './ChatCanvas.module.css'

interface RecallNoticeProps {
  message: Message
  sender: Participant
}

export function RecallNotice({ message, sender }: RecallNoticeProps) {
  const customText = message.text.trim()
  const noticeText = customText || (sender.isSelf
    ? '你撤回了一条消息'
    : `"${sender.name}" 撤回了一条消息`)
  const showReeditLink = sender.isSelf && message.showReeditLink

  return (
    <div className={styles.recallNotice} data-testid="recall-notice">
      {noticeText}
      {showReeditLink ? (
        <>
          {' '}
          <span className={styles.reeditLink} data-reedit-link>重新编辑</span>
        </>
      ) : null}
    </div>
  )
}
