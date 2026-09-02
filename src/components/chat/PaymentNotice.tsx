import type { PaymentPayload } from '../../app/chatTypes'
import { paymentNoticeText } from '../../utils/paymentMessage'
import { PaymentGlyph } from './cards/PaymentGlyph'
import styles from './PaymentNotice.module.css'

export function PaymentNotice({ payment, selfId }: { payment: PaymentPayload; selfId?: string }) {
  const text = paymentNoticeText(payment, selfId)
  return <div className={styles.notice} data-payment-notice data-payment-role={payment.role ?? 'original'}>
    <PaymentGlyph mode="red-packet" status="pending" label="红包领取提示" />
    <span>{text}</span>
  </div>
}
