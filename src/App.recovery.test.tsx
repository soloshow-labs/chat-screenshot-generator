import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { SAMPLE_DRAFT } from './app/sampleDraft'
import { createMessage } from './app/messageFactory'
import { DRAFT_STORAGE_KEY } from './services/draftStore'
import * as mediaStore from './services/mediaAssetStore'
import * as projectFile from './services/projectFile'
import type { ChatDraft } from './app/chatTypes'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

it.each(['{broken', '{"schemaVersion":99}', 'denied'])('shows explicit recovery controls and protects persisted draft/media for %s', async raw => {
  const old = await mediaStore.saveMediaAsset(new File(['old'], 'old.png', { type: 'image/png' }))
  await mediaStore.cleanupUnreferencedMediaAssets(new Set([old.id]))
  localStorage.setItem(DRAFT_STORAGE_KEY, raw)
  const originalGet = Storage.prototype.getItem
  const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key) {
    if (raw === 'denied' && key === DRAFT_STORAGE_KEY) throw new Error('读取被拒绝')
    return originalGet.call(this, key)
  })
  const save = vi.spyOn(Storage.prototype, 'setItem'), cleanup = vi.spyOn(mediaStore, 'cleanupUnreferencedMediaAssets')
  render(<App />)
  expect(screen.getByRole('heading', { name: '本地草稿恢复失败' })).toBeInTheDocument()
  expect(screen.getByLabelText('从项目 JSON 恢复')).toBeEnabled()
  expect(screen.queryByRole('button', { name: '导出 PNG' })).not.toBeInTheDocument()
  await new Promise(resolve => setTimeout(resolve, 450))
  expect(save).not.toHaveBeenCalled()
  expect(cleanup).not.toHaveBeenCalled()
  expect(await mediaStore.getMediaAsset(old.id)).not.toBeNull()
  get.mockRestore()
  expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(raw)
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...SAMPLE_DRAFT, title: '重试后的聊天' }))
  await userEvent.setup().click(screen.getByRole('button', { name: '重试读取本地草稿' }))
  expect(screen.queryByRole('heading', { name: '本地草稿恢复失败' })).not.toBeInTheDocument()
})

async function recoveryFixture() {
  const old = await mediaStore.saveMediaAsset(new File(['old'], 'old.png', { type: 'image/png' }))
  const source = await mediaStore.saveMediaAsset(new File(['new'], 'quote.png', { type: 'image/png' }))
  const candidate = { ...SAMPLE_DRAFT, title: '恢复的项目', messages: [createMessage('self', { text: '仅引用图片', quote: { sourceMessageId: null, senderName: '旧成员', kind: 'image', text: '', media: { assetId: source.id, fileName: 'quote.png', mimeType: 'image/png', width: 20, height: 30 } } })] }
  const json = await projectFile.serializeProject(candidate)
  await mediaStore.cleanupUnreferencedMediaAssets(new Set([old.id, source.id]))
  localStorage.setItem(DRAFT_STORAGE_KEY, '{broken')
  let imported: ChatDraft | undefined
  const originalImport = projectFile.importProject
  vi.spyOn(projectFile, 'importProject').mockImplementation(async text => { imported = await originalImport(text); return imported })
  const rendered = render(<App />), user = userEvent.setup()
  await user.upload(screen.getByLabelText('从项目 JSON 恢复'), new File([json], 'restore.json', { type: 'application/json' }))
  await screen.findByRole('button', { name: '确认替换并恢复' })
  return { old, imported: imported!, user, ...rendered }
}

it.each(['cancel', 'unmount'])('releases every quote-only recovery pin on %s without overwriting old data', async action => {
  const { old, imported, user, unmount } = await recoveryFixture()
  const id = imported.messages[0].quote!.media!.assetId
  await mediaStore.cleanupUnreferencedMediaAssets(new Set([old.id]))
  expect(await mediaStore.getMediaAsset(id)).not.toBeNull()
  expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe('{broken')
  if (action === 'cancel') await user.click(screen.getByRole('button', { name: '取消恢复' }))
  else unmount()
  await mediaStore.cleanupUnreferencedMediaAssets(new Set([old.id]))
  expect(await mediaStore.getMediaAsset(id)).toBeNull()
  expect(await mediaStore.getMediaAsset(old.id)).not.toBeNull()
  expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe('{broken')
})

it('preserves old storage and pending quote pins on failed confirmation, then commits only after successful retry', async () => {
  const { old, imported, user } = await recoveryFixture()
  const id = imported.messages[0].quote!.media!.assetId
  const save = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('空间不足') })
  await user.click(screen.getByRole('button', { name: '确认替换并恢复' }))
  expect(screen.getByText('空间不足')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '本地草稿恢复失败' })).toBeInTheDocument()
  expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe('{broken')
  await mediaStore.cleanupUnreferencedMediaAssets(new Set([old.id]))
  expect(await mediaStore.getMediaAsset(id)).not.toBeNull()
  save.mockRestore()
  await user.click(screen.getByRole('button', { name: '确认替换并恢复' }))
  await waitFor(() => expect(screen.queryByRole('heading', { name: '本地草稿恢复失败' })).not.toBeInTheDocument())
  expect(JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!).title).toBe('恢复的项目')
  expect(await mediaStore.getMediaAsset(id)).not.toBeNull()
})
