import { useState } from 'react'
import type { MessageQuote } from '../../app/chatTypes'
import { useMediaAssetUrl } from '../../hooks/useMediaAssetUrl'
import { InlineMessageText } from '../emoji/InlineMessageText'
import styles from './EverydayMessage.module.css'

function QuoteImage({ quote }: { quote: MessageQuote }) {
  const { url, loading, error } = useMediaAssetUrl(quote.media?.assetId ?? null)
  const [failed, setFailed] = useState(false)
  if (failed || (!url && !loading)) return <span data-quote-image-error>{error ?? '引用图片无法读取'}</span>
  if (!url) return <span data-quote-image-loading>引用图片加载中…</span>
  return <img src={url} alt={`${quote.senderName}引用的图片`} width="36" height="36" className={styles.quoteImage} onError={() => setFailed(true)} />
}

export function QuotePreview({ quote, side }: { quote: MessageQuote; side: 'left' | 'right' }) {
  return <div data-quote-preview data-side={side} className={styles.quote}>
    <div className={styles.quoteName}>{quote.senderName}：</div>
    {quote.kind === 'text'
      ? <div className={styles.quoteText}><InlineMessageText text={quote.text} small /></div>
      : <QuoteImage key={quote.media?.assetId} quote={quote} />}
  </div>
}
