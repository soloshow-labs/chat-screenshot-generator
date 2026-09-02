import { useState, type Dispatch } from 'react'
import type { Message, PaymentPayload } from '../../app/chatTypes'
import type { ChatAction } from '../../app/chatReducer'
import { createOriginalPayment, paymentResponseError, type PaymentContext, type PaymentResponseRequest } from '../../utils/paymentMessage'
import styles from './PaymentFields.module.css'

function toDateTimeLocal(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function responseAt(sentAt: string): string {
  const source = new Date(sentAt)
  const sourceTime = source.getTime()
  if (!Number.isFinite(sourceTime)) return ''
  const response = new Date(sourceTime + 60_000)
  return Number.isFinite(response.getTime()) ? response.toISOString() : ''
}

function paymentStatuses(payment: PaymentPayload) {
  return payment.mode === 'red-packet'
    ? [
        ...(payment.status === 'refunded' ? [{ value: 'refunded', label: '已退还（历史兼容）' }] : []),
        { value: 'pending', label: '待领取' }, { value: 'received', label: '已领取' }, { value: 'expired', label: '已过期' },
      ] as const
    : [
        { value: 'pending', label: '待收款' }, { value: 'received', label: '已收款' }, { value: 'refunded', label: '已退还' }, { value: 'expired', label: '已过期' },
      ] as const
}

export function PaymentFields({ draft, message, number, dispatch }: { draft: PaymentContext; message: Message; number: number; dispatch: Dispatch<ChatAction> }) {
  const payment = message.payment
  const responseSource = `${message.id}:${message.sentAt}`
  const [responseTime, setResponseTime] = useState(() => ({ source: responseSource, sentAt: responseAt(message.sentAt) }))
  if (responseTime.source !== responseSource) setResponseTime({ source: responseSource, sentAt: responseAt(message.sentAt) })
  const sentAt = responseTime.sentAt
  if (message.kind !== 'payment' || !payment) return null
  const label = (text: string) => `消息 ${number} ${text}`
  const response = payment.role === 'receipt' || payment.role === 'notice'
  const configured = payment.role === undefined
    ? createOriginalPayment(payment, message.participantId, draft.participants, draft.conversationType)
    : payment
  const update = (next: PaymentPayload) => dispatch({ type: 'update-message', messageId: message.id, patch: { payment: next } })
  const request = (outcome: PaymentResponseRequest['outcome']): PaymentResponseRequest => ({
    messageId: message.id,
    newId: crypto.randomUUID(),
    outcome,
    receiverId: payment.receiverId ?? '',
    sentAt,
  })
  const setActor = (role: 'payer' | 'receiver', id: string) => {
    const person = draft.participants.find(participant => participant.id === id)
    const next = { ...configured, role: 'original' as const, sourceMessageId: null }
    if (role === 'payer') {
      next.payerId = person?.id ?? null
      next.payerName = person?.name ?? ''
      if (next.receiverId === next.payerId) { next.receiverId = null; next.receiverName = '' }
    } else {
      next.receiverId = person?.id ?? null
      next.receiverName = person?.name ?? ''
      if (next.payerId === next.receiverId) { next.payerId = null; next.payerName = '' }
    }
    update(next)
  }
  const responseError = paymentResponseError(draft, request('received'))
  const senderMismatch = payment.payerId != null && payment.payerId !== message.participantId
  return <div className={styles.fields}>
    {response ? <>
      <p className={styles.roleSummary}>{payment.role === 'receipt' ? '收款回执' : '红包领取通知'} · {payment.mode === 'transfer' ? '转账' : '红包'} · {payment.status === 'received' ? (payment.mode === 'transfer' ? '已收款' : '已领取') : '已退还'}</p>
      <p className={styles.hint}>这是生成时保存的支付快照，不能再次生成回应。</p>
    </> : <>
      <label><span>支付类型</span><select aria-label={label('支付类型')} value={payment.mode} onChange={event => {
        const mode = event.target.value as PaymentPayload['mode']
        update({ ...payment, mode, status: payment.mode === 'transfer' && mode === 'red-packet' && payment.status === 'refunded' ? 'pending' : payment.status })
      }}><option value="transfer">转账</option><option value="red-packet">红包</option></select></label>
      <label><span>{payment.mode === 'red-packet' ? '金额（红包截图不显示）' : '金额'}</span><input aria-label={label(payment.mode === 'red-packet' ? '金额（红包截图不显示）' : '金额')} type="number" min="0" step="any" value={payment.amount} onChange={event => update({ ...payment, amount: Math.max(0, Number(event.target.value) || 0) })} /></label>
      <label><span>{payment.mode === 'red-packet' ? '红包祝福语' : '转账备注'}</span><input aria-label={label(payment.mode === 'red-packet' ? '红包祝福语' : '转账备注')} value={payment.note} onChange={event => update({ ...payment, note: event.target.value })} /></label>
      <label><span>支付状态</span><select aria-label={label('支付状态')} value={payment.status} onChange={event => update({ ...payment, status: event.target.value as PaymentPayload['status'] })}>{paymentStatuses(payment).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label><span>付款人</span><select aria-label={label('付款人')} value={payment.payerId ?? ''} onChange={event => setActor('payer', event.target.value)}><option value="">请选择</option>{draft.participants.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      <label><span>收款人</span><select aria-label={label('收款人')} value={payment.receiverId ?? ''} onChange={event => setActor('receiver', event.target.value)}><option value="">请选择</option>{draft.participants.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      {senderMismatch ? <p className={styles.hint}>付款人与当前发送人不一致；请调整发送人或付款人后再生成回应。</p> : null}
      {draft.conversationType === 'group' && payment.receiverId == null ? <p className={styles.hint}>群聊请明确选择收款人。</p> : null}
      <label><span>回应时间</span><input aria-label={label('回应时间')} type="datetime-local" value={toDateTimeLocal(sentAt)} onChange={event => {
        const next = new Date(event.target.value)
        setResponseTime({ source: responseSource, sentAt: Number.isNaN(next.getTime()) ? '' : next.toISOString() })
      }} /></label>
      {payment.mode === 'transfer' ? <div className={styles.actions}>
        <button type="button" disabled={Boolean(responseError)} onClick={() => dispatch({ type: 'respond-payment', ...request('received') })}>生成收款回执</button>
        <button type="button" disabled={Boolean(paymentResponseError(draft, request('refunded')))} onClick={() => dispatch({ type: 'respond-payment', ...request('refunded') })}>生成退还回执</button>
      </div> : <div className={styles.actions}><button type="button" disabled={Boolean(responseError)} onClick={() => dispatch({ type: 'respond-payment', ...request('received') })}>生成领取通知</button></div>}
      <p className={styles.hint}>红包金额不会显示在截图中；已处理的转账卡片不会显示转账备注，但会保留在项目中。</p>
    </>}
  </div>
}
