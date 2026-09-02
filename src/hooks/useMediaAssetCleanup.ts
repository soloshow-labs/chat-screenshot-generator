import { useEffect, useRef } from 'react'

import type { ChatDraft } from '../app/chatTypes'
import type { SaveState } from '../app/useChatDraft'
import { cleanupUnreferencedMediaAssets } from '../services/mediaAssetStore'
import { getStoredDrafts } from '../services/localProjectStore'
import { getDraftMedia } from '../utils/draftMedia'

export function useMediaAssetCleanup(draft: ChatDraft, saveState: SaveState, historyDrafts: ChatDraft[] = [], recoveryAllowed = true): void {
  const lastLocalReferenceSignature = useRef<string | null>(null)
  useEffect(() => {
    if (saveState !== 'saved' || !recoveryAllowed) return undefined

    const localReferenceSignature = [...new Set(
      [draft, ...historyDrafts].flatMap(getDraftMedia).map(media => media.assetId).filter(Boolean),
    )].sort().join('\n')
    if (localReferenceSignature === lastLocalReferenceSignature.current) return undefined

    let current = true
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const storedDrafts = await getStoredDrafts()
          if (!current) return
          const referencedAssetIds = new Set(
            [draft, ...historyDrafts, ...storedDrafts].flatMap(getDraftMedia).map(media => media.assetId).filter(Boolean),
          )
          await cleanupUnreferencedMediaAssets(referencedAssetIds)
          if (current) lastLocalReferenceSignature.current = localReferenceSignature
        } catch {
          // A partial project index is unsafe: retain media and retry after the
          // next successful save instead of deleting an attachment still in use.
        }
      })()
    }, 100)

    return () => { current = false; window.clearTimeout(timer) }
  }, [draft, historyDrafts, saveState, recoveryAllowed])
}
