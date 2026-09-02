import { EMOJI_BY_TOKEN, EMOJI_MANIFEST } from '../components/emoji/emojiManifest'

const searchTerms = [...EMOJI_BY_TOKEN].map(([token, emoji]) => ({ term: token.slice(1, -1).toLowerCase(), id: emoji.id }))

export function searchEmoji(query: string): typeof EMOJI_MANIFEST {
  const normalized = query.trim().replace(/^\[|\]$/g, '').trim().toLowerCase()
  if (!normalized) return EMOJI_MANIFEST
  const matchingIds = new Set(searchTerms.filter(({ term }) => term.includes(normalized)).map(({ id }) => id))
  return EMOJI_MANIFEST.filter(emoji => matchingIds.has(emoji.id))
}
