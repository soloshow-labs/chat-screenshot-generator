import type { ChatDraft, MediaAttachment } from '../app/chatTypes'
import { getMessageAttachments } from './messageAttachments'

/** Every IndexedDB-backed asset retained by a draft, including wallpaper. */
export function getDraftMedia(draft: ChatDraft): MediaAttachment[] {
  const messageMedia = draft.messages.flatMap(getMessageAttachments)
  return draft.wallpaper?.type === 'image'
    ? [...messageMedia, draft.wallpaper.media]
    : messageMedia
}
