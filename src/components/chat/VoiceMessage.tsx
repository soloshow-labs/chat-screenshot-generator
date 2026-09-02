import { useEffect, useRef, useState } from 'react'
import type { Message, Participant } from '../../app/chatTypes'
import { useMediaAssetUrl } from '../../hooks/useMediaAssetUrl'
import { createInitialAvatar } from '../../services/avatarProcessor'
import { getVoiceDuration } from '../../utils/voiceMessage'
import { InlineMessageText } from '../emoji/InlineMessageText'
import styles from './ChatCanvas.module.css'
import everydayStyles from './EverydayMessage.module.css'
import { DeliveryFailure } from './DeliveryFailure'

interface VoiceMessageProps {
  message: Message
  sender: Participant
  side: 'left' | 'right'
  showName: boolean
  activeVoiceMessageId: string | null
  onPlaybackStart: (messageId: string) => void
  onPlaybackStop: (messageId: string) => void
}

function voiceWidth(durationSeconds: number): number {
  return Math.min(220, Math.max(82, 82 + (Math.min(durationSeconds, 60) / 60) * 138))
}

export function VoiceMessage({
  message,
  sender,
  side,
  showName,
  activeVoiceMessageId,
  onPlaybackStart,
  onPlaybackStop,
}: VoiceMessageProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const wasActiveRef = useRef(false)
  const [failedAssetId, setFailedAssetId] = useState<string | null>(null)
  const { url, loading, error } = useMediaAssetUrl(message.media?.assetId ?? null)
  const duration = Math.max(1, getVoiceDuration(message))
  const playing = activeVoiceMessageId === message.id
  const VoiceBubble = url ? 'button' : 'div'
  const missingAudio = !url && (message.media !== null || message.voice?.durationMode !== 'manual')
  const glyph = <svg
    className={styles.voiceGlyph}
    data-testid="voice-glyph"
    data-mirrored={String(side === 'right')}
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M5.4 9.4a3.7 3.7 0 0 1 0 5.2M9 6a8.5 8.5 0 0 1 0 12M12.7 3a12.7 12.7 0 0 1 0 18" />
  </svg>

  useEffect(() => {
    const isActive = activeVoiceMessageId === message.id
    if (wasActiveRef.current && !isActive) {
      audioRef.current?.pause()
    }
    wasActiveRef.current = isActive
  }, [activeVoiceMessageId, message.id])

  async function togglePlayback() {
    const audio = audioRef.current
    if (!audio || !url) return
    if (playing) {
      onPlaybackStop(message.id)
      return
    }

    onPlaybackStart(message.id)
    try {
      await audio.play()
    } catch {
      onPlaybackStop(message.id)
    }
  }

  return (
    <div className={`${styles.messageRow} ${side === 'right' ? styles.messageRowRight : ''}`}>
      <img
        className={styles.avatar}
        src={sender.avatarDataUrl || createInitialAvatar(sender.name)}
        alt={`${sender.name}的头像`}
      />
      <div className={styles.bubbleWrap}>
        {showName ? <div className={styles.senderName} data-sender-name>{sender.name}</div> : null}
        <VoiceBubble
          {...(url ? { type: 'button' as const, 'aria-label': playing ? '暂停语音' : '播放语音', onClick: togglePlayback } : {})}
          className={`${styles.bubble} ${styles.voiceBubble} ${side === 'right' ? styles.bubbleRight : styles.bubbleLeft} ${url ? '' : everydayStyles.displayVoice}`}
          style={{ width: `${voiceWidth(duration)}px` }}
        >
          {side === 'right' ? <><span>{duration}″</span>{glyph}</> : <>{glyph}<span>{duration}″</span></>}
          {side === 'left' && message.voiceUnread ? (
            <span className={styles.voiceUnread} data-testid="voice-unread" aria-label="未读" />
          ) : null}
        </VoiceBubble>
        {message.voice?.showTranscript && message.voice.transcript.trim() ? <div className={everydayStyles.transcript} data-voice-transcript data-side={side}><InlineMessageText text={message.voice.transcript} /></div> : null}
        {missingAudio ? <div className={styles.mediaLoadError}>{loading ? '音频加载中…' : error ?? '请上传语音或改用手填秒数'}</div> : null}
        {message.media && failedAssetId === message.media.assetId ? <div className={styles.mediaLoadError} data-voice-error>音频无法播放，请更换音频</div> : null}
        {url ? <audio ref={audioRef} src={url} onError={() => {
          setFailedAssetId(message.media?.assetId ?? null)
          onPlaybackStop(message.id)
        }} onEnded={() => {
          onPlaybackStop(message.id)
        }} preload="metadata" /> : null}
      </div>
      <DeliveryFailure message={message} />
    </div>
  )
}
