import { useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import { EMOJI_BY_ID, EMOJI_MANIFEST } from '../emoji/emojiManifest'
import { getRecentEmojiIds, recordRecentEmoji, subscribeRecentEmoji } from '../../services/emojiRecents'
import { searchEmoji } from '../../utils/emojiSearch'
import styles from './EmojiPicker.module.css'

interface EmojiPickerProps {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  text: string
  number: number
  composing: boolean
  onInsert: (text: string) => void
}

function EmojiGrid({ emojis, disabled, onSelect }: {
  emojis: typeof EMOJI_MANIFEST
  disabled: boolean
  onSelect: (emoji: typeof EMOJI_MANIFEST[number]) => void
}) {
  return <div className={styles.grid}>{emojis.map(emoji => <button key={emoji.id} type="button" aria-label={`插入${emoji.name}`} title={emoji.name} disabled={disabled} onClick={() => onSelect(emoji)}>
    <img src={emoji.src} alt="" width="28" height="28" draggable={false} /><span>{emoji.name}</span>
  </button>)}</div>
}

export function EmojiPicker({ textareaRef, text, number, composing, onInsert }: EmojiPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const recentIds = useSyncExternalStore(subscribeRecentEmoji, getRecentEmojiIds, getRecentEmojiIds)
  const recent = recentIds.flatMap(id => { const emoji = EMOJI_BY_ID.get(id); return emoji ? [emoji] : [] })
  const matches = searchEmoji(query)
  const pendingCaret = useRef<number | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const searchComposing = useRef(false)
  const id = useId()
  useLayoutEffect(() => {
    if (pendingCaret.current !== null && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(pendingCaret.current, pendingCaret.current)
      pendingCaret.current = null
    }
  }, [open, text, textareaRef])
  useLayoutEffect(() => { if (open) searchRef.current?.focus() }, [open])

  function close() { searchComposing.current = false; setOpen(false); textareaRef.current?.focus() }
  function insert(emoji: typeof EMOJI_MANIFEST[number]) {
    if (composing || searchComposing.current) return
    const { token, id } = emoji
    // Selection survives blur; read it now so edits made with the picker open
    // replace the current range rather than the range from opening the panel.
    const textarea = textareaRef.current
    const start = textarea?.selectionStart ?? text.length
    const end = textarea?.selectionEnd ?? text.length
    pendingCaret.current = start + token.length
    onInsert(text.slice(0, start) + token + text.slice(end))
    recordRecentEmoji(id)
    setOpen(false)
  }
  return <div className={styles.control} onKeyDown={event => {
    if (event.key === 'Escape' && open && !composing && !searchComposing.current && !event.nativeEvent.isComposing) {
      event.preventDefault(); event.stopPropagation(); close()
    }
  }}>
    <button type="button" className={styles.action} aria-label={`消息 ${number} 插入表情`} aria-expanded={open} aria-controls={id} disabled={composing} onClick={() => {
      if (open) { close(); return }
      setQuery('')
      setOpen(true)
    }}>插入表情</button>
    {open ? <div id={id} role="group" aria-label={`消息 ${number} 表情选择器`} className={styles.panel}>
      <div className={styles.heading}><span>微信表情 · 本地素材</span><button type="button" className={styles.action} onClick={close}>关闭表情</button></div>
      <input ref={searchRef} type="search" aria-label={`消息 ${number} 搜索表情`} placeholder="搜索表情名称" className={styles.search} value={query} onChange={event => setQuery(event.target.value)} onCompositionStart={() => { searchComposing.current = true }} onCompositionEnd={() => { searchComposing.current = false }} onKeyDown={event => {
        if (event.key === 'Enter') {
          event.stopPropagation()
          if (!searchComposing.current && !event.nativeEvent.isComposing && event.keyCode !== 229) event.preventDefault()
        }
      }} />
      <div className={styles.results}>
        {query.trim() ? <section aria-label={`消息 ${number} 表情搜索结果`}>
          <h3 className={styles.sectionHeading}>搜索结果</h3>
          {matches.length ? <EmojiGrid emojis={matches} disabled={composing} onSelect={insert} /> : <p role="status" className={styles.empty}>没有找到匹配的表情</p>}
        </section> : <>
          <section aria-label={`消息 ${number} 最近使用表情`}><h3 className={styles.sectionHeading}>最近使用</h3>{recent.length ? <EmojiGrid emojis={recent} disabled={composing} onSelect={insert} /> : <p className={styles.empty}>尚未使用表情</p>}</section>
          <section aria-label={`消息 ${number} 全部表情`}><h3 className={styles.sectionHeading}>全部表情</h3><EmojiGrid emojis={EMOJI_MANIFEST} disabled={composing} onSelect={insert} /></section>
        </>}
      </div>
    </div> : null}
  </div>
}
