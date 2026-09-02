import { useEffect, useRef, useState } from 'react'
import type { Message, Participant } from '../../app/chatTypes'
import { validateBatchMessageEdit, type BatchMessageEdit } from '../../utils/batchMessageEdit'
import styles from './BatchMessageDialog.module.css'

function toDateTimeLocal(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function BatchMessageDialog({ messages, participants, selectedIds, onApply, onClose }: {
  messages: Message[]
  participants: Participant[]
  selectedIds: string[]
  onApply: (edit: BatchMessageEdit) => void
  onClose: () => void
}) {
  const first = messages.find(message => selectedIds.includes(message.id))
  const includesPayment = messages.some(message => selectedIds.includes(message.id) && message.kind === 'payment')
  const dialogRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const [changeSender, setChangeSender] = useState(false)
  const [participantId, setParticipantId] = useState(participants[0]?.id ?? '')
  const [shiftTime, setShiftTime] = useState(false)
  const [firstSentAt, setFirstSentAt] = useState(first ? toDateTimeLocal(first.sentAt) : '')
  const [timeChanged, setTimeChanged] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled), button:not(:disabled)')
    firstFocusable?.focus()
    return () => { if (openerRef.current?.isConnected) openerRef.current.focus() }
  }, [])

  function apply() {
    const parsedFirstSentAt = Date.parse(firstSentAt)
    const edit: BatchMessageEdit = {
      messageIds: selectedIds,
      ...(changeSender ? { participantId } : {}),
      ...(shiftTime ? { firstSentAt: timeChanged ? (Number.isFinite(parsedFirstSentAt) ? new Date(parsedFirstSentAt).toISOString() : firstSentAt) : first?.sentAt ?? '' } : {}),
    }
    const validationError = validateBatchMessageEdit({ messages, participants }, edit)
    if (validationError) { setError(validationError); return }
    onApply(edit)
  }

  return <div className={styles.overlay} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="batch-message-title" onKeyDown={event => {
      if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) { event.preventDefault(); event.stopPropagation(); return }
      if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); onClose(); return }
      if (event.key !== 'Tab') return
      const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('input:not(:disabled), select:not(:disabled), button:not(:disabled)')]
      const firstFocusable = focusable[0], lastFocusable = focusable.at(-1)
      if (event.shiftKey && document.activeElement === firstFocusable) { event.preventDefault(); lastFocusable?.focus() }
      else if (!event.shiftKey && document.activeElement === lastFocusable) { event.preventDefault(); firstFocusable?.focus() }
    }}>
      <h2 id="batch-message-title">批量修改消息</h2>
      <p>已选择 {selectedIds.length} 条消息。</p>
      {first ? <p>原时间：{first.sentAt}</p> : null}
      {includesPayment ? <p>发送人与付款／收款身份独立，不会自动修改支付身份。</p> : null}
      <label className={styles.toggle}><input type="checkbox" checked={changeSender} onChange={event => setChangeSender(event.target.checked)} />修改发送人</label>
      {changeSender ? <label>批量发送人<select aria-label="批量发送人" value={participantId} onChange={event => setParticipantId(event.target.value)}>{participants.map(participant => <option key={participant.id} value={participant.id}>{participant.name}</option>)}</select></label> : null}
      <label className={styles.toggle}><input type="checkbox" checked={shiftTime} onChange={event => setShiftTime(event.target.checked)} />平移日期时间</label>
      {shiftTime ? <label>第一条新时间<input aria-label="第一条新时间" type="datetime-local" value={firstSentAt} onChange={event => { setTimeChanged(true); setFirstSentAt(event.target.value) }} /></label> : null}
      {error ? <p role="alert">{error}</p> : null}
      <div className={styles.actions}><button type="button" onClick={onClose}>取消</button><button type="button" onClick={apply}>应用批量修改</button></div>
    </div>
  </div>
}
