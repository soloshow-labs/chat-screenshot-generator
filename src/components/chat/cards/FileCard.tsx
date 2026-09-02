import type { MediaAttachment } from '../../../app/chatTypes'
import styles from '../RichMessage.module.css'

function formatBytes(value: number | undefined): string {
  const bytes = value !== undefined && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FileCard({ media, url, error, side }: { media: MediaAttachment | null; url: string | null; error: string | null; side: 'left' | 'right' }) {
  const extension = media?.fileName.match(/\.([a-z0-9]{1,8})$/i)?.[1].toUpperCase() ?? 'FILE'
  const contents = <>
    <div className={styles.fileBody}>
      <div className={styles.fileText}><strong className={styles.fileName}>{media?.fileName || '请上传文件'}</strong><span className={styles.fileSize}>{formatBytes(media?.sizeBytes)}</span></div>
      <span className={styles.fileIcon} role="img" aria-label={`${extension} 文件`}>{extension}</span>
    </div>
    {media?.expired ? <footer className={styles.fileFooter}>文件已过期</footer> : !url ? <footer className={styles.fileFooter}>{error || '文件'}</footer> : null}
  </>
  const tail = <span data-card-tail aria-hidden="true" className={styles.cardTail} />
  return url && !media?.expired
    ? <a data-card-kind="file" data-side={side} className={styles.fileCard} aria-label="下载文件" href={url} download={media?.fileName}>{tail}{contents}</a>
    : <div data-card-kind="file" data-side={side} className={styles.fileCard}>{tail}{contents}</div>
}
