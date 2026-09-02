import styles from './ChatCanvas.module.css'
import type { InputBarMode } from '../../app/chatTypes'
import { ChatAddIcon, ChatKeyboardIcon, ChatStickerIcon, ChatVoiceIcon } from './ChatGlyphs'

interface InputBarProps {
  mode: InputBarMode
  draftText: string
}

export function InputBar({ mode, draftText }: InputBarProps) {
  const hasDraft = mode === 'text' && draftText.length > 0
  return (
    <div className={`${styles.inputBar} ${hasDraft ? styles.inputBarWithSend : ''}`} role="group" aria-label="聊天输入栏">
      {mode === 'voice'
        ? <ChatKeyboardIcon className={styles.inputIcon} role="img" aria-hidden={undefined} aria-label="切换到键盘" />
        : <ChatVoiceIcon className={styles.inputIcon} role="img" aria-hidden={undefined} aria-label="语音" />}
      {mode === 'voice'
        ? <div className={`${styles.inputField} ${styles.voiceInputField}`} role="button" aria-label="按住说话">按住 说话</div>
        : <div className={styles.inputField} role="img" aria-label="输入栏草稿">{draftText}</div>}
      <ChatStickerIcon className={styles.inputIcon} aria-label="表情" />
      {hasDraft
        ? <div className={styles.inputSendButton}>发送</div>
        : <ChatAddIcon className={styles.inputIcon} role="img" aria-hidden={undefined} aria-label="更多功能" />}
    </div>
  )
}
