import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type Dispatch, type FormEvent } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronUp, Copy, GripVertical, Plus, Trash2 } from 'lucide-react'
import type { ChatAction } from '../../app/chatReducer'
import type { ConversationType, Message, Participant } from '../../app/chatTypes'
import { MESSAGE_KIND_OPTIONS, isCenteredMessage, isRichMessageKind, supportsDeliveryStatus } from '../../app/messageKindRegistry'
import { createInitialAvatar } from '../../services/avatarProcessor'
import { releaseMediaAssets, saveMediaAsset } from '../../services/mediaAssetStore'
import { createMessage, messageKindPatch } from '../../app/messageFactory'
import { RichMessageFields } from './RichMessageFields'
import { processAudioFile, processImageFile } from '../../services/mediaProcessor'
import { useMediaImportTracker } from '../../hooks/useMediaImportActivity'
import { getVoiceDuration } from '../../utils/voiceMessage'
import { EmojiPicker } from './EmojiPicker'
import { QuoteFields } from './QuoteFields'
import { SystemMessageFields } from './SystemMessageFields'
import { CallFields } from './CallFields'
import { MessageMediaFields } from './MessageMediaFields'
import styles from './MessageEditor.module.css'

interface MessageRowProps {
  message: Message
  messages: Message[]
  participants: Participant[]
  conversationType?: ConversationType
  index: number
  dispatch: Dispatch<ChatAction>
  makeDuplicateId: () => string
  selectionMode?: boolean
  selected?: boolean
  onToggleSelection?: () => void
  onCollapse?: () => void
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function toDateTimeLocal(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function MessageRow({ message, messages, participants, conversationType = 'group', index, dispatch, makeDuplicateId, selectionMode, selected, onToggleSelection, onCollapse }: MessageRowProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [composing, setComposing] = useState(false)
  const latestMessage = useRef(message)
  useEffect(() => { latestMessage.current = message }, [message])
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [mediaBusy, setMediaBusy] = useState<number | null>(null)
  const uploadContext = `${message.id}:${message.kind}`
  const [previousUploadContext, setPreviousUploadContext] = useState(uploadContext)
  // Adjust row-local state before committing a new kind, including undo/redo.
  // The cleanup below independently invalidates obsolete async completions.
  if (previousUploadContext !== uploadContext) {
    setPreviousUploadContext(uploadContext)
    setMediaBusy(null)
    setMediaError(null)
  }
  const uploadGeneration = useRef(0)
  useEffect(() => () => { ++uploadGeneration.current }, [message.id, message.kind])
  const beginMediaImport = useMediaImportTracker(uploadContext)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: message.id })
  const sender = participants.find((participant) => participant.id === message.participantId) || participants[0]
  const isRecall = message.kind === 'recall'
  const isCentered = isCenteredMessage(message)
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  } as CSSProperties
  const number = index + 1

  function growTextarea(event: FormEvent<HTMLTextAreaElement>) {
    const textarea = event.currentTarget
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const finishMediaImport = beginMediaImport()
    const token = ++uploadGeneration.current
    setMediaBusy(token)
    setMediaError(null)
    try {
      const metadata = await processImageFile(file)
      if (token !== uploadGeneration.current) return
      const asset = await saveMediaAsset(file, metadata)
      if (token !== uploadGeneration.current) { releaseMediaAssets([asset.id]); return }
      dispatch({
        type: 'update-message',
        messageId: message.id,
        patch: {
          media: {
            assetId: asset.id,
            fileName: file.name,
            ...metadata,
          },
        },
      })
    } catch (error) {
      if (token === uploadGeneration.current) setMediaError(error instanceof Error ? error.message : '图片上传失败')
    } finally {
      setMediaBusy(current => current === token ? null : current)
      finishMediaImport()
    }
  }

  async function uploadVoice(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const finishMediaImport = beginMediaImport()
    const token = ++uploadGeneration.current
    setMediaBusy(token)
    setMediaError(null)
    try {
      const metadata = await processAudioFile(file)
      if (token !== uploadGeneration.current) return
      const asset = await saveMediaAsset(file, metadata)
      if (token !== uploadGeneration.current) { releaseMediaAssets([asset.id]); return }
      dispatch({
        type: 'update-message',
        messageId: message.id,
        patch: {
          voice: { ...(latestMessage.current.voice ?? { durationSeconds: 5, transcript: '', showTranscript: false }), durationMode: 'auto' },
          media: {
            assetId: asset.id,
            fileName: file.name,
            ...metadata,
          },
        },
      })
    } catch (error) {
      if (token === uploadGeneration.current) setMediaError(error instanceof Error ? error.message : '语音上传失败')
    } finally {
      setMediaBusy(current => current === token ? null : current)
      finishMediaImport()
    }
  }

  function removeMedia() {
    ++uploadGeneration.current
    setMediaBusy(null)
    dispatch({ type: 'update-message', messageId: message.id, patch: {
      media: null,
      ...(message.kind === 'voice' ? { voice: {
        ...(message.voice ?? { transcript: '', showTranscript: false }),
        durationMode: 'manual' as const,
        durationSeconds: message.voice?.durationMode === 'manual' ? message.voice.durationSeconds : Math.min(60, Math.max(1, getVoiceDuration(message))),
      } } : {}),
    }, separateHistory: true })
  }

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`${styles.row} ${isDragging ? styles.dragging : ''}`}
      aria-label={`消息 ${number}`}
      data-editor-message-id={message.id}
      tabIndex={-1}
    >
      <div className={styles.dragRail}>
        <span>{number}</span>
        {selectionMode ? <input type="checkbox" aria-label={`选择消息 ${number}`} checked={selected ?? false} onChange={onToggleSelection} /> : null}
        <button type="button" aria-label={`拖动消息 ${number}`} {...attributes} {...listeners}>
          <GripVertical size={18} />
        </button>
      </div>

      <img
        className={styles.avatar}
        src={sender?.avatarDataUrl || createInitialAvatar(sender?.name || '？')}
        alt=""
      />

      <div className={styles.fields} onKeyDown={event => {
        const target = event.target
        const contentInput = target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && ['text', 'url'].includes(target.type))
        if (event.key !== 'Tab' || event.nativeEvent.isComposing || composing || event.ctrlKey || event.metaKey || event.altKey || !contentInput || !participants.length) return
        event.preventDefault()
        const current = participants.findIndex(participant => participant.id === message.participantId)
        const next = participants[(Math.max(0, current) + (event.shiftKey ? -1 : 1) + participants.length) % participants.length]
        dispatch({ type: 'update-message', messageId: message.id, patch: { participantId: next.id, ...(isRecall && !next.isSelf ? { showReeditLink: false } : {}) } })
      }}>
        <div className={styles.topline}>
          <label>
            <span>发送人</span>
            <select
              aria-label={`消息 ${number} 发送人`}
              value={message.participantId}
              onChange={(event) => {
                const nextSender = participants.find((participant) => participant.id === event.target.value)
                dispatch({
                  type: 'update-message',
                  messageId: message.id,
                  patch: isRecall && !nextSender?.isSelf
                    ? { participantId: event.target.value, showReeditLink: false }
                    : { participantId: event.target.value },
                })
              }}
            >
              {participants.map((participant) => <option value={participant.id} key={participant.id}>{participant.name}</option>)}
            </select>
          </label>
          <label className={styles.typeField}>
            <span>类型</span>
            <select
              aria-label={`消息 ${number} 类型`}
              value={message.kind}
              onChange={(event) => {
                const kind = event.target.value as Message['kind']
                ++uploadGeneration.current
                setMediaBusy(null)
                setMediaError(null)
                dispatch({
                  type: 'update-message',
                  messageId: message.id,
                  patch: { ...messageKindPatch(kind), deliveryStatus: 'sent', text: '' },
                })
              }}
            >
              {MESSAGE_KIND_OPTIONS.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}
            </select>
          </label>
          {!isCentered ? <label className={styles.directionField}>
            <span>方向</span>
            <select
              aria-label={`消息 ${number} 方向`}
              value={message.side}
              onChange={(event) => dispatch({
                type: 'update-message',
                messageId: message.id,
                patch: { side: event.target.value as Message['side'] },
              })}
            >
              <option value="auto">自动</option>
              <option value="left">左侧</option>
              <option value="right">右侧</option>
            </select>
          </label> : null}
        </div>

        {message.kind === 'system' ? <SystemMessageFields message={message} participants={participants} number={number} dispatch={dispatch} /> : null}

        {isRichMessageKind(message.kind) ? <RichMessageFields key={`${message.id}:${message.kind}`} message={message} number={number} dispatch={dispatch} paymentContext={{ messages, participants, conversationType }} /> : null}
        {message.kind === 'text' || isRecall ? (
          <textarea
            ref={textareaRef}
            aria-label={isRecall ? `消息 ${number} 撤回提示` : `消息 ${number} 内容`}
            value={message.text}
            rows={2}
            placeholder={isRecall ? '留空则自动生成撤回提示' : '输入消息内容'}
            onInput={growTextarea}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            onChange={(event) => dispatch({
              type: 'update-message',
              messageId: message.id,
              patch: { text: event.target.value },
            })}
          />
        ) : null}

        {message.kind === 'text' ? <>
          <EmojiPicker textareaRef={textareaRef} text={message.text} number={number} composing={composing} onInsert={text => dispatch({ type: 'update-message', messageId: message.id, patch: { text }, separateHistory: true })} />
          <QuoteFields message={message} messages={messages} participants={participants} number={number} dispatch={dispatch} />
        </> : null}

        <MessageMediaFields
          message={message}
          number={number}
          incoming={message.side === 'left' || (message.side === 'auto' && !sender?.isSelf)}
          busy={mediaBusy !== null}
          error={mediaError}
          dispatch={dispatch}
          onUploadImage={uploadImage}
          onUploadVoice={uploadVoice}
          onRemove={removeMedia}
        />

        {message.kind === 'call' ? <CallFields message={message} number={number} dispatch={dispatch} /> : null}

        {isRecall && sender?.isSelf ? (
          <label className={styles.reeditToggle}>
            <input
              type="checkbox"
              aria-label={`消息 ${number} 显示重新编辑`}
              checked={message.showReeditLink}
              onChange={(event) => dispatch({
                type: 'update-message',
                messageId: message.id,
                patch: { showReeditLink: event.target.checked },
              })}
            />
            <span>显示蓝色“重新编辑”</span>
          </label>
        ) : null}

        {supportsDeliveryStatus(message) ? <label className={styles.reeditToggle}>
          <input type="checkbox" aria-label={`消息 ${number} 显示发送失败`} checked={message.deliveryStatus === 'rejected'} onChange={event => dispatch({ type: 'update-message', messageId: message.id, patch: { deliveryStatus: event.target.checked ? 'rejected' : 'sent' }, separateHistory: true })} />
          <span>显示发送失败红色感叹号</span>
        </label> : null}

        <div className={styles.bottomline}>
          <label className={styles.timeField}>
            <span>时间</span>
            <input
              type="datetime-local"
              aria-label={`消息 ${number} 时间`}
              value={toDateTimeLocal(message.sentAt)}
              onChange={(event) => {
                const nextDate = new Date(event.target.value)
                if (!Number.isNaN(nextDate.getTime())) {
                  dispatch({ type: 'update-message', messageId: message.id, patch: { sentAt: nextDate.toISOString() } })
                }
              }}
            />
          </label>
          <label className={styles.visibilityField}>
            <span>时间显示</span>
            <select
              aria-label={`消息 ${number} 时间显示`}
              value={message.timeVisibility}
              onChange={(event) => dispatch({
                type: 'update-message',
                messageId: message.id,
                patch: { timeVisibility: event.target.value as Message['timeVisibility'] },
              })}
            >
              <option value="auto">自动</option>
              <option value="show">强制显示</option>
              <option value="hide">强制隐藏</option>
            </select>
          </label>
          <div className={styles.actions}>
            {onCollapse ? <button type="button" aria-label={`收起消息 ${number}`} onClick={onCollapse}><ChevronUp size={16} /></button> : null}
            <button type="button" aria-label={`在消息 ${number} 下方插入`} title="在下方插入" disabled={!participants.length} onClick={() => dispatch({ type: 'insert-message', afterId: message.id, message: createMessage(sender?.id ?? '', { id: makeDuplicateId(), sentAt: message.sentAt }) })}><Plus size={16} /></button>
            <button
              type="button"
              aria-label={`复制消息 ${number}`}
              onClick={() => dispatch({ type: 'duplicate-message', messageId: message.id, newId: makeDuplicateId() })}
            >
              <Copy size={16} />
            </button>
            <button
              type="button"
              aria-label={`删除消息 ${number}`}
              onClick={() => { ++uploadGeneration.current; dispatch({ type: 'delete-message', messageId: message.id }) }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}
