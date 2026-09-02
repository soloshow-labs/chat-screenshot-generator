import type { ChatDraft } from '../../app/chatTypes'

export const IPHONE_15_PRO_MAX_PRESET = { id: 'iphone-15-pro-max', width: 430, height: 932, scale: 3 as const }

export function matchesIphone15ProMax(draft: ChatDraft): boolean {
  return draft.outputWidth === IPHONE_15_PRO_MAX_PRESET.width
    && draft.outputHeight === IPHONE_15_PRO_MAX_PRESET.height
    && draft.exportScale === IPHONE_15_PRO_MAX_PRESET.scale
}
