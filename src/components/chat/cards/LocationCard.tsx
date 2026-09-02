import { useState } from 'react'
import type { LocationPayload, ThemeMode } from '../../../app/chatTypes'
import { LocalMap } from './LocalMap'
import styles from '../RichMessage.module.css'
import mapStyles from './LocationCard.module.css'

export function LocationCard({ location, side, theme }: { location: LocationPayload | null | undefined; side: 'left' | 'right'; theme: ThemeMode }) {
  const mapDataUrl = location?.mapDataUrl
  const [failedMapUrl, setFailedMapUrl] = useState<string | null>(null)
  const mapFailed = failedMapUrl === mapDataUrl
  const hasMap = typeof mapDataUrl === 'string' && /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(mapDataUrl)
  return <div className={styles.locationCard} data-card-kind="location" data-side={side} data-map-image-error={hasMap && mapFailed ? 'true' : undefined}>
    <span data-card-tail aria-hidden="true" className={styles.cardTail} />
    <div className={styles.locationHeading}>
      <strong>{location?.name || '位置'}</strong>
      <p>{location?.address}</p>
    </div>
    {hasMap ? <><img className={mapStyles.mapImage} src={mapDataUrl} alt="地图截图" data-export-image onError={() => setFailedMapUrl(mapDataUrl)} />{mapFailed ? <p className={mapStyles.previewError} data-preview-only role="alert">地图截图无法读取，请重新上传。</p> : null}</> : <LocalMap theme={theme} />}
  </div>
}
