import { describe, expect, it } from 'vitest'
import { SAMPLE_DRAFT } from '../app/sampleDraft'
import { getDraftMedia } from './draftMedia'

describe('getDraftMedia', () => {
  it('includes an image wallpaper alongside message attachments', () => {
    const wallpaper = { assetId: 'wallpaper-id', fileName: 'wallpaper.webp', mimeType: 'image/webp', width: 430, height: 744 }
    const draft = {
      ...SAMPLE_DRAFT,
      messages: [{ ...SAMPLE_DRAFT.messages[0], media: { assetId: 'message-id', fileName: 'message.png', mimeType: 'image/png', width: 1, height: 1 } }],
      wallpaper: { type: 'image' as const, media: wallpaper },
    }

    expect(getDraftMedia(draft).map(media => media.assetId)).toEqual(['message-id', 'wallpaper-id'])
  })
})
