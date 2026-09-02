import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { Message, Participant, ThemeMode } from '../../app/chatTypes'
import { useMediaAssetUrl } from '../../hooks/useMediaAssetUrl'
import { createInitialAvatar } from '../../services/avatarProcessor'
import { PaymentCard } from './cards/PaymentCard'
import { ContactCard } from './cards/ContactCard'
import { LocationCard } from './cards/LocationCard'
import { FileCard } from './cards/FileCard'
import { VideoCard } from './cards/VideoCard'
import frame from './ChatCanvas.module.css'
import styles from './RichMessage.module.css'
import { DeliveryFailure } from './DeliveryFailure'

function safeLink(value: string): URL | undefined {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url : undefined } catch { return undefined }
}
function localImage(value: string | null | undefined): string | undefined {
  return value && /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : undefined
}
export function RichMessage({ message, sender, side, showName, exportMode, theme = 'light', selfId }: { message: Message; sender: Participant; side: 'left' | 'right'; showName: boolean; exportMode: boolean; theme?: ThemeMode; selfId?: string }) {
  const { url, error } = useMediaAssetUrl(message.kind === 'video' || message.kind === 'file' ? message.media?.assetId ?? null : null)
  const [playing, setPlaying] = useState<string | null>(null)
  const playbackKey = JSON.stringify([message.id, message.kind, message.media?.assetId ?? null])
  const [playbackError, setPlaybackError] = useState(false)
  const [previousPlaybackKey, setPreviousPlaybackKey] = useState(playbackKey)
  // Invalidate the session, not merely its visibility: undo may restore an
  // earlier attachment/type, but must never resume its abandoned player.
  if (previousPlaybackKey !== playbackKey) {
    setPreviousPlaybackKey(playbackKey)
    setPlaying(null)
    setPlaybackError(false)
  }
  const link = message.link
  const linkTarget = safeLink(link?.url ?? '')
  const payment = message.payment
  const contact = message.contactCard
  const location = message.location
  return <div className={`${frame.messageRow} ${side === 'right' ? frame.messageRowRight : ''}`} data-rich-kind={message.kind}>
    <img className={frame.avatar} src={sender.avatarDataUrl || createInitialAvatar(sender.name)} alt={`${sender.name}的头像`} />
    <div className={frame.mediaWrap}>
      {showName ? <div className={frame.senderName} data-sender-name>{sender.name}</div> : null}
        {message.kind === 'link' ? <div className={styles.card}>
          {localImage(link?.thumbnailDataUrl) ? <img className={styles.thumb} src={localImage(link?.thumbnailDataUrl)} alt="链接缩略图" /> : null}
          <strong>{link?.title || '链接标题'}</strong><p>{link?.description}</p>
          {linkTarget ? <a href={linkTarget.href} target="_blank" rel="noopener noreferrer">{linkTarget.hostname}</a> : <span>{link?.url}</span>}
          <footer>链接</footer>
        </div> : null}
        {message.kind === 'payment' && payment ? <PaymentCard payment={payment} side={side} selfId={selfId} /> : null}
        {message.kind === 'contact' ? <ContactCard contact={contact} side={side} avatar={localImage(contact?.avatarDataUrl) || createInitialAvatar(contact?.name ?? '')} /> : null}
        {message.kind === 'location' ? <LocationCard location={location} side={side} theme={theme} /> : null}
        {message.kind === 'file' ? <FileCard media={message.media} url={url} error={error} side={side} /> : null}
        {message.kind === 'video' ? <VideoCard media={message.media} poster={localImage(message.media?.posterDataUrl)} playable={Boolean(url)} exportMode={exportMode} error={error} onPlay={() => { setPlaybackError(false); setPlaying(playbackKey) }} /> : null}
    </div>
    <DeliveryFailure message={message} />
    {message.kind === 'video' && playing === playbackKey && url && !exportMode ? createPortal(<div className={styles.overlay} role="dialog" aria-modal="true" aria-label="视频播放" onKeyDown={event => { if (event.key === 'Escape') setPlaying(null) }}><button autoFocus type="button" onClick={() => setPlaying(null)}>关闭视频</button><video src={url} controls autoPlay onError={() => setPlaybackError(true)} />{playbackError ? <p role="alert">无法播放视频，浏览器不支持此编码，请换用 H.264 MP4 或 WebM</p> : null}</div>, document.body) : null}
  </div>
}
