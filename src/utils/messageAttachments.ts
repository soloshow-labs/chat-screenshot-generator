import type { MediaAttachment, Message } from '../app/chatTypes'
import { getMessageDomainAttachments } from '../app/messageDomain'

export function getMessageAttachments(message: Message): MediaAttachment[] {
  return getMessageDomainAttachments(message)
}
