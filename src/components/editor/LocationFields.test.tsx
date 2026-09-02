import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMessage } from '../../app/messageFactory'
import type { ChatAction } from '../../app/chatReducer'
import { LocationFields } from './LocationFields'

const uploaded = new File(['map'], 'map.png', { type: 'image/png' })
function location(mapDataUrl: string | null = null) { return createMessage('p2', { kind: 'location', location: { name: '集合点', address: '东门', mapDataUrl } }) }

beforeEach(() => {
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 1200, height: 800, close: vi.fn() }))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/webp;base64,bWFw')
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('keeps the old map until the user confirms a cropped local upload as one undo step', async () => {
  const dispatch = vi.fn<(action: ChatAction) => void>()
  render(<LocationFields message={location('data:image/png;base64,b2xk')} number={2} dispatch={dispatch} />)
  fireEvent.change(screen.getByLabelText('消息 2 上传地图截图'), { target: { files: [uploaded] } })
  await waitFor(() => expect(screen.getByRole('button', { name: '确认地图截图' })).toBeEnabled())
  expect(dispatch).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '确认地图截图' }))
  expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: 'update-message', messageId: expect.any(String), patch: { location: { name: '集合点', address: '东门', mapDataUrl: 'data:image/webp;base64,bWFw' } }, separateHistory: true })
})

it('cancels without changing the map and removes an existing map in a separate undo step', async () => {
  const dispatch = vi.fn<(action: ChatAction) => void>()
  render(<LocationFields message={location('data:image/png;base64,b2xk')} number={1} dispatch={dispatch} />)
  fireEvent.change(screen.getByLabelText('消息 1 上传地图截图'), { target: { files: [uploaded] } })
  await waitFor(() => expect(screen.getByRole('button', { name: '取消' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(dispatch).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '移除地图截图' }))
  expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: 'update-message', messageId: expect.any(String), patch: { location: { name: '集合点', address: '东门', mapDataUrl: null } }, separateHistory: true })
})

it('drops a late crop after the target message changes', async () => {
  let resolve!: (bitmap: ImageBitmap) => void
  const close = vi.fn()
  vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise<ImageBitmap>(done => { resolve = done })))
  const dispatch = vi.fn<(action: ChatAction) => void>()
  const view = render(<LocationFields message={location()} number={1} dispatch={dispatch} />)
  fireEvent.change(screen.getByLabelText('消息 1 上传地图截图'), { target: { files: [uploaded] } })
  view.rerender(<LocationFields message={createMessage('p2', { kind: 'link' })} number={1} dispatch={dispatch} />)
  await act(async () => resolve({ width: 1200, height: 800, close } as unknown as ImageBitmap))
  expect(dispatch).not.toHaveBeenCalled()
  expect(close).toHaveBeenCalledOnce()
})

it('keeps the current map when local map decoding fails', async () => {
  vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('bad image')))
  const dispatch = vi.fn<(action: ChatAction) => void>()
  render(<LocationFields message={location('data:image/png;base64,b2xk')} number={1} dispatch={dispatch} />)
  fireEvent.change(screen.getByLabelText('消息 1 上传地图截图'), { target: { files: [uploaded] } })
  expect(await screen.findByRole('alert')).toHaveTextContent('图片无法解码')
  expect(dispatch).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: '移除地图截图' })).toBeInTheDocument()
})

it('keeps the current map when encoding a confirmed crop fails', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementationOnce(() => { throw new Error('编码失败') })
  const dispatch = vi.fn<(action: ChatAction) => void>()
  render(<LocationFields message={location('data:image/png;base64,b2xk')} number={1} dispatch={dispatch} />)
  fireEvent.change(screen.getByLabelText('消息 1 上传地图截图'), { target: { files: [uploaded] } })
  await waitFor(() => expect(screen.getByRole('button', { name: '确认地图截图' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '确认地图截图' }))
  expect(screen.getByRole('alert')).toHaveTextContent('编码失败')
  expect(dispatch).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: '移除地图截图' })).toBeInTheDocument()
})
