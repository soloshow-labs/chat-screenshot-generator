import type { MediaAttachment } from '../../../app/chatTypes'
import styles from '../RichMessage.module.css'

export function VideoCard({ media, poster, playable, exportMode, error, onPlay }: { media: MediaAttachment | null; poster: string | undefined; playable: boolean; exportMode: boolean; error: string | null; onPlay: () => void }) {
  const width = media?.width
  const height = media?.height
  const source = typeof width === 'number' && Number.isFinite(width) && width > 0 && typeof height === 'number' && Number.isFinite(height) && height > 0 ? { width, height } : { width: 4, height: 3 }
  const { width: sourceWidth, height: sourceHeight } = source
  const displayWidth = Math.min(220, 300 * sourceWidth / sourceHeight)
  const duration = Number.isFinite(media?.durationSeconds) ? Math.max(0, Math.ceil(media!.durationSeconds!)) : 0
  return <>
    <button className={styles.video} style={{ width: displayWidth, aspectRatio: `${sourceWidth} / ${sourceHeight}` }} type="button" aria-label="播放视频" disabled={!playable || exportMode} onClick={onPlay}>
      {poster ? <img src={poster} alt="视频封面" /> : null}
      <svg className={styles.videoPlay} viewBox="0 0 44 44" width="44" height="44" aria-hidden="true"><circle cx="22" cy="22" r="20" fill="#0003" stroke="currentColor" strokeWidth="1.5" /><path d="m18 13 13 9-13 9Z" fill="currentColor" /></svg>
      <small className={styles.videoDuration}>{Math.floor(duration / 60)}:{String(duration % 60).padStart(2, '0')}</small>
    </button>
    {!exportMode && (!media || error) ? <p className={styles.mediaError}>{!media ? '请上传视频' : error}</p> : null}
  </>
}
