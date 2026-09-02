import type { ChatDraft, Message, Participant } from './chatTypes'
import { reorderMessages } from '../utils/messageOrder'
import { createMessage, messageKindPatch } from './messageFactory'
import { createOriginalPayment, duplicatePaymentPayload, reconcilePaymentReferences, respondToPayment, type PaymentResponseRequest } from '../utils/paymentMessage'
import { applyBatchMessageEdit, type BatchMessageEdit } from '../utils/batchMessageEdit'

type SettableField = keyof Pick<
  ChatDraft,
  | 'conversationType'
  | 'groupMemberCount'
  | 'showGroupNicknames'
  | 'title'
  | 'theme'
  | 'showStatusBar'
  | 'statusTime'
  | 'batteryPercent'
  | 'showSilentIcon'
  | 'followSystemTime'
  | 'batteryCharging'
  | 'showDoNotDisturb'
  | 'earpieceMode'
  | 'chatUnreadCount'
  | 'networkType'
  | 'signalStrength'
  | 'outputMode'
  | 'captureStartMessageId'
  | 'captureEndMessageId'
  | 'screenScrollTop'
  | 'outputWidth'
  | 'outputHeight'
  | 'exportScale'
  | 'showInputBar'
  | 'inputBarMode'
  | 'inputDraft'
  | 'showHomeIndicator'
  | 'timeDisplayMode'
  | 'wallpaper'
>

type SetFieldAction = {
  [K in SettableField]: { type: 'set-field'; field: K; value: ChatDraft[K] }
}[SettableField]

type SetFieldsAction = {
  type: 'set-fields'
  patch: Partial<Pick<ChatDraft, SettableField>>
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => sameValue(value, right[index]))
  }
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  const rightKeys = Object.keys(rightRecord)
  return leftKeys.length === rightKeys.length
    && leftKeys.every(key => Object.hasOwn(rightRecord, key) && sameValue(leftRecord[key], rightRecord[key]))
}

export type ChatAction =
  | SetFieldAction
  | SetFieldsAction
  | ({ type: 'respond-payment' } & PaymentResponseRequest)
  | { type: 'add-participant'; participant: Participant }
  | { type: 'update-participant'; participantId: string; patch: Partial<Omit<Participant, 'id'>>; separateHistory?: boolean }
  | { type: 'mark-self'; participantId: string }
  | { type: 'remove-participant'; participantId: string; replacementId?: string }
  | { type: 'add-message'; message: Message }
  | { type: 'add-messages'; messages: Message[] }
  | { type: 'batch-edit-messages'; edit: BatchMessageEdit }
  | { type: 'insert-message'; afterId: string | null; message: Message }
  | { type: 'delete-messages'; messageIds: string[] }
  | { type: 'clear-messages' }
  | { type: 'send-input-draft'; messageId: string; sentAt: string }
  | { type: 'update-message'; messageId: string; patch: Partial<Omit<Message, 'id'>>; separateHistory?: boolean }
  | { type: 'duplicate-message'; messageId: string; newId: string }
  | { type: 'delete-message'; messageId: string }
  | { type: 'reorder-messages'; activeId: string; overId: string }
  | { type: 'replace-draft'; draft: ChatDraft }

export function chatReducer(state: ChatDraft, action: ChatAction): ChatDraft {
  let next = reconcilePaymentReferences(reduceDraft(state, action))
  const participantIds = new Set(next.participants.map(participant => participant.id))
  if (next.messages.some(message => message.system && ((message.system.actorId !== null && !participantIds.has(message.system.actorId)) || (message.system.targetId !== null && !participantIds.has(message.system.targetId))))) {
    next = { ...next, messages: next.messages.map(message => message.system ? { ...message, system: {
      ...message.system,
      actorId: message.system.actorId !== null && !participantIds.has(message.system.actorId) ? null : message.system.actorId,
      targetId: message.system.targetId !== null && !participantIds.has(message.system.targetId) ? null : message.system.targetId,
    } } : message) }
  }
  const ids = new Set(next.messages.map(message => message.id))
  if (next.messages.some(message => message.quote?.sourceMessageId != null && !ids.has(message.quote.sourceMessageId))) {
    next = { ...next, messages: next.messages.map(message => message.quote?.sourceMessageId != null && !ids.has(message.quote.sourceMessageId) ? { ...message, quote: { ...message.quote, sourceMessageId: null } } : message) }
  }
  const start = next.captureStartMessageId !== null && !ids.has(next.captureStartMessageId) ? null : next.captureStartMessageId
  const end = next.captureEndMessageId !== null && !ids.has(next.captureEndMessageId) ? null : next.captureEndMessageId
  return start === next.captureStartMessageId && end === next.captureEndMessageId ? next : { ...next, captureStartMessageId: start, captureEndMessageId: end }
}

function initializePayment(state: ChatDraft, message: Message): Message {
  const payment = message.payment
  if (message.kind !== 'payment' || !payment || (payment.role ?? 'original') !== 'original'
    || payment.payerId != null || payment.receiverId != null || payment.payerName || payment.receiverName) return message
  return { ...message, payment: createOriginalPayment(payment, message.participantId, state.participants, state.conversationType) }
}

function reduceDraft(state: ChatDraft, action: ChatAction): ChatDraft {
  switch (action.type) {
    case 'respond-payment':
      return respondToPayment(state, action)
    case 'set-field':
      return sameValue(state[action.field], action.value) ? state : { ...state, [action.field]: action.value }
    case 'set-fields': {
      const entries = Object.entries(action.patch) as [SettableField, ChatDraft[SettableField]][]
      return entries.some(([field, value]) => !sameValue(state[field], value)) ? { ...state, ...action.patch } : state
    }
    case 'add-participant': {
      const participants = action.participant.isSelf
        ? state.participants.map((participant) => ({ ...participant, isSelf: false }))
        : state.participants
      return { ...state, participants: [...participants, action.participant] }
    }
    case 'update-participant': {
      const exists = state.participants.some((participant) => participant.id === action.participantId)
      if (!exists) return state
      const makeSelf = action.patch.isSelf === true
      return {
        ...state,
        participants: state.participants.map((participant) => {
          if (participant.id === action.participantId) return { ...participant, ...action.patch }
          return makeSelf ? { ...participant, isSelf: false } : participant
        }),
      }
    }
    case 'mark-self':
      if (!state.participants.some((participant) => participant.id === action.participantId)) return state
      return {
        ...state,
        participants: state.participants.map((participant) => ({
          ...participant,
          isSelf: participant.id === action.participantId,
        })),
      }
    case 'remove-participant': {
      const participant = state.participants.find((item) => item.id === action.participantId)
      if (!participant || participant.isSelf) return state
      const replacementExists = action.replacementId
        ? state.participants.some((item) => item.id === action.replacementId && item.id !== action.participantId)
        : false
      return {
        ...state,
        participants: state.participants.filter((item) => item.id !== action.participantId),
        messages: replacementExists
          ? state.messages.map((message) => message.participantId === action.participantId
            ? { ...message, participantId: action.replacementId! }
            : message)
          : state.messages.filter((message) => message.participantId !== action.participantId),
      }
    }
    case 'add-message':
      return { ...state, messages: [...state.messages, initializePayment(state, action.message)] }
    case 'add-messages':
      return action.messages.length ? { ...state, messages: [...state.messages, ...action.messages.map(message => initializePayment(state, message))] } : state
    case 'batch-edit-messages':
      return applyBatchMessageEdit(state, action.edit)
    case 'insert-message': {
      const index = action.afterId === null ? -1 : state.messages.findIndex(message => message.id === action.afterId)
      if (action.afterId !== null && index === -1) return state
      return { ...state, messages: [...state.messages.slice(0, index + 1), initializePayment(state, action.message), ...state.messages.slice(index + 1)] }
    }
    case 'delete-messages':
      if (!action.messageIds.length || !state.messages.some(message => action.messageIds.includes(message.id))) return state
      return { ...state, messages: state.messages.filter(message => !action.messageIds.includes(message.id)) }
    case 'clear-messages':
      return state.messages.length ? { ...state, messages: [] } : state
    case 'send-input-draft': {
      const self = state.participants.find(participant => participant.isSelf)
      if (!self || state.inputBarMode !== 'text' || !state.inputDraft.trim()) return state
      return {
        ...state,
        inputDraft: '',
        messages: [...state.messages, createMessage(self.id, {
          id: action.messageId,
          text: state.inputDraft,
          sentAt: action.sentAt,
        })],
      }
    }
    case 'update-message': {
      const index = state.messages.findIndex(message => message.id === action.messageId)
      if (index < 0) return state
      const message = state.messages[index]
      const changingKind = action.patch.kind && action.patch.kind !== message.kind
      let updated = { ...message, ...(changingKind ? messageKindPatch(action.patch.kind!) : {}), ...structuredClone(action.patch) }
      if (changingKind) updated = initializePayment(state, updated)
      if (sameValue(message, updated)) return state
      return { ...state, messages: [...state.messages.slice(0, index), updated, ...state.messages.slice(index + 1)] }
    }
    case 'duplicate-message': {
      const source = state.messages.find((message) => message.id === action.messageId)
      if (!source) return state
      const copy = { ...structuredClone(source), id: action.newId }
      if (copy.payment) copy.payment = duplicatePaymentPayload(copy.payment)
      return { ...state, messages: [...state.messages, copy] }
    }
    case 'delete-message':
      return state.messages.some(message => message.id === action.messageId)
        ? { ...state, messages: state.messages.filter((message) => message.id !== action.messageId) }
        : state
    case 'reorder-messages': {
      const messages = reorderMessages(state.messages, action.activeId, action.overId)
      return messages === state.messages ? state : { ...state, messages }
    }
    case 'replace-draft':
      return action.draft
  }
}
