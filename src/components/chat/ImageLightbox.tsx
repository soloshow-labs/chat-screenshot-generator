import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import styles from './ChatCanvas.module.css'

interface ImageLightboxProps {
  url: string
  alt: string
  onClose: () => void
}

export function ImageLightbox({ url, alt, onClose }: ImageLightboxProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  return createPortal(
    <div className={styles.lightbox} role="dialog" aria-label="原图预览" aria-modal="true">
      <button className={styles.lightboxBackdrop} type="button" aria-label="点击遮罩关闭原图" onClick={onClose} />
      <img className={styles.lightboxImage} src={url} alt={alt} />
      <button className={styles.lightboxClose} type="button" aria-label="关闭原图" onClick={onClose}>×</button>
    </div>, document.body,
  )
}
