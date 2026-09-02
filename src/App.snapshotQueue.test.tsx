import 'fake-indexeddb/auto'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { SAMPLE_DRAFT } from './app/sampleDraft'
import { DRAFT_STORAGE_KEY } from './services/draftStore'

const renderPng = vi.hoisted(() => vi.fn())
vi.mock('./services/exportChatImage', () => ({ exportChatImage: renderPng }))
const png = { filename: '聊天.png', dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlS8AAAAASUVORK5CYII=' }
const createObjectURL = vi.fn(() => 'blob:staged')
const revokeObjectURL = vi.fn()

beforeEach(() => {
  localStorage.clear()
  renderPng.mockReset().mockResolvedValue(png)
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
    ...SAMPLE_DRAFT,
    participants: SAMPLE_DRAFT.participants.map(participant => ({ ...participant, avatarDataUrl: png.dataUrl })),
    messages: [SAMPLE_DRAFT.messages[0]],
  }))
})
afterEach(() => vi.restoreAllMocks())

it('stages a PNG through the normal export path and revokes it when removed', async () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: '暂存 PNG' }))
  expect(await screen.findByText('PNG 已暂存（1 / 20）')).toBeInTheDocument()
  expect(renderPng).toHaveBeenCalledOnce()
  expect(createObjectURL).toHaveBeenCalledOnce()

  fireEvent.click(screen.getByRole('button', { name: '暂存盘（1）' }))
  expect(await screen.findByRole('dialog', { name: '截图暂存盘' })).toHaveTextContent('1 / 20 张')
  fireEvent.click(screen.getByRole('button', { name: '删除 聊天.png' }))
  expect(screen.getByText(/还没有暂存截图/)).toBeInTheDocument()
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:staged')
})

it('releases staged URLs when the page unmounts', async () => {
  const view = render(<App />)
  fireEvent.click(screen.getByRole('button', { name: '暂存 PNG' }))
  await screen.findByText('PNG 已暂存（1 / 20）')
  view.unmount()
  await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:staged'))
})
