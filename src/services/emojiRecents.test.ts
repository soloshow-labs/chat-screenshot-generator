import { beforeEach, describe, expect, it, vi } from 'vitest'

const key = 'chat-screenshot-generator:emoji-recents:v1'

beforeEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  localStorage.removeItem(key)
})

describe('emoji recents preference', () => {
  it('keeps unique newest-first IDs, caps at eight, persists and restores', async () => {
    const store = await import('./emojiRecents')
    for (const id of ['smile', 'grin', 'giggle', 'shy', 'playful', 'proud', 'blank', 'question', 'surprised']) store.recordRecentEmoji(id)
    store.recordRecentEmoji('shy')
    const expected = ['shy', 'surprised', 'question', 'blank', 'proud', 'playful', 'giggle', 'grin']
    expect(store.getRecentEmojiIds()).toEqual(expected)
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(expected)
    vi.resetModules()
    expect((await import('./emojiRecents')).getRecentEmojiIds()).toEqual(expected)
  })
  it('filters stale, non-string and duplicate values during initial load', async () => {
    localStorage.setItem(key, JSON.stringify(['smile', null, 'removed', 'smile', 7, 'joy', {}, 'grin']))
    const store = await import('./emojiRecents')
    expect(store.getRecentEmojiIds()).toEqual(['smile', 'joy', 'grin'])
    const snapshot = store.getRecentEmojiIds()
    store.recordRecentEmoji('unrecognized')
    expect(store.getRecentEmojiIds()).toBe(snapshot)
  })
  it.each(['not json', '{}', 'null', '42'])('ignores damaged preference %s without touching the draft', async value => {
    localStorage.setItem(key, value)
    localStorage.setItem('chat-screenshot-generator:draft:v1', 'untouched fixture')
    const store = await import('./emojiRecents')
    expect(store.getRecentEmojiIds()).toEqual([])
    store.recordRecentEmoji('smile')
    expect(store.getRecentEmojiIds()).toEqual(['smile'])
    expect(localStorage.getItem('chat-screenshot-generator:draft:v1')).toBe('untouched fixture')
  })
  it('caches an immutable identity between changes and notifies subscribers only on changes', async () => {
    const store = await import('./emojiRecents')
    const first = store.getRecentEmojiIds()
    expect(store.getRecentEmojiIds()).toBe(first)
    const snapshots: string[][] = []
    const unsubscribe = store.subscribeRecentEmoji(() => snapshots.push(store.getRecentEmojiIds()))
    store.recordRecentEmoji('smile')
    expect(snapshots).toEqual([['smile']])
    const second = store.getRecentEmojiIds()
    expect(second).not.toBe(first)
    store.recordRecentEmoji('smile')
    expect(store.getRecentEmojiIds()).toBe(second)
    expect(snapshots).toHaveLength(1)
    unsubscribe()
    store.recordRecentEmoji('joy')
    expect(snapshots).toHaveLength(1)
  })
  it('remains usable when both reading and writing storage throw', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError') })
    const store = await import('./emojiRecents')
    expect(store.getRecentEmojiIds()).toEqual([])
    expect(() => store.recordRecentEmoji('joy')).not.toThrow()
    expect(store.getRecentEmojiIds()).toEqual(['joy'])
  })
  it('notifies mounted consumers of valid external preference updates', async () => {
    const store = await import('./emojiRecents')
    const snapshots: string[][] = []
    const unsubscribe = store.subscribeRecentEmoji(() => snapshots.push(store.getRecentEmojiIds()))
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: '["joy","smile","joy","missing"]' }))
    expect(store.getRecentEmojiIds()).toEqual(['joy', 'smile'])
    expect(snapshots).toEqual([['joy', 'smile']])
    window.dispatchEvent(new StorageEvent('storage', { key: 'other-key', newValue: '[]' }))
    expect(store.getRecentEmojiIds()).toEqual(['joy', 'smile'])
    unsubscribe()
  })
})
