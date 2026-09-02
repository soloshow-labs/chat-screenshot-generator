import { useEffect, useRef, useState, type ChangeEvent, type Dispatch } from 'react'
import type { ChatAction } from '../../app/chatReducer'
import type { ChatWallpaper } from '../../app/chatTypes'
import { useMediaImportTracker } from '../../hooks/useMediaImportActivity'
import { processImageFile } from '../../services/mediaProcessor'
import { releaseMediaAssets, saveMediaAsset } from '../../services/mediaAssetStore'
import { LazyAvatarCropDialog } from '../shared/LazyAvatarCropDialog'
import styles from './WallpaperFields.module.css'

const wallpaperCropOptions = { aspectRatio: 430 / 744, maxWidth: 1290, maxHeight: 2232 }
const wallpaperCropLabels = { title: '聊天背景取景', viewport: '聊天背景取景区', zoom: '缩放聊天背景', confirm: '确认背景' }
const hexColor = /^#[0-9a-fA-F]{6}$/

export function WallpaperFields({ wallpaper, dispatch }: { wallpaper: ChatWallpaper | undefined; dispatch: Dispatch<ChatAction> }) {
  const current = wallpaper ?? null
  const sourceColor = current?.type === 'color' ? current.color : '#ededed'
  const [colorState, setColorState] = useState({ source: sourceColor, value: sourceColor })
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const beginMediaImport = useMediaImportTracker('wallpaper')
  if (colorState.source !== sourceColor) setColorState({ source: sourceColor, value: sourceColor })
  useEffect(() => () => { ++generation.current }, [])

  function selectColor() {
    const color = hexColor.test(colorState.value) ? colorState.value : '#ededed'
    dispatch({ type: 'set-field', field: 'wallpaper', value: { type: 'color', color } })
  }
  function changeColor(value: string) {
    setColorState(state => ({ ...state, value }))
    if (hexColor.test(value)) dispatch({ type: 'set-field', field: 'wallpaper', value: { type: 'color', color: value } })
  }
  function beginCrop(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(null)
    setCropFile(file)
  }
  async function saveCrop(dataUrl: string) {
    const token = ++generation.current
    const finish = beginMediaImport()
    setError(null)
    try {
      const response = await fetch(dataUrl)
      const blob = await response.blob()
      const file = new File([blob], 'chat-wallpaper.webp', { type: blob.type || 'image/webp' })
      const metadata = await processImageFile(file)
      if (token !== generation.current) return
      const asset = await saveMediaAsset(file, metadata)
      if (token !== generation.current) { releaseMediaAssets([asset.id]); return }
      dispatch({ type: 'set-field', field: 'wallpaper', value: { type: 'image', media: { assetId: asset.id, fileName: asset.fileName, ...metadata } } })
      setCropFile(null)
    } catch (cause) {
      if (token === generation.current) {
        setCropFile(null)
        setError(cause instanceof Error ? cause.message : '背景图片保存失败')
      }
    } finally {
      finish()
    }
  }

  return <div className={styles.fields}>
    {cropFile ? <LazyAvatarCropDialog file={cropFile} compact options={wallpaperCropOptions} labels={wallpaperCropLabels} onCancel={() => { ++generation.current; setCropFile(null) }} onConfirm={dataUrl => { void saveCrop(dataUrl) }} /> : null}
    <span className={styles.label}>聊天背景</span>
    <div className={styles.modes}>
      <button type="button" aria-pressed={current === null} onClick={() => dispatch({ type: 'set-field', field: 'wallpaper', value: null })}>默认背景</button>
      <button type="button" aria-pressed={current?.type === 'color'} onClick={selectColor}>纯色背景</button>
      <label className={styles.upload}><span>{current?.type === 'image' ? '替换图片背景' : '图片背景'}</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-label="上传聊天背景图片" onChange={beginCrop} /></label>
    </div>
    {current?.type === 'color' ? <div className={styles.colorRow}>
      <input type="color" value={hexColor.test(colorState.value) ? colorState.value : '#ededed'} aria-label="选择聊天背景颜色" onChange={event => changeColor(event.target.value)} />
      <input value={colorState.value} aria-label="聊天背景颜色" onChange={event => changeColor(event.target.value)} />
    </div> : null}
    {current?.type === 'image' ? <p className={styles.fileName}>{current.media.fileName}</p> : null}
    {current !== null ? <button type="button" className={styles.restore} onClick={() => dispatch({ type: 'set-field', field: 'wallpaper', value: null })}>恢复默认背景</button> : null}
    <p className={styles.hint}>图片仅覆盖消息正文，按固定比例纵向重复；确认后仅保存取景结果。</p>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
  </div>
}
