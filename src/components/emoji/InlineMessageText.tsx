import { Fragment, useState } from 'react'
import { parseInlineEmoji } from '../../utils/inlineEmoji'
import { EMOJI_BY_ID, type EmojiId } from './emojiManifest'
import styles from './InlineMessageText.module.css'

function InlineEmoji({ id, small, token }: { id: EmojiId; small: boolean; token?: string }) {
  const [failed, setFailed] = useState(false)
  const emoji = EMOJI_BY_ID.get(id)!
  if (failed) return <span data-emoji-error={id}>{token ?? emoji.token}</span>
  return <img data-inline-emoji={id} className={small ? styles.small : styles.emoji} src={emoji.src} alt={token ?? emoji.token} draggable={false} onError={() => setFailed(true)} />
}

/** No wrapper element: ordinary text retains its existing bubble geometry. */
export function InlineMessageText({ text, small = false }: { text: string; small?: boolean }) {
  return parseInlineEmoji(text).map((part, index) => part.type === 'text'
    ? <Fragment key={index}>{part.text}</Fragment>
    : <InlineEmoji key={`${index}:${part.id}`} id={part.id} token={part.token} small={small} />)
}
