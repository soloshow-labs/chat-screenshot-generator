import type { Message, MessageKind } from './chatTypes'

export type MessageEditorFamily = 'text' | 'image' | 'voice' | 'call' | 'recall' | 'system' | 'rich'
export type MessageRendererFamily = 'bubble' | 'image' | 'voice' | 'call' | 'recall' | 'system' | 'rich'

interface MessageKindDefinition {
  label: string
  editor: MessageEditorFamily
  renderer: MessageRendererFamily
  direction: boolean
  delivery: boolean
}

export const MESSAGE_KIND_REGISTRY = {
  text: { label: '文字', editor: 'text', renderer: 'bubble', direction: true, delivery: true },
  image: { label: '图片', editor: 'image', renderer: 'image', direction: true, delivery: true },
  voice: { label: '语音', editor: 'voice', renderer: 'voice', direction: true, delivery: true },
  call: { label: '通话记录', editor: 'call', renderer: 'call', direction: true, delivery: true },
  recall: { label: '撤回', editor: 'recall', renderer: 'recall', direction: false, delivery: false },
  system: { label: '系统消息', editor: 'system', renderer: 'system', direction: false, delivery: false },
  link: { label: '链接', editor: 'rich', renderer: 'rich', direction: true, delivery: true },
  video: { label: '视频', editor: 'rich', renderer: 'rich', direction: true, delivery: true },
  file: { label: '文件', editor: 'rich', renderer: 'rich', direction: true, delivery: true },
  payment: { label: '转账 / 红包', editor: 'rich', renderer: 'rich', direction: true, delivery: true },
  contact: { label: '名片', editor: 'rich', renderer: 'rich', direction: true, delivery: true },
  location: { label: '位置', editor: 'rich', renderer: 'rich', direction: true, delivery: true },
} as const satisfies Record<MessageKind, MessageKindDefinition>

export const MESSAGE_KIND_OPTIONS = (Object.entries(MESSAGE_KIND_REGISTRY) as [MessageKind, MessageKindDefinition][])
  .map(([value, definition]) => ({ value, label: definition.label }))

export function isRichMessageKind(kind: MessageKind): boolean {
  return MESSAGE_KIND_REGISTRY[kind].renderer === 'rich'
}

export function isCenteredMessage(message: Message): boolean {
  return !MESSAGE_KIND_REGISTRY[message.kind].direction
    || (message.kind === 'payment' && message.payment?.role === 'notice')
}

export function supportsDeliveryStatus(message: Message): boolean {
  return MESSAGE_KIND_REGISTRY[message.kind].delivery && !isCenteredMessage(message)
}
