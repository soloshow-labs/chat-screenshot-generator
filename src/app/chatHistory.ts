import type { ChatDraft, Message } from './chatTypes'
import { chatReducer, type ChatAction } from './chatReducer'

export interface ChatHistory { past: ChatDraft[]; present: ChatDraft; future: ChatDraft[]; lastEdit: { key: string; timestamp: number } | null }
export type HistoryAction = { type: 'edit'; action: ChatAction; timestamp: number } | { type: 'undo' } | { type: 'redo' } | { type: 'recover'; draft: ChatDraft }
export function createHistory(draft: ChatDraft): ChatHistory { return { past: [], present: draft, future: [], lastEdit: null } }
export function historyMessages(history: ChatHistory): Message[] {
  return [...history.past, history.present, ...history.future].flatMap(draft => draft.messages)
}
export function historyDrafts(history: ChatHistory): ChatDraft[] {
  return [...history.past, history.present, ...history.future]
}
function changedFields(before: unknown, after: unknown, prefix = ''): string[] {
  if (Object.is(before, after)) return []
  if (before && after && typeof before === 'object' && typeof after === 'object') {
    const a = before as Record<string, unknown>
    const b = after as Record<string, unknown>
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort().flatMap(key => changedFields(a[key], b[key], prefix ? `${prefix}.${key}` : key))
  }
  return [prefix]
}
function editingKey(action: ChatAction, before: ChatDraft, after: ChatDraft): string | null {
  if (action.type === 'set-field') {
    if (action.field !== 'wallpaper') return `draft:${action.field}`
    // Mode switches, image confirmations and restoring default are discrete
    // undo steps. Only edits within an already-selected color may coalesce.
    return after.wallpaper?.type === 'color' ? 'draft:wallpaper' : null
  }
  if (action.type === 'update-message') {
    if (action.separateHistory || 'kind' in action.patch || 'quote' in action.patch) return null
    const beforeMessage = before.messages.find(message => message.id === action.messageId)
    const afterMessage = after.messages.find(message => message.id === action.messageId)
    if (beforeMessage?.voice?.durationMode !== afterMessage?.voice?.durationMode || beforeMessage?.voice?.showTranscript !== afterMessage?.voice?.showTranscript) return null
    if (beforeMessage?.contactCard?.avatarDataUrl !== afterMessage?.contactCard?.avatarDataUrl) return null
    if ('media' in action.patch && before.messages.find(message => message.id === action.messageId)?.media?.assetId !== after.messages.find(message => message.id === action.messageId)?.media?.assetId) return null
    return `message:${action.messageId}:${changedFields(before.messages.find(message => message.id === action.messageId), after.messages.find(message => message.id === action.messageId)).join(',')}`
  }
  if (action.type === 'update-participant') {
    if (action.separateHistory || 'isSelf' in action.patch || 'avatarDataUrl' in action.patch) return null
    return `participant:${action.participantId}:${changedFields(before.participants.find(participant => participant.id === action.participantId), after.participants.find(participant => participant.id === action.participantId)).join(',')}`
  }
  return null
}
export function historyReducer(state: ChatHistory, event: HistoryAction): ChatHistory {
  if (event.type === 'recover') return createHistory(event.draft)
  if (event.type === 'undo' || event.type === 'redo') {
    const undo = event.type === 'undo'
    const source = undo ? state.past : state.future
    if (!source.length) return state
    const present = { ...source[source.length - 1], screenScrollTop: state.present.screenScrollTop }
    return { present, past: undo ? state.past.slice(0, -1) : [...state.past, state.present].slice(-50), future: undo ? [...state.future, state.present] : state.future.slice(0, -1), lastEdit: null }
  }
  const present = chatReducer(state.present, event.action)
  if (present === state.present) return state
  if (event.action.type === 'set-field' && event.action.field === 'screenScrollTop') return { ...state, present }
  const key = editingKey(event.action, state.present, present)
  const elapsed = event.timestamp - (state.lastEdit?.timestamp ?? -Infinity)
  const coalesce = key !== null && key === state.lastEdit?.key && elapsed >= 0 && elapsed < 600
  return { present, past: coalesce ? state.past : [...state.past, state.present].slice(-50), future: [], lastEdit: key ? { key, timestamp: event.timestamp } : null }
}
