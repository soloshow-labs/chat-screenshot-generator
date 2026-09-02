import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type ChangeEvent } from 'react'
import type { Message } from '../../app/chatTypes'
import type { ChatAction } from '../../app/chatReducer'
import { processAvatar } from '../../services/avatarProcessor'
import { processFile, processVideoFile } from '../../services/mediaProcessor'
import { releaseMediaAssets, saveMediaAsset } from '../../services/mediaAssetStore'
import { useMediaImportTracker } from '../../hooks/useMediaImportActivity'
import { LazyAvatarCropDialog } from '../shared/LazyAvatarCropDialog'
import { LocationFields } from './LocationFields'
import { PaymentFields } from './PaymentFields'
import type { PaymentContext } from '../../utils/paymentMessage'
import styles from './RichMessageFields.module.css'

export function RichMessageFields({ message, number, dispatch, paymentContext }: { message: Message; number: number; dispatch: Dispatch<ChatAction>; paymentContext?: PaymentContext }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [crop, setCrop] = useState<{ file: File; token: number; messageId: string } | null>(null)
  if (crop && (crop.messageId !== message.id || message.kind !== 'contact')) setCrop(null)
  const generation = useRef(0)
  const latestMessage = useRef(message)
  useLayoutEffect(() => { latestMessage.current = message }, [message])
  useEffect(() => () => { ++generation.current }, [message.id, message.kind])
  const beginMediaImport = useMediaImportTracker(`${message.id}:${message.kind}`)
  const update = (patch: Partial<Message>) => dispatch({ type: 'update-message', messageId: message.id, patch })
  const label = (text: string) => `消息 ${number} ${text}`
  const input = (text: string, value: string | number, change: (value: string) => void, type = 'text') => <label><span>{text}</span><input aria-label={label(text)} type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 'any' : undefined} value={value} onChange={event => change(event.target.value)} /></label>
  async function upload(event: ChangeEvent<HTMLInputElement>, target: 'attachment' | 'thumbnail' | 'avatar' | 'cover') {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (target === 'avatar') {
      event.currentTarget.focus()
      setError(null)
      setCrop({ file, token: ++generation.current, messageId: message.id })
      return
    }
    const finishMediaImport = beginMediaImport()
    const token = ++generation.current
    setBusy(true); setError(null)
    try {
      if (target === 'attachment') {
        const metadata = await (message.kind === 'video' ? processVideoFile(file) : processFile(file))
        if (token !== generation.current) return
        const asset = await saveMediaAsset(file, metadata)
        if (token !== generation.current) { releaseMediaAssets([asset.id]); return }
        update({ media: { assetId: asset.id, fileName: file.name, ...metadata } })
      } else {
        const data = await processAvatar(file)
        if (token !== generation.current) return
        const current = latestMessage.current
        if (target === 'thumbnail' && current.link) update({ link: { ...current.link, thumbnailDataUrl: data } })
        if (target === 'cover' && current.media && current.media.assetId === message.media?.assetId) update({ media: { ...current.media, posterDataUrl: data } })
      }
    } catch (cause) { if (token === generation.current) setError(cause instanceof Error ? cause.message : '上传失败') }
    finally { if (token === generation.current) setBusy(false); finishMediaImport() }
  }
  const uploadInput = (text: string, target: 'attachment' | 'thumbnail' | 'avatar' | 'cover', accept?: string) => <label className={styles.uploadButton}><span>{text}</span><input type="file" aria-label={label(text)} accept={accept} onChange={event => void upload(event, target)} /></label>
  const imageAccept = 'image/jpeg,image/png,image/webp,image/gif'
  if (message.kind === 'location') return <LocationFields message={message} number={number} dispatch={dispatch} />
  if (message.kind === 'payment') return <PaymentFields draft={paymentContext ?? { participants: [], messages: [message], conversationType: 'group' }} message={message} number={number} dispatch={dispatch} />
  return <div className={styles.fields}>
    {crop && crop.messageId === message.id && message.kind === 'contact' ? <LazyAvatarCropDialog key={crop.token} file={crop.file} onCancel={() => { ++generation.current; setCrop(null) }} onConfirm={avatarDataUrl => {
      const current = latestMessage.current
      if (generation.current !== crop.token || current.id !== crop.messageId || current.kind !== 'contact' || !current.contactCard) return
      dispatch({ type: 'update-message', messageId: current.id, patch: { contactCard: { ...current.contactCard, avatarDataUrl } }, separateHistory: true })
      ++generation.current
      setCrop(null)
    }} /> : null}
    {message.kind === 'link' && message.link ? <>
      {input('链接标题', message.link.title, title => update({ link: { ...message.link!, title } }))}
      {input('链接描述', message.link.description, description => update({ link: { ...message.link!, description } }))}
      {input('链接地址', message.link.url, url => update({ link: { ...message.link!, url } }))}
      {uploadInput('上传缩略图', 'thumbnail', imageAccept)}
    </> : null}
    {message.kind === 'contact' && message.contactCard ? <>
      {input('名片姓名', message.contactCard.name, name => update({ contactCard: { ...message.contactCard!, name } }))}
      {input('名片描述', message.contactCard.description, description => update({ contactCard: { ...message.contactCard!, description } }))}
      {uploadInput('上传名片头像', 'avatar', imageAccept)}
    </> : null}
    {message.kind === 'file' || message.kind === 'video' ? <>
      {uploadInput(message.kind === 'file' ? '上传文件' : '上传视频', 'attachment', message.kind === 'video' ? 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov' : undefined)}
      {message.media ? <>
        {input('文件名称', message.media.fileName, fileName => update({ media: { ...message.media!, fileName } }))}
        {input('文件大小（字节）', message.media.sizeBytes ?? 0, size => update({ media: { ...message.media!, sizeBytes: Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(Number(size) || 0))) } }), 'number')}
        {message.kind === 'file' ? <label className={styles.checkboxLabel}><input aria-label={label('文件已过期')} type="checkbox" checked={message.media.expired ?? false} onChange={event => update({ media: { ...message.media!, expired: event.target.checked } })} />文件已过期</label> : <>
          {input('视频时长（秒）', message.media.durationSeconds ?? '', duration => {
            const seconds = Number(duration)
            if (!Number.isFinite(seconds) || seconds <= 0) { setError('视频时长必须大于 0 秒'); return }
            setError(null)
            update({ media: { ...message.media!, durationSeconds: seconds } })
          }, 'number')}
          {uploadInput('上传视频封面', 'cover', imageAccept)}
        </>}
        <button type="button" className={styles.removeButton} onClick={() => { ++generation.current; setBusy(false); update({ media: null }) }}>移除附件</button>
      </> : null}
    </> : null}
    {busy ? <span role="status">处理中…</span> : null}{error ? <span role="alert">{error}</span> : null}
  </div>
}
