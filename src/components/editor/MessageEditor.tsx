import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type Dispatch } from 'react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import type { ChatAction } from '../../app/chatReducer'
import type { ConversationType, Message, MessageKind, Participant } from '../../app/chatTypes'
import { createLocalId } from '../../utils/createLocalId'
import { createMessage } from '../../app/messageFactory'
import { MESSAGE_KIND_OPTIONS, MESSAGE_KIND_REGISTRY } from '../../app/messageKindRegistry'
import { summarizeMessage } from '../../app/messageDomain'
import { MessageRow } from './MessageRow'
import { CompactMessageRow } from './CompactMessageRow'
import { BatchMessageDialog } from './BatchMessageDialog'
import { useImageMessageImport } from '../../hooks/useImageMessageImport'
import { ConfirmDialog } from '../shared/ConfirmDialog'
import styles from './MessageEditor.module.css'

interface MessageEditorProps {
  messages: Message[]
  participants: Participant[]
  conversationType?: ConversationType
  dispatch: Dispatch<ChatAction>
  locateRequest?: { messageId: string; sequence: number } | null
}

function hasDraggedFiles(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types ?? []).includes('Files') || Array.from(dataTransfer.items ?? []).some(item => item.kind === 'file')
}

export function MessageEditor({ messages, participants, conversationType = 'group', dispatch, locateRequest }: MessageEditorProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [compactPreference, setCompactPreference] = useState<boolean | null>(null)
  const [expandedIds, setExpandedIds] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [senderFilter, setSenderFilter] = useState('')
  const [kindFilter, setKindFilter] = useState<MessageKind | ''>('')
  const [matchIndex, setMatchIndex] = useState(0)
  const [navigationRequest, setNavigationRequest] = useState<{ messageId: string; sequence: number } | null>(null)
  const compactAvailable = messages.length > 0
  const compactEditing = compactAvailable && (compactPreference ?? messages.length >= 200)
  const expandedIdSet = useMemo(() => new Set(expandedIds), [expandedIds])
  const matches = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return messages.filter(message => {
      if (senderFilter && message.participantId !== senderFilter) return false
      if (kindFilter && message.kind !== kindFilter) return false
      if (!normalized) return true
      const sender = participants.find(participant => participant.id === message.participantId)?.name ?? ''
      const searchable = [
        sender, MESSAGE_KIND_REGISTRY[message.kind].label, summarizeMessage(message), message.text,
        message.voice?.transcript, message.link?.description, message.link?.url, message.payment?.note,
        message.contactCard?.description, message.location?.address, message.system?.actorName,
        message.system?.targetName,
      ].filter(Boolean).join(' ').toLocaleLowerCase()
      return searchable.includes(normalized)
    })
  }, [kindFilter, messages, participants, query, senderFilter])
  const boundedMatchIndex = matches.length ? Math.min(matchIndex, matches.length - 1) : 0
  function focusLocatedMessage(request: { messageId: string } | null | undefined) {
    if (!request) return
    const row = Array.from(scrollerRef.current?.querySelectorAll<HTMLElement>('[data-editor-message-id]') ?? [])
      .find(element => element.dataset.editorMessageId === request.messageId)
    const scroller = scrollerRef.current
    if (!row || !scroller) return
    row?.focus({ preventScroll: true })
    const rowBounds = row.getBoundingClientRect()
    const listBounds = scroller.getBoundingClientRect()
    scroller.scrollTop += rowBounds.top - listBounds.top - Math.max(0, (scroller.clientHeight - rowBounds.height) / 2)
  }
  useLayoutEffect(() => focusLocatedMessage(locateRequest), [locateRequest])
  useLayoutEffect(() => focusLocatedMessage(navigationRequest), [navigationRequest])
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [batchDialogOpen, setBatchDialogOpen] = useState(false)
  const [confirmRequest, setConfirmRequest] = useState<
    | { type: 'delete-selected'; messageIds: string[] }
    | { type: 'clear'; count: number }
    | null
  >(null)
  const [imageDropActive, setImageDropActive] = useState(false)
  const [lastImportedMessageId, setLastImportedMessageId] = useState<string | null>(null)
  const onImportedImages = useCallback((imported: Message[]) => setLastImportedMessageId(imported.at(-1)?.id ?? null), [])
  const { importFiles, busy: imageImportBusy, error: imageImportError, notice: imageImportNotice } = useImageMessageImport({ participants, dispatch, onImported: onImportedImages })
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selected = messages.filter(message => selectedIdSet.has(message.id)).map(message => message.id)
  useLayoutEffect(() => {
    if (!lastImportedMessageId) return
    const row = scrollerRef.current?.querySelector<HTMLElement>(`[data-editor-message-id="${lastImportedMessageId}"]`)
    const scroller = scrollerRef.current
    if (!row || !scroller) return
    const rowBounds = row.getBoundingClientRect()
    const listBounds = scroller.getBoundingClientRect()
    scroller.scrollTop += rowBounds.top - listBounds.top - Math.max(0, (scroller.clientHeight - rowBounds.height) / 2)
    setLastImportedMessageId(null)
  }, [lastImportedMessageId, messages])
  function toggleSelection(messageId: string) {
    setSelectedIds(ids => ids.includes(messageId) ? ids.filter(id => id !== messageId) : [...ids, messageId])
  }
  function deleteSelected() {
    if (selected.length) setConfirmRequest({ type: 'delete-selected', messageIds: selected })
  }
  function clearMessages() {
    if (messages.length) setConfirmRequest({ type: 'clear', count: messages.length })
  }
  function updateNavigator(next: { query?: string; sender?: string; kind?: MessageKind | '' }) {
    if (next.query !== undefined) setQuery(next.query)
    if (next.sender !== undefined) setSenderFilter(next.sender)
    if (next.kind !== undefined) setKindFilter(next.kind)
    setMatchIndex(0)
  }
  function navigateMatches(direction: -1 | 1) {
    if (!matches.length) return
    const nextIndex = (boundedMatchIndex + direction + matches.length) % matches.length
    const target = matches[nextIndex]
    setMatchIndex(nextIndex)
    setExpandedIds(ids => ids.includes(target.id) ? ids : [...ids, target.id])
    setNavigationRequest(current => ({ messageId: target.id, sequence: (current?.sequence ?? 0) + 1 }))
  }
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    if (event.over && event.active.id !== event.over.id) {
      dispatch({
        type: 'reorder-messages',
        activeId: String(event.active.id),
        overId: String(event.over.id),
      })
    }
  }

  function addMessage() {
    const self = participants.find((participant) => participant.isSelf) || participants[0]
    if (!self) return
    dispatch({
      type: 'add-message',
      message: createMessage(self.id, { id: createLocalId('message') }),
    })
  }

  function handleImagePaste(event: ClipboardEvent<HTMLElement>) {
    if (event.target instanceof Element && event.target.closest('[role="dialog"]')) return
    const text = event.clipboardData.getData('text/plain')
    const files = Array.from(event.clipboardData.files)
    if (text || !files.length) return
    event.preventDefault()
    void importFiles(files)
  }

  return (
    <section className={styles.editor} aria-labelledby="message-editor-title" onPaste={handleImagePaste}>
      <div className={styles.header}>
        <h2 id="message-editor-title">消息列表</h2>
        <span>{messages.length} 条</span>
        <div className={styles.batchActions}>
          {compactAvailable ? <label className={styles.compactToggle}><input type="checkbox" aria-label="精简编辑" checked={compactEditing} onChange={event => setCompactPreference(event.target.checked)} />精简编辑</label> : null}
          <button type="button" aria-pressed={selectionMode} onClick={() => { setSelectionMode(!selectionMode); setSelectedIds([]) }}>{selectionMode ? '退出多选' : '多选消息'}</button>
          {selectionMode ? <>
            <label><input type="checkbox" aria-label="全选消息" checked={messages.length > 0 && selected.length === messages.length} disabled={!messages.length} onChange={event => setSelectedIds(event.target.checked ? messages.map(message => message.id) : [])} />全选</label>
            <button type="button" disabled={!selected.length} onClick={() => setBatchDialogOpen(true)}>批量修改（{selected.length}）</button>
            <button type="button" disabled={!selected.length} onClick={deleteSelected}>删除选中（{selected.length}）</button>
          </> : null}
          <button type="button" disabled={!messages.length} onClick={clearMessages}>清空消息</button>
        </div>
      </div>

      <div className={styles.navigator} role="search" aria-label="消息导航器">
        <input type="search" aria-label="搜索消息" value={query} placeholder="搜索内容、发送人或类型" onChange={event => updateNavigator({ query: event.target.value })} />
        <select aria-label="筛选发送人" value={senderFilter} onChange={event => updateNavigator({ sender: event.target.value })}>
          <option value="">全部发送人</option>
          {participants.map(participant => <option key={participant.id} value={participant.id}>{participant.name}</option>)}
        </select>
        <select aria-label="筛选消息类型" value={kindFilter} onChange={event => updateNavigator({ kind: event.target.value as MessageKind | '' })}>
          <option value="">全部类型</option>
          {MESSAGE_KIND_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <span role="status" aria-label="消息匹配结果">{matches.length ? `${boundedMatchIndex + 1} / ${matches.length} 个匹配` : '0 个匹配'}</span>
        <button type="button" aria-label="上一个匹配消息" disabled={!matches.length} onClick={() => navigateMatches(-1)}>↑</button>
        <button type="button" aria-label="下一个匹配消息" disabled={!matches.length} onClick={() => navigateMatches(1)}>↓</button>
      </div>

      <div className={styles.scroller} ref={scrollerRef}>
        <div
          className={`${styles.imageImport} ${imageDropActive ? styles.imageImportActive : ''}`}
          aria-label="拖入或粘贴图片"
          role="group"
          tabIndex={0}
          onDragEnter={event => { if (hasDraggedFiles(event.dataTransfer)) { event.preventDefault(); setImageDropActive(true) } }}
          onDragOver={event => { if (hasDraggedFiles(event.dataTransfer)) event.preventDefault() }}
          onDragLeave={() => setImageDropActive(false)}
          onDrop={event => { event.preventDefault(); setImageDropActive(false); void importFiles(Array.from(event.dataTransfer.files)) }}
        >
          <strong>{imageImportBusy ? '正在导入图片…' : '拖入或粘贴图片'}</strong><span>可一次追加多张本地图片</span>
          {imageImportError ? <span role="alert">{imageImportError}</span> : null}
          {imageImportNotice ? <span role="status">{imageImportNotice}</span> : null}
        </div>
        {messages.length === 0 ? <div className={styles.empty}>还没有消息，点击下方按钮添加。</div> : null}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={messages.map((message) => message.id)} strategy={verticalListSortingStrategy}>
            <div className={styles.rows}>
              {messages.map((message, index) => (
                compactEditing && !expandedIdSet.has(message.id) && locateRequest?.messageId !== message.id
                  ? <CompactMessageRow
                      key={message.id}
                      message={message}
                      participants={participants}
                      index={index}
                      dispatch={dispatch}
                      makeDuplicateId={() => createLocalId('message')}
                      selectionMode={selectionMode}
                      selected={selectedIdSet.has(message.id)}
                      onToggleSelection={() => toggleSelection(message.id)}
                      onExpand={() => setExpandedIds(ids => ids.includes(message.id) ? ids : [...ids, message.id])}
                    />
                  : <MessageRow
                      key={message.id}
                      message={message}
                      messages={messages}
                      participants={participants}
                      conversationType={conversationType}
                      index={index}
                      dispatch={dispatch}
                      makeDuplicateId={() => createLocalId('message')}
                      selectionMode={selectionMode}
                      selected={selectedIdSet.has(message.id)}
                      onToggleSelection={() => toggleSelection(message.id)}
                      onCollapse={compactEditing ? () => setExpandedIds(ids => ids.filter(id => id !== message.id)) : undefined}
                    />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <div className={styles.footer}>
        <p className={styles.keyboardHint}>内容输入框内：Tab 切换发送人，Shift+Tab 反向切换。</p>
        <button type="button" onClick={addMessage} disabled={participants.length === 0}>
          <Plus size={17} /> 添加消息
        </button>
      </div>
      {batchDialogOpen ? <BatchMessageDialog messages={messages} participants={participants} selectedIds={selected} onClose={() => setBatchDialogOpen(false)} onApply={edit => {
        dispatch({ type: 'batch-edit-messages', edit })
        setBatchDialogOpen(false)
      }} /> : null}
      {confirmRequest?.type === 'delete-selected' ? <ConfirmDialog
        title={`删除选中的 ${confirmRequest.messageIds.length} 条消息？`}
        confirmLabel={`确认删除 ${confirmRequest.messageIds.length} 条消息`}
        danger
        onCancel={() => setConfirmRequest(null)}
        onConfirm={() => {
          dispatch({ type: 'delete-messages', messageIds: confirmRequest.messageIds })
          setSelectedIds([])
          setConfirmRequest(null)
        }}
      >删除后可通过撤销恢复。</ConfirmDialog> : null}
      {confirmRequest?.type === 'clear' ? <ConfirmDialog
        title={`清空全部 ${confirmRequest.count} 条消息？`}
        confirmLabel="确认清空消息"
        danger
        onCancel={() => setConfirmRequest(null)}
        onConfirm={() => {
          dispatch({ type: 'clear-messages' })
          setSelectedIds([])
          setConfirmRequest(null)
        }}
      >清空后可通过撤销恢复。</ConfirmDialog> : null}
    </section>
  )
}
