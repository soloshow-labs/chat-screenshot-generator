import { useState } from 'react'
import type { Message, Participant } from '../../app/chatTypes'
import { useMediaAssetUrl } from '../../hooks/useMediaAssetUrl'
import { createInitialAvatar } from '../../services/avatarProcessor'
import { ImageLightbox } from './ImageLightbox'
import { DeliveryFailure } from './DeliveryFailure'
import styles from './ChatCanvas.module.css'

interface ImageMessageProps {
  message: Message
  sender: Participant
  side: 'left' | 'right'
  showName: boolean
}

export function ImageMessage({ message, sender, side, showName }: ImageMessageProps) {
  const [showOriginal, setShowOriginal] = useState(false)
  const { url, loading, error } = useMediaAssetUrl(message.media?.assetId ?? null)
  const width = message.media?.width ?? 1
  const height = message.media?.height ?? 1
  const displayScale = Math.min(220 / width, 300 / height)
  const displayWidth = Math.max(1, width * displayScale)

  return (
    <div className={`${styles.messageRow} ${side === 'right' ? styles.messageRowRight : ''}`}>
      <img
        className={styles.avatar}
        src={sender.avatarDataUrl || createInitialAvatar(sender.name)}
        alt={`${sender.name}的头像`}
      />
      <div className={styles.mediaWrap}>
        {showName ? <div className={styles.senderName} data-sender-name>{sender.name}</div> : null}
        {url ? (
          <button
            type="button"
            className={styles.imageMessage}
            aria-label="查看原图"
            style={{ width: `${displayWidth}px`, aspectRatio: `${width} / ${height}` }}
            onClick={() => setShowOriginal(true)}
          >
            <img src={url} alt={`${sender.name}发送的图片`} />
          </button>
        ) : (
          <div className={styles.mediaPlaceholder} role="status">
            {loading ? '图片加载中…' : error ?? '请上传图片'}
          </div>
        )}
      </div>
      <DeliveryFailure message={message} />
      {showOriginal && url ? (
        <ImageLightbox url={url} alt={`${sender.name}发送的原图`} onClose={() => setShowOriginal(false)} />
      ) : null}
    </div>
  )
}
