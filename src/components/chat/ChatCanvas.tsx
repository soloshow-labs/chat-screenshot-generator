import { forwardRef, Fragment, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { ChatDraft } from '../../app/chatTypes'
import { resolveCaptureRange } from '../../utils/captureRange'
import { formatMessageTime, shouldShowMessageTime } from '../../utils/messageTime'
import { ChatHeader } from './ChatHeader'
import { InputBar } from './InputBar'
import { StatusBar } from './StatusBar'
import { TimeDivider } from './TimeDivider'
import { ChatWallpaper } from './ChatWallpaper'
import { PreviewMessageTarget } from '../preview/PreviewMessageTarget'
import { MessageRenderer } from './MessageRenderer'
import { IosEarpieceIcon } from './ChatGlyphs'
import styles from './ChatCanvas.module.css'

interface ChatCanvasProps {
  draft: ChatDraft
  exportMode: boolean
  onScrollTopChange?: (scrollTop: number) => void
  onLocateMessage?: (messageId: string) => void
}

export const ChatCanvas = forwardRef<HTMLDivElement, ChatCanvasProps>(
  function ChatCanvas({ draft, exportMode, onScrollTopChange, onLocateMessage }, ref) {
    const messageListRef = useRef<HTMLDivElement>(null)
    const [activeVoiceMessageId, setActiveVoiceMessageId] = useState<string | null>(null)
    const participantById = useMemo(
      () => new Map(draft.participants.map((participant) => [participant.id, participant])),
      [draft.participants],
    )
    const title = draft.conversationType === 'group'
      ? `${draft.title} (${draft.groupMemberCount ?? draft.participants.length})`
      : draft.title
    const selfId = draft.participants.find(participant => participant.isSelf)?.id
    const captureRange = draft.outputMode === 'long'
      ? resolveCaptureRange(draft.messages, draft.captureStartMessageId, draft.captureEndMessageId)
      : { valid: true, messages: draft.messages, startIndex: 0, endIndex: draft.messages.length - 1 }
    const renderedMessages = captureRange.valid ? captureRange.messages : []

    useLayoutEffect(() => {
      const list = messageListRef.current
      if (!list || draft.outputMode !== 'screen') return
      if (Math.abs(list.scrollTop - draft.screenScrollTop) > 0.5) list.scrollTop = draft.screenScrollTop
    }, [draft.outputMode, draft.screenScrollTop])

    return (
      <div
        ref={ref}
        className={styles.canvas}
        data-chat-canvas
        data-testid="chat-canvas"
        data-theme={draft.theme}
        data-output-mode={draft.outputMode}
        data-export-mode={String(exportMode)}
      >
        {draft.showStatusBar ? (
          <StatusBar
            time={draft.statusTime}
            batteryPercent={draft.batteryPercent}
            showSilentIcon={draft.showSilentIcon}
            followSystemTime={draft.followSystemTime}
            batteryCharging={draft.batteryCharging}
            showDoNotDisturb={draft.showDoNotDisturb}
            networkType={draft.networkType}
            signalStrength={draft.signalStrength}
            theme={draft.theme}
          />
        ) : null}
        <ChatHeader title={title} unreadCount={draft.chatUnreadCount} />
        {draft.earpieceMode ? <div className={styles.earpieceNotice}><IosEarpieceIcon aria-hidden="true" />当前为听筒播放模式</div> : null}
        <ChatWallpaper wallpaper={draft.wallpaper}>{({ url }) => <div
          ref={messageListRef}
          className={styles.messageList}
          data-testid="message-list"
          data-wallpaper={draft.wallpaper?.type ?? 'default'}
          style={draft.wallpaper?.type === 'color'
            ? { backgroundColor: draft.wallpaper.color }
            : url ? { '--wallpaper-image': `url("${url}")` } as CSSProperties : undefined}
          onScroll={(event) => {
            if (draft.outputMode === 'screen' && event.currentTarget.dataset.captureScroll !== 'true') onScrollTopChange?.(event.currentTarget.scrollTop)
          }}
        >
          <div className={styles.messageContent} data-chat-message-content>
          {renderedMessages.map((message, index) => {
            const sender = participantById.get(message.participantId)
            if (!sender) return null
            const originalIndex = captureRange.startIndex + index
            const side = message.side === 'auto' ? (sender.isSelf ? 'right' : 'left') : message.side
            const showName = draft.conversationType === 'group' && draft.showGroupNicknames !== false && side === 'left' && !sender.isSelf
            return (
              <Fragment key={message.id}>
                {shouldShowMessageTime(draft.messages, originalIndex, draft.timeDisplayMode) ? (
                  <TimeDivider>{formatMessageTime(message.sentAt)}</TimeDivider>
                ) : null}
                <PreviewMessageTarget messageId={message.id} number={originalIndex + 1} onLocate={exportMode ? undefined : onLocateMessage}>
                  <MessageRenderer
                    message={message}
                    sender={sender}
                    side={side}
                    showName={showName}
                    exportMode={exportMode}
                    theme={draft.theme}
                    selfId={selfId}
                    activeVoiceMessageId={activeVoiceMessageId}
                    onPlaybackStart={setActiveVoiceMessageId}
                    onPlaybackStop={(messageId) => setActiveVoiceMessageId(current => current === messageId ? null : current)}
                  />
                </PreviewMessageTarget>
              </Fragment>
            )
          })}
          </div>
        </div>}</ChatWallpaper>
        {draft.showInputBar ? <InputBar mode={draft.inputBarMode} draftText={draft.inputDraft} /> : null}
        {draft.showHomeIndicator ? (
          <div className={styles.homeIndicator} role="img" aria-label="iPhone 底部横条" />
        ) : null}
      </div>
    )
  },
)
