import { lazy, Suspense, useEffect } from 'react'
import { useMediaImportTracker } from '../../hooks/useMediaImportActivity'
import type { AvatarCropDialogProps } from './AvatarCropDialog'
import styles from './AvatarCropDialog.module.css'

const AvatarCropDialog = lazy(() => import('./AvatarCropDialog').then(module => ({ default: module.AvatarCropDialog })))

export function LazyAvatarCropDialog(props: AvatarCropDialogProps) {
  const beginMediaImport = useMediaImportTracker()
  useEffect(() => beginMediaImport(), [beginMediaImport])

  return (
    <Suspense fallback={<div className={styles.backdrop}><div className={styles.loading} role="status" aria-label="正在加载图片取景工具">正在加载图片取景工具…</div></div>}>
      <AvatarCropDialog {...props} />
    </Suspense>
  )
}
