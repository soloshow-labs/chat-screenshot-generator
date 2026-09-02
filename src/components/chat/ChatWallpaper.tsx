import type { ReactNode } from 'react'
import type { ChatWallpaper as Wallpaper } from '../../app/chatTypes'
import { useMediaAssetUrl } from '../../hooks/useMediaAssetUrl'
import styles from './ChatCanvas.module.css'

export interface ChatWallpaperState { url: string | null; loading: boolean; error: string | null }

/** Keeps the CSS background URL and an image decode probe in the same lifecycle. */
export function ChatWallpaper({ wallpaper, children }: { wallpaper: Wallpaper | undefined; children?: (state: ChatWallpaperState) => ReactNode }) {
  const image = wallpaper?.type === 'image' ? wallpaper.media : null
  const state = useMediaAssetUrl(image?.assetId ?? null)
  return <>
    {children?.(state)}
    {state.url ? <img className={styles.wallpaperProbe} data-wallpaper-probe data-testid="wallpaper-probe" src={state.url} alt="" aria-hidden="true" /> : null}
    {image && state.loading ? <span data-wallpaper-loading hidden /> : null}
    {image && state.error ? <span data-wallpaper-error hidden /> : null}
  </>
}
