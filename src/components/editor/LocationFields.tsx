import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type Dispatch } from 'react'
import type { Message } from '../../app/chatTypes'
import type { ChatAction } from '../../app/chatReducer'
import { LazyAvatarCropDialog } from '../shared/LazyAvatarCropDialog'
import styles from './LocationFields.module.css'

interface PendingCrop { file: File; token: number; messageId: string }
const mapOptions = { aspectRatio: 15 / 7, maxWidth: 960, maxHeight: 448 }
const mapLabels = { title: '地图截图取景', viewport: '地图截图取景区', zoom: '缩放地图截图', confirm: '确认地图截图' }

export function LocationFields({ message, number, dispatch }: { message: Message; number: number; dispatch: Dispatch<ChatAction> }) {
  const [crop, setCrop] = useState<PendingCrop | null>(null)
  const generation = useRef(0)
  const latestMessage = useRef(message)
  useLayoutEffect(() => { latestMessage.current = message }, [message])
  useEffect(() => () => { ++generation.current }, [message.id, message.kind])
  const cropActive = Boolean(crop && message.kind === 'location' && crop.messageId === message.id)
  if (message.kind !== 'location' || !message.location) return null
  const label = (text: string) => `消息 ${number} ${text}`
  const update = (patch: Partial<Message>, separateHistory = false) => dispatch({ type: 'update-message', messageId: message.id, patch, ...(separateHistory ? { separateHistory: true } : {}) })
  const location = message.location
  function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    event.currentTarget.focus()
    setCrop({ file, token: ++generation.current, messageId: message.id })
  }
  return <div className={styles.fields}>
    {cropActive && crop ? <LazyAvatarCropDialog key={crop.token} file={crop.file} options={mapOptions} labels={mapLabels} onCancel={() => { ++generation.current; setCrop(null) }} onConfirm={mapDataUrl => {
      const current = latestMessage.current
      if (generation.current !== crop.token || current.id !== crop.messageId || current.kind !== 'location' || !current.location) return
      dispatch({ type: 'update-message', messageId: current.id, patch: { location: { ...current.location, mapDataUrl } }, separateHistory: true })
      ++generation.current
      setCrop(null)
    }} /> : null}
    <label><span>地点名称</span><input aria-label={label('地点名称')} value={location.name} onChange={event => update({ location: { ...location, name: event.target.value } })} /></label>
    <label><span>地点地址</span><input aria-label={label('地点地址')} value={location.address} onChange={event => update({ location: { ...location, address: event.target.value } })} /></label>
    <label className={styles.uploadButton}><span>上传地图截图</span><input type="file" aria-label={label('上传地图截图')} accept="image/jpeg,image/png,image/webp,image/gif" onChange={upload} /></label>
    {location.mapDataUrl ? <button type="button" className={styles.removeButton} onClick={() => update({ location: { ...location, mapDataUrl: null } }, true)}>移除地图截图</button> : null}
    <p className={styles.hint}>留空时使用本地示意图；不会自动生成真实地图。</p>
  </div>
}
