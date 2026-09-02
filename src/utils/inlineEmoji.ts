import { EMOJI_BY_TOKEN, type EmojiId } from '../components/emoji/emojiManifest'

export type InlineEmojiPart = { type: 'text'; text: string } | { type: 'emoji'; id: EmojiId; token?: string }
const tokenPattern = new RegExp(`(\\\\*)(\\[(?:${[...EMOJI_BY_TOKEN.keys()].map(token => token.slice(1, -1)).join('|')})\\])`, 'g')

/** Scans only whitelisted tokens; unmatched content is never interpreted. */
export function parseInlineEmoji(text: string): InlineEmojiPart[] {
  const parts: InlineEmojiPart[] = []
  function appendText(value: string) {
    if (!value) return
    const last = parts.at(-1)
    if (last?.type === 'text') last.text += value
    else parts.push({ type: 'text', text: value })
  }
  let cursor = 0
  for (const match of text.matchAll(tokenPattern)) {
    appendText(text.slice(cursor, match.index))
    appendText('\\'.repeat(Math.floor(match[1].length / 2)))
    if (match[1].length % 2) appendText(match[2])
    else {
      const emoji = EMOJI_BY_TOKEN.get(match[2])!
      parts.push({ type: 'emoji', id: emoji.id, ...(match[2] !== emoji.token ? { token: match[2] } : {}) })
    }
    cursor = match.index + match[0].length
  }
  appendText(text.slice(cursor))
  return parts
}
