import type { PaymentPayload } from '../../../app/chatTypes'
import { PAYMENT_ASSETS } from './paymentAssets'
import { PAYMENT_TERMINAL_PATHS } from './paymentTerminalGlyphs'

export function PaymentGlyph({ mode, status, label }: Pick<PaymentPayload, 'mode' | 'status'> & { label: string }) {
  if (status === 'pending' || status === 'received') {
    return <img data-payment-glyph data-payment-mode={mode} data-payment-renderer="reference-png" src={PAYMENT_ASSETS[mode][status]} alt={label} width={mode === 'transfer' ? 40 : 34} height="40" draggable={false} />
  }
  if (mode === 'red-packet' && status === 'expired') {
    return <img data-payment-glyph data-payment-mode={mode} data-payment-renderer="reference-png" src={PAYMENT_ASSETS[mode].pending} alt={label} width="34" height="40" draggable={false} />
  }
  if (mode === 'transfer') {
    return <svg data-payment-glyph data-payment-mode={mode} data-payment-renderer="reference-svg" viewBox="0 0 24 24" width="40" height="40" role="img" aria-label={label}>
      <path d={PAYMENT_TERMINAL_PATHS[status]} transform="translate(2 2)" fill="#fff" fillRule="evenodd" />
    </svg>
  }
  // Refunded red packets are a legacy project state, absent from the reference.
  // Keep their compatibility drawing and data without inventing new artwork.
  return <svg data-payment-glyph data-payment-mode={mode} data-payment-renderer="compatibility-svg" viewBox="0 0 40 40" width="40" height="40" role="img" aria-label={label} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect data-envelope-body x="3" y="1" width="34" height="38" rx="2" fill="#f17c61" stroke="none" />
    <path d="M3 14q17 10 34 0v23q0 2-2 2H5q-2 0-2-2Z" fill="#e76d53" stroke="none" />
    <circle data-envelope-seal cx="20" cy="18" r="6" fill="#ffd18b" stroke="none" />
    <path d="m19 14-3 3 3 3m-3-3h5q4 0 3 5" stroke="#d88139" strokeWidth="1.2" />
  </svg>
}
