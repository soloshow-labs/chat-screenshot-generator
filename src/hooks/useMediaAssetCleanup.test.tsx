import 'fake-indexeddb/auto'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createMessage } from '../app/messageFactory'
import { SAMPLE_DRAFT } from '../app/sampleDraft'
import { useMediaAssetCleanup } from './useMediaAssetCleanup'
import * as store from '../services/mediaAssetStore'
import * as projects from '../services/localProjectStore'

afterEach(() => vi.restoreAllMocks())
it('retains quote-only images across current and history ownership, releasing after last saved owner disappears', async () => {
  const asset = await store.saveMediaAsset(new File(['image'], 'old.png', { type: 'image/png' }))
  await store.cleanupUnreferencedMediaAssets(new Set([asset.id]))
  const message = createMessage('self', { quote: { sourceMessageId: null, senderName: '小明', kind: 'image', text: '', media: { assetId: asset.id, fileName: 'old.png', mimeType: 'image/png', width: 20, height: 30 } } })
  const cleanup = vi.spyOn(store, 'cleanupUnreferencedMediaAssets')
  const { rerender } = renderHook(({ current, history }) => useMediaAssetCleanup(current, 'saved', history), { initialProps: { current: { ...SAMPLE_DRAFT, messages: [message] }, history: [] as typeof SAMPLE_DRAFT[] } })
  await waitFor(() => expect(cleanup).toHaveBeenCalledTimes(1)); await cleanup.mock.results[0].value
  expect(await store.getMediaAsset(asset.id)).not.toBeNull()
  rerender({ current: { ...SAMPLE_DRAFT, messages: [] }, history: [{ ...SAMPLE_DRAFT, messages: [message] }] })
  await new Promise(resolve => setTimeout(resolve, 150))
  expect(cleanup).toHaveBeenCalledTimes(1)
  expect(await store.getMediaAsset(asset.id)).not.toBeNull()
  rerender({ current: { ...SAMPLE_DRAFT, messages: [] }, history: [] })
  await waitFor(() => expect(cleanup).toHaveBeenCalledTimes(2)); await cleanup.mock.results[1].value
  expect(await store.getMediaAsset(asset.id)).toBeNull()
})

it('never cleans assets while draft recovery is blocked even if its save flag is saved', async () => {
  const asset = await store.saveMediaAsset(new File(['old'], 'old.png', { type: 'image/png' }))
  await store.cleanupUnreferencedMediaAssets(new Set([asset.id]))
  const cleanup = vi.spyOn(store, 'cleanupUnreferencedMediaAssets')
  renderHook(() => useMediaAssetCleanup(SAMPLE_DRAFT, 'saved', [], false))
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(cleanup).not.toHaveBeenCalled()
  expect(await store.getMediaAsset(asset.id)).not.toBeNull()
})

it('retains an image wallpaper while it is owned only by history', async () => {
  const asset = await store.saveMediaAsset(new File(['wallpaper'], 'wall.png', { type: 'image/png' }))
  await store.cleanupUnreferencedMediaAssets(new Set([asset.id]))
  const wallpaper = { type: 'image' as const, media: { assetId: asset.id, fileName: 'wall.png', mimeType: 'image/png', width: 430, height: 744 } }
  const cleanup = vi.spyOn(store, 'cleanupUnreferencedMediaAssets')
  const { rerender } = renderHook(({ current, history }) => useMediaAssetCleanup(current, 'saved', history), {
    initialProps: { current: { ...SAMPLE_DRAFT, wallpaper: null }, history: [{ ...SAMPLE_DRAFT, wallpaper }] },
  })
  await waitFor(() => expect(cleanup).toHaveBeenCalledOnce()); await cleanup.mock.results[0].value
  expect(await store.getMediaAsset(asset.id)).not.toBeNull()
  rerender({ current: { ...SAMPLE_DRAFT, wallpaper: null }, history: [] })
  await waitFor(() => expect(cleanup).toHaveBeenCalledTimes(2)); await cleanup.mock.results[1].value
  expect(await store.getMediaAsset(asset.id)).toBeNull()
})

it('retains media referenced only by another local project or checkpoint', async () => {
  const asset = await store.saveMediaAsset(new File(['project'], 'project.png', { type: 'image/png' }))
  await store.cleanupUnreferencedMediaAssets(new Set([asset.id]))
  const projectMessage = createMessage('self', { media: { assetId: asset.id, fileName: 'project.png', mimeType: 'image/png' } })
  vi.spyOn(projects, 'getStoredDrafts').mockResolvedValue([{ ...SAMPLE_DRAFT, messages: [projectMessage] }])
  const cleanup = vi.spyOn(store, 'cleanupUnreferencedMediaAssets')

  renderHook(() => useMediaAssetCleanup({ ...SAMPLE_DRAFT, messages: [] }, 'saved'))

  await waitFor(() => expect(cleanup).toHaveBeenCalledOnce())
  await cleanup.mock.results[0].value
  expect(await store.getMediaAsset(asset.id)).not.toBeNull()
})

it('skips cleanup when the local-project index cannot be read', async () => {
  vi.spyOn(projects, 'getStoredDrafts').mockRejectedValue(new Error('IndexedDB unavailable'))
  const cleanup = vi.spyOn(store, 'cleanupUnreferencedMediaAssets')

  renderHook(() => useMediaAssetCleanup(SAMPLE_DRAFT, 'saved'))

  await new Promise(resolve => setTimeout(resolve, 20))
  expect(cleanup).not.toHaveBeenCalled()
})
