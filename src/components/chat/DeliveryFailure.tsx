import type { Message } from '../../app/chatTypes'
import styles from './ChatCanvas.module.css'

export function DeliveryFailure({ message }: { message: Message }) {
  return message.deliveryStatus === 'rejected'
    ? <span className={styles.deliveryFailure} data-delivery-status="rejected" aria-label="发送失败">!</span>
    : null
}
