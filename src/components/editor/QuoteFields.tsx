import { useRef, useState, type Dispatch } from 'react'
import type { ChatAction } from '../../app/chatReducer'
import type { Message, Participant } from '../../app/chatTypes'
import { createQuoteSnapshot } from '../../utils/messageQuote'
import { InlineMessageText } from '../emoji/InlineMessageText'
import styles from './EverydayFields.module.css'

export function QuoteFields({ message, messages, participants, number, dispatch }: {
  message: Message; messages: Message[]; participants: Participant[]; number: number; dispatch: Dispatch<ChatAction>
}) {
  const selectRef = useRef<HTMLSelectElement>(null)
  const [expanded, setExpanded] = useState(Boolean(message.quote))
  const contentVisible = expanded || Boolean(message.quote)
  const index = messages.findIndex(item => item.id === message.id)
  const choices = contentVisible
    ? messages.slice(0, Math.max(0, index)).filter(item => ['text', 'image', 'voice', 'file', 'video', 'contact'].includes(item.kind))
    : []
  return <details className={styles.quoteFields} open={contentVisible}>
    <summary onClick={event => {
      event.preventDefault()
      if (!message.quote) setExpanded(value => !value)
    }}>引用回复</summary>
    {contentVisible ? <><label className={styles.field}>
      <span>选择此前的文字、图片、语音、文件、视频或名片</span>
      <select ref={selectRef} aria-label={`消息 ${number} 引用来源`} value="" onChange={event => {
        const source = choices.find(item => item.id === event.target.value)
        const sender = participants.find(item => item.id === source?.participantId)
        if (!source || !sender) return
        const quote = createQuoteSnapshot(source, sender)
        if (quote) dispatch({ type: 'update-message', messageId: message.id, patch: { quote }, separateHistory: true })
      }}>
        <option value="">选择引用消息…</option>
        {choices.map(source => {
          const sender = participants.find(item => item.id === source.participantId)
          const quote = sender ? createQuoteSnapshot(source, sender) : null
          const summary = source.kind === 'image' && !source.media ? '[图片未上传]' : quote?.kind === 'image' ? '[图片]' : quote?.text || '[空文字]'
          const optionLabel = `${sender?.name ?? '未知成员'}：${summary}`.slice(0, 48)
          return <option key={source.id} value={source.id} disabled={!sender || (source.kind === 'image' && !source.media)}>
            {optionLabel}
          </option>
        })}
      </select>
    </label>
    {!choices.length ? <p className={styles.hint}>此前还没有可引用的文字、图片、语音、文件、视频或名片消息。</p> : null}
    {message.quote ? <div className={styles.quoteSummary}>
      <p><strong>{message.quote.senderName}：</strong>{message.quote.kind === 'image' ? '[图片快照]' : <InlineMessageText text={message.quote.text} small />}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.action} onClick={() => selectRef.current?.focus()}>重新选择引用</button>
        <button type="button" className={styles.action} onClick={() => dispatch({ type: 'update-message', messageId: message.id, patch: { quote: null }, separateHistory: true })}>移除引用</button>
      </div>
      <p className={styles.hint}>已保存快照，不随原消息或姓名变化。</p>
    </div> : null}</> : null}
  </details>
}
