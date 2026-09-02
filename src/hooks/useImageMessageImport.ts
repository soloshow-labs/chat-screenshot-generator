import { useCallback, useEffect, useRef, useState, type Dispatch } from 'react'
import type { ChatAction } from '../app/chatReducer'
import type { Message, Participant } from '../app/chatTypes'
import { createMessage } from '../app/messageFactory'
import { createLocalId } from '../utils/createLocalId'
import { processImageFile } from '../services/mediaProcessor'
import { releaseMediaAssets, saveMediaAsset } from '../services/mediaAssetStore'
import { useMediaImportTracker } from './useMediaImportActivity'

interface ImageMessageImportOptions {
  participants: Participant[]
  dispatch: Dispatch<ChatAction>
  onImported?: (messages: Message[]) => void
}

export function useImageMessageImport({ participants, dispatch, onImported }: ImageMessageImportOptions) {
  const latest = useRef({ participants, dispatch, onImported })
  const alive = useRef(true)
  const generation = useRef(0)
  const inFlight = useRef(false)
  const beginMediaImport = useMediaImportTracker('message-image-import')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => { latest.current = { participants, dispatch, onImported } }, [participants, dispatch, onImported])
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; generation.current += 1 }
  }, [])

  const importFiles = useCallback(async (files: readonly File[]) => {
    if (inFlight.current) return
    const imageFiles = files.filter(file => file.type.toLowerCase().startsWith('image/'))
    const ignoredCount = files.length - imageFiles.length
    if (!imageFiles.length) {
      setError('未找到可导入的图片文件')
      setNotice(ignoredCount ? `已忽略 ${ignoredCount} 个非图片文件` : null)
      return
    }
    const self = latest.current.participants.find(participant => participant.isSelf)
    if (!self) { setError('找不到当前“我”，无法添加图片消息'); return }

    const token = ++generation.current
    const finishMediaImport = beginMediaImport()
    inFlight.current = true
    setBusy(true)
    setError(null)
    setNotice(null)
    const savedIds: string[] = []
    try {
      const timestamp = new Date().toISOString()
      const messages: Message[] = []
      for (const file of imageFiles) {
        const metadata = await processImageFile(file)
        if (!alive.current || token !== generation.current) return
        const asset = await saveMediaAsset(file, metadata)
        savedIds.push(asset.id)
        if (!alive.current || token !== generation.current) return
        messages.push(createMessage(self.id, {
          id: createLocalId('message'),
          kind: 'image',
          sentAt: timestamp,
          media: { assetId: asset.id, fileName: file.name, ...metadata },
        }))
      }
      const currentSelf = latest.current.participants.find(participant => participant.isSelf)
      if (!alive.current || token !== generation.current || !currentSelf || currentSelf.id !== self.id) {
        if (!currentSelf) setError('当前“我”已不存在，未添加图片消息')
        return
      }
      latest.current.dispatch({ type: 'add-messages', messages })
      savedIds.length = 0
      latest.current.onImported?.(messages)
      setNotice(`已追加 ${messages.length} 张图片${ignoredCount ? `，已忽略 ${ignoredCount} 个非图片文件` : ''}`)
    } catch (cause) {
      if (alive.current && token === generation.current) setError(`${imageFiles[Math.min(savedIds.length, imageFiles.length - 1)].name}：${cause instanceof Error ? cause.message : '图片导入失败'}`)
    } finally {
      if (savedIds.length) releaseMediaAssets(savedIds)
      inFlight.current = false
      finishMediaImport()
      if (alive.current && token === generation.current) setBusy(false)
    }
  }, [beginMediaImport])

  return { importFiles, busy, error, notice }
}
