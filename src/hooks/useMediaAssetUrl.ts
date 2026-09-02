import { useEffect, useState } from 'react'

import { getMediaAsset } from '../services/mediaAssetStore'

interface MediaAssetUrlState {
  url: string | null
  loading: boolean
  error: string | null
}

interface LoadedMediaAssetUrlState extends MediaAssetUrlState {
  assetId: string | null
}

const EMPTY_STATE: MediaAssetUrlState = {
  url: null,
  loading: false,
  error: null,
}

export function useMediaAssetUrl(assetId: string | null): MediaAssetUrlState {
  const [state, setState] = useState<LoadedMediaAssetUrlState>({
    assetId: null,
    ...EMPTY_STATE,
  })

  useEffect(() => {
    if (!assetId) return undefined

    let disposed = false
    let objectUrl: string | null = null
    void getMediaAsset(assetId)
      .then((asset) => {
        if (disposed) return
        if (!asset) {
          setState({ assetId, url: null, loading: false, error: '找不到媒体素材' })
          return
        }

        objectUrl = URL.createObjectURL(asset.blob)
        setState({ assetId, url: objectUrl, loading: false, error: null })
      })
      .catch((error: unknown) => {
        if (disposed) return
        setState({
          assetId,
          url: null,
          loading: false,
          error: error instanceof Error ? error.message : '无法加载媒体素材',
        })
      })

    return () => {
      disposed = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [assetId])

  if (!assetId) return EMPTY_STATE
  if (state.assetId !== assetId) return { url: null, loading: true, error: null }
  return state
}
