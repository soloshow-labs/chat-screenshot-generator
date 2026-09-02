import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AvatarCropDialog } from './AvatarCropDialog'
import { hasPendingMediaImports } from '../../hooks/useMediaImportActivity'
import styles from './AvatarCropDialog.module.css'

const file = new File(['x'], 'avatar.png', { type: 'image/png' })
let drawImage: ReturnType<typeof vi.fn>
let close: ReturnType<typeof vi.fn>

beforeEach(() => {
  close = vi.fn()
  drawImage = vi.fn()
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 800, height: 400, close }))
  vi.stubGlobal('PointerEvent', MouseEvent)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/webp;base64,crop')
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('portals outside inert content and owns busy status until cancel, then restores focus', async () => {
  const trigger = document.createElement('button')
  document.body.append(trigger)
  trigger.focus()
  const onCancel = vi.fn()
  const view = render(<div inert><AvatarCropDialog file={file} onCancel={onCancel} onConfirm={vi.fn()} /></div>)
  const dialog = screen.getByRole('dialog', { name: '头像取景' })
  expect(view.container).not.toContainElement(dialog)
  expect(dialog.closest('[inert]')).toBeNull()
  expect(hasPendingMediaImports()).toBe(true)
  await waitFor(() => expect(screen.getByRole('button', { name: '确认头像' })).toBeEnabled())
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(onCancel).toHaveBeenCalledOnce()
  expect(close).toHaveBeenCalledOnce()
  expect(hasPendingMediaImports()).toBe(false)
  view.unmount()
  await waitFor(() => expect(trigger).toHaveFocus())
  trigger.remove()
})

it('uses the adjusted source crop for both preview and one confirmed output', async () => {
  const onConfirm = vi.fn()
  render(<AvatarCropDialog file={file} onCancel={vi.fn()} onConfirm={onConfirm} />)
  const confirm = screen.getByRole('button', { name: '确认头像' })
  await waitFor(() => expect(confirm).toBeEnabled())
  fireEvent.change(screen.getByRole('slider', { name: '缩放头像' }), { target: { value: '2' } })
  const stage = screen.getByRole('img', { name: '头像取景区' })
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({ width: 200, height: 200, left: 0, top: 0, right: 200, bottom: 200, x: 0, y: 0, toJSON() {} })
  fireEvent.pointerDown(stage, { button: 0, clientX: 100, clientY: 100 })
  fireEvent.pointerMove(stage, { clientX: 0, clientY: 100 })
  fireEvent.pointerUp(stage)
  expect(drawImage).toHaveBeenLastCalledWith(expect.anything(), 400, 100, 200, 200, 0, 0, 200, 200)
  fireEvent.click(confirm)
  fireEvent.click(confirm)
  expect(drawImage).toHaveBeenLastCalledWith(expect.anything(), 400, 100, 200, 200, 0, 0, 200, 200)
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith('data:image/webp;base64,crop')
  expect(close).toHaveBeenCalledOnce()
  expect(hasPendingMediaImports()).toBe(false)
})

it('supports keyboard adjustments, reset, and wrapping dialog focus', async () => {
  render(<AvatarCropDialog file={file} onCancel={vi.fn()} onConfirm={vi.fn()} />)
  const confirm = screen.getByRole('button', { name: '确认头像' })
  await waitFor(() => expect(confirm).toBeEnabled())
  const stage = screen.getByRole('img', { name: '头像取景区' })
  stage.focus()
  fireEvent.keyDown(stage, { key: 'ArrowRight' })
  expect(drawImage.mock.calls.at(-1)?.[1]).toBeGreaterThan(200)
  fireEvent.click(screen.getByRole('button', { name: '重置取景' }))
  expect(drawImage).toHaveBeenLastCalledWith(expect.anything(), 200, 0, 400, 400, 0, 0, 400, 400)
  confirm.focus()
  fireEvent.keyDown(confirm, { key: 'Tab' })
  expect(stage).toHaveFocus()
  fireEvent.keyDown(stage, { key: 'Tab', shiftKey: true })
  expect(confirm).toHaveFocus()
})

it('allows an encoding retry without committing a failed result', async () => {
  const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementationOnce(() => { throw new Error('编码失败') }).mockReturnValue('data:image/webp;base64,retry')
  const onConfirm = vi.fn()
  const view = render(<AvatarCropDialog file={file} onCancel={vi.fn()} onConfirm={onConfirm} />)
  const confirm = screen.getByRole('button', { name: '确认头像' })
  await waitFor(() => expect(confirm).toBeEnabled())
  fireEvent.click(confirm)
  expect(screen.getByRole('alert')).toHaveTextContent('编码失败')
  expect(onConfirm).not.toHaveBeenCalled()
  expect(hasPendingMediaImports()).toBe(true)
  fireEvent.click(confirm)
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith('data:image/webp;base64,retry')
  expect(encode).toHaveBeenCalledTimes(2)
  view.unmount()
  expect(close).toHaveBeenCalledOnce()
})

it('closes a late bitmap after unmount without committing or keeping busy state', async () => {
  let resolve!: (bitmap: ImageBitmap) => void
  vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise<ImageBitmap>(done => { resolve = done })))
  const onConfirm = vi.fn()
  const view = render(<AvatarCropDialog file={file} onCancel={vi.fn()} onConfirm={onConfirm} />)
  view.unmount()
  await act(async () => resolve({ width: 800, height: 400, close } as unknown as ImageBitmap))
  expect(close).toHaveBeenCalledOnce()
  expect(onConfirm).not.toHaveBeenCalled()
  expect(hasPendingMediaImports()).toBe(false)
})

it('ignores a previous file decode after reselection', async () => {
  let resolve!: (bitmap: ImageBitmap) => void
  const oldClose = vi.fn()
  vi.stubGlobal('createImageBitmap', vi.fn().mockImplementationOnce(() => new Promise<ImageBitmap>(done => { resolve = done })).mockResolvedValue({ width: 400, height: 800, close }))
  const props = { onCancel: vi.fn(), onConfirm: vi.fn() }
  const view = render(<AvatarCropDialog {...props} file={file} />)
  view.rerender(<AvatarCropDialog {...props} file={new File(['y'], 'second.png', { type: 'image/png' })} />)
  await waitFor(() => expect(screen.getByRole('button', { name: '确认头像' })).toBeEnabled())
  await act(async () => resolve({ width: 800, height: 400, close: oldClose } as unknown as ImageBitmap))
  expect(oldClose).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: '确认头像' }))
  expect(drawImage).toHaveBeenLastCalledWith(expect.anything(), 0, 200, 400, 400, 0, 0, 400, 400)
})

it('uses a 15:7 viewport and accessible map labels without changing the square default', async () => {
  const onConfirm = vi.fn()
  render(<AvatarCropDialog file={file} onCancel={vi.fn()} onConfirm={onConfirm} options={{ aspectRatio: 15 / 7, maxWidth: 960, maxHeight: 448 }} labels={{ title: '地图截图取景', viewport: '地图截图取景区', zoom: '缩放地图截图', confirm: '确认地图截图' }} />)
  await waitFor(() => expect(screen.getByRole('button', { name: '确认地图截图' })).toBeEnabled())
  expect(screen.getByRole('dialog', { name: '地图截图取景' })).toBeInTheDocument()
  const stage = screen.getByRole('img', { name: '地图截图取景区' })
  expect(stage).toHaveStyle({ aspectRatio: `${15 / 7}` })
  fireEvent.click(screen.getByRole('button', { name: '确认地图截图' }))
  const crop = drawImage.mock.calls.at(-1)!
  expect(crop.slice(1, 3)).toEqual([0, 13.333333333333314])
  expect(crop[3]).toBeCloseTo(800)
  expect(crop[4]).toBeCloseTo(373.33333333333337)
  expect(crop.slice(5)).toEqual([0, 0, 795, 371])
  expect(onConfirm).toHaveBeenCalledOnce()
})

it('uses compact dialog styling only when explicitly requested', async () => {
  const labels = { title: '聊天背景取景', viewport: '聊天背景取景区', zoom: '缩放聊天背景', confirm: '确认背景' }
  const view = render(<AvatarCropDialog file={file} onCancel={vi.fn()} onConfirm={vi.fn()} compact labels={labels} options={{ aspectRatio: 430 / 744, maxWidth: 1290, maxHeight: 2232 }} />)
  await waitFor(() => expect(screen.getByRole('button', { name: '确认背景' })).toBeEnabled())
  expect(screen.getByRole('dialog', { name: '聊天背景取景' })).toHaveClass(styles.compact)
  view.rerender(<AvatarCropDialog file={file} onCancel={vi.fn()} onConfirm={vi.fn()} />)
  expect(screen.getByRole('dialog', { name: '头像取景' })).not.toHaveClass(styles.compact)
})

it('keeps a tiny map crop open and retryable instead of enlarging it on confirmation', async () => {
  const onConfirm = vi.fn()
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 30, height: 14, close }))
  render(<AvatarCropDialog file={file} onCancel={vi.fn()} onConfirm={onConfirm} options={{ aspectRatio: 15 / 7, maxWidth: 960, maxHeight: 448 }} labels={{ title: '地图截图取景', viewport: '地图截图取景区', zoom: '缩放地图截图', confirm: '确认地图截图' }} />)
  const confirm = screen.getByRole('button', { name: '确认地图截图' })
  await waitFor(() => expect(confirm).toBeEnabled())
  fireEvent.change(screen.getByRole('slider', { name: '缩放地图截图' }), { target: { value: '4' } })
  fireEvent.click(confirm)
  expect(screen.getByRole('alert')).toHaveTextContent('图片取景尺寸过小')
  expect(onConfirm).not.toHaveBeenCalled()
  expect(confirm).toBeEnabled()
  fireEvent.change(screen.getByRole('slider', { name: '缩放地图截图' }), { target: { value: '1' } })
  fireEvent.click(confirm)
  expect(onConfirm).toHaveBeenCalledOnce()
})
