import type { PaymentPayload } from '../../../app/chatTypes'
import { paymentDisplayText } from '../../../utils/paymentMessage'
import { PaymentGlyph } from './PaymentGlyph'
import styles from '../RichMessage.module.css'

export function PaymentCard({ payment, side, selfId }: { payment: PaymentPayload; side: 'left' | 'right'; selfId?: string }) {
  const transfer = payment.mode === 'transfer'
  const { status, secondary } = paymentDisplayText(payment, selfId)
  const terminal = payment.status === 'expired' || (transfer && payment.status === 'refunded')
  return <div data-card-kind="payment" data-side={side} data-payment-mode={payment.mode} data-payment-status={payment.status} className={`${styles.paymentCard} ${payment.status !== 'pending' ? styles.paymentHandled : ''} ${terminal ? styles.paymentTerminal : ''} ${transfer && payment.status === 'expired' ? styles.paymentExpiredTransfer : ''}`}>
    <span data-card-tail aria-hidden="true" className={styles.cardTail} />
    <div className={styles.paymentBody}>
      <PaymentGlyph mode={payment.mode} status={payment.status} label={`${transfer ? '转账' : '红包'}：${status}`} />
      <div className={styles.paymentText}>
        <div className={styles.paymentTitle}>{transfer ? `¥${payment.amount.toFixed(2)}` : payment.note || '恭喜发财，大吉大利'}</div>
        {secondary ? <div className={styles.paymentNote}>{secondary}</div> : null}
      </div>
    </div>
    <footer className={styles.paymentFooter}>{transfer ? '微信转账' : '微信红包'}</footer>
  </div>
}
