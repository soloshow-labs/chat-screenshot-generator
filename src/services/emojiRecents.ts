import { EMOJI_BY_ID } from '../components/emoji/emojiManifest'

const storageKey = 'chat-screenshot-generator:emoji-recents:v1'
const listeners = new Set<() => void>()
let current: string[] | undefined

function parseRecentIds(raw: string | null): string[] {
  try {
    const value: unknown = JSON.parse(raw ?? 'null')
    if (!Array.isArray(value)) return []
    return [...new Set(value.filter((id): id is string => typeof id === 'string' && EMOJI_BY_ID.has(id)))].slice(0, 8)
  } catch { return [] }
}

export function getRecentEmojiIds(): string[] {
  if (current === undefined) {
    try { current = parseRecentIds(localStorage.getItem(storageKey)) }
    catch { current = [] }
  }
  return current
}

function updateSnapshot(next: string[]): void {
  const previous = getRecentEmojiIds()
  if (next.length === previous.length && next.every((id, index) => id === previous[index])) return
  current = next
  for (const listener of listeners) listener()
}

export function recordRecentEmoji(id: string): void {
  if (!EMOJI_BY_ID.has(id)) return
  const next = [id, ...getRecentEmojiIds().filter(existing => existing !== id)].slice(0, 8)
  updateSnapshot(next)
  try { localStorage.setItem(storageKey, JSON.stringify(next)) }
  catch { /* This preference must never prevent a successful message insert. */ }
}

function onStorage(event: StorageEvent): void {
  if (event.key === storageKey || event.key === null) updateSnapshot(parseRecentIds(event.newValue))
}

export function subscribeRecentEmoji(listener: () => void): () => void {
  if (listeners.size === 0 && typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  }
}
