import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CSSProperties, Dispatch } from 'react'

import type { ChatAction } from '../../app/chatReducer'
import type { Message, Participant } from '../../app/chatTypes'
import { createMessage } from '../../app/messageFactory'
import { MESSAGE_KIND_REGISTRY } from '../../app/messageKindRegistry'
import { createInitialAvatar } from '../../services/avatarProcessor'
import { getVoiceDuration } from '../../utils/voiceMessage'
import styles from './MessageEditor.module.css'

interface CompactMessageRowProps {
  message: Message
  participants: Participant[]
  index: number
  dispatch: Dispatch<ChatAction>
  makeDuplicateId: () => string
  selectionMode: boolean
  selected: boolean
  onToggleSelection: () => void
  onExpand: () => void
}

function messageSummary(message: Message): string {
  const text = message.text.trim().replaceAll(/\s+/g, ' ')
  if (text) return text
  if (message.kind === 'voice') return `${getVoiceDuration(message)} 秒语音${message.voice?.showTranscript && message.voice.transcript ? ` · ${message.voice.transcript}` : ''}`
  if (message.kind === 'payment') return message.payment?.mode === 'red-packet'
    ? message.payment.note || '微信红包'
    : `¥${(message.payment?.amount ?? 0).toFixed(2)}${message.payment?.note ? ` · ${message.payment.note}` : ''}`
  if (message.kind === 'contact') return message.contactCard?.name || '未填写名片'
  if (message.kind === 'location') return message.location?.name || message.location?.address || '未填写位置'
  if (message.kind === 'link') return message.link?.title || message.link?.url || '未填写链接'
  if (message.kind === 'call') return message.call?.status === 'duration' ? `通话 ${message.call.durationSeconds} 秒` : '通话记录'
  if (message.kind === 'system') return message.system?.detail || '系统消息'
  if (message.media?.fileName) return message.media.fileName
  return MESSAGE_KIND_REGISTRY[message.kind].label
}

function compactTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '时间无效'
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}

export function CompactMessageRow({ message, participants, index, dispatch, makeDuplicateId, selectionMode, selected, onToggleSelection, onExpand }: CompactMessageRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: message.id })
  const sender = participants.find(participant => participant.id === message.participantId) ?? participants[0]
  const number = index + 1
  const style = { transform: CSS.Transform.toString(transform), transition } as CSSProperties

  return <article
    ref={setNodeRef}
    style={style}
    className={`${styles.row} ${styles.compactRow} ${isDragging ? styles.dragging : ''}`}
    aria-label={`消息 ${number}`}
    data-editor-message-id={message.id}
    tabIndex={-1}
  >
    <div className={styles.dragRail}>
      <span>{number}</span>
      {selectionMode ? <input type="checkbox" aria-label={`选择消息 ${number}`} checked={selected} onChange={onToggleSelection} /> : null}
      <button type="button" aria-label={`拖动消息 ${number}`} {...attributes} {...listeners}><span aria-hidden="true">⠿</span></button>
    </div>
    <img className={styles.avatar} src={sender?.avatarDataUrl || createInitialAvatar(sender?.name || '？')} alt="" />
    <div className={styles.compactBody}>
      <button type="button" className={styles.compactSummary} aria-label={`展开消息 ${number}`} aria-expanded="false" onClick={onExpand}>
        <span className={styles.compactMeta}><strong>{sender?.name || '未知发送人'}</strong><em>{MESSAGE_KIND_REGISTRY[message.kind].label}</em><time>{compactTime(message.sentAt)}</time></span>
        <span className={styles.compactText}>{messageSummary(message)}</span>
        <span className={styles.compactChevron} aria-hidden="true">⌄</span>
      </button>
      <div className={styles.actions}>
        <button type="button" aria-label={`在消息 ${number} 下方插入`} title="在下方插入" disabled={!participants.length} onClick={() => dispatch({ type: 'insert-message', afterId: message.id, message: createMessage(sender?.id ?? '', { id: makeDuplicateId(), sentAt: message.sentAt }) })}><span aria-hidden="true">＋</span></button>
        <button type="button" aria-label={`复制消息 ${number}`} onClick={() => dispatch({ type: 'duplicate-message', messageId: message.id, newId: makeDuplicateId() })}><span aria-hidden="true">⧉</span></button>
        <button type="button" aria-label={`删除消息 ${number}`} onClick={() => dispatch({ type: 'delete-message', messageId: message.id })}><span aria-hidden="true">×</span></button>
      </div>
    </div>
  </article>
}
