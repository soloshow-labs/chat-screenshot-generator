import type { ChangeEventHandler, Dispatch } from 'react'
import type { ChatAction } from '../../app/chatReducer'
import type { Message } from '../../app/chatTypes'
import { VoiceFields } from './VoiceFields'
import styles from './MessageEditor.module.css'

interface MessageMediaFieldsProps {
  message: Message
  number: number
  incoming: boolean
  busy: boolean
  error: string | null
  dispatch: Dispatch<ChatAction>
  onUploadImage: ChangeEventHandler<HTMLInputElement>
  onUploadVoice: ChangeEventHandler<HTMLInputElement>
  onRemove: () => void
}

export function MessageMediaFields({ message, number, incoming, busy, error, dispatch, onUploadImage, onUploadVoice, onRemove }: MessageMediaFieldsProps) {
  if (message.kind !== 'image' && message.kind !== 'voice') return null
  const voice = message.kind === 'voice'
  return (
    <>
      {voice ? <VoiceFields message={message} number={number} dispatch={dispatch} /> : null}
      <div className={styles.mediaControls}>
        <label className={styles.uploadButton}>
          <span>{busy ? '处理中…' : message.media ? `更换${voice ? '语音' : '图片'}` : `上传${voice ? '语音' : '图片'}`}</span>
          <input
            type="file"
            accept={voice ? 'audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,.mp3,.m4a,.wav' : 'image/jpeg,image/png,image/webp,image/gif'}
            aria-label={`消息 ${number} 上传${voice ? '语音' : '图片'}`}
            disabled={busy}
            onChange={voice ? onUploadVoice : onUploadImage}
          />
        </label>
        {message.media ? (
          <>
            <span className={styles.fileName}>{message.media.fileName}{voice ? ` · ${Math.ceil(message.media.durationSeconds ?? 0)} 秒` : ''}</span>
            <button type="button" className={styles.removeMedia} onClick={onRemove}>移除</button>
          </>
        ) : null}
        {error ? <span className={styles.mediaError} role="alert">{error}</span> : null}
        {voice && incoming ? (
          <label className={styles.reeditToggle}>
            <input type="checkbox" aria-label={`消息 ${number} 显示未读红点`} checked={message.voiceUnread} onChange={event => dispatch({ type: 'update-message', messageId: message.id, patch: { voiceUnread: event.target.checked } })} />
            <span>显示未读红点</span>
          </label>
        ) : null}
      </div>
    </>
  )
}
