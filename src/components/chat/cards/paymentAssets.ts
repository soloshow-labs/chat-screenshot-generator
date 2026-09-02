import transferPending from './assets/wechat-trans-icon1.png?url&no-inline'
import transferReceived from './assets/wechat-trans-icon2.png?url&no-inline'
import redPacketPending from './assets/wechat-trans-icon3.png?url&no-inline'
import redPacketReceived from './assets/wechat-trans-icon4.png?url&no-inline'

export const PAYMENT_ASSETS = {
  transfer: { pending: transferPending, received: transferReceived },
  'red-packet': { pending: redPacketPending, received: redPacketReceived },
} as const
