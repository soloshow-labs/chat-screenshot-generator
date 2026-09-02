import styles from './ChatCanvas.module.css'
import { ChatBackIcon, ChatMoreIcon } from './ChatGlyphs'

interface ChatHeaderProps {
  title: string
  unreadCount?: number
}

export function ChatHeader({ title, unreadCount = 0 }: ChatHeaderProps) {
  return (
    <div className={styles.chatHeader}>
      <div className={styles.headerLeft}>
        <ChatBackIcon className={styles.backIcon} aria-label="返回" />
        {unreadCount > 0 ? <span className={styles.chatUnread} aria-label={`${unreadCount} 条未读消息`}>{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
      </div>
      <div className={styles.chatTitle}>{title}</div>
      <ChatMoreIcon className={styles.moreIcon} aria-label="更多" />
    </div>
  )
}
