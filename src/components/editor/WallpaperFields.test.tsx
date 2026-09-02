import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { WallpaperFields } from './WallpaperFields'

vi.mock('../shared/AvatarCropDialog', () => ({
  AvatarCropDialog: ({ onConfirm }: { onConfirm: (value: string) => void }) => <button type="button" onClick={() => onConfirm('data:image/webp;base64,AA==')}>确认模拟取景</button>,
}))

afterEach(() => vi.unstubAllGlobals())

it('updates a controlled six-digit color and can restore the default wallpaper', async () => {
  const user = userEvent.setup()
  const dispatch = vi.fn()
  render(<WallpaperFields wallpaper={{ type: 'color', color: '#112233' }} dispatch={dispatch} />)

  await user.clear(screen.getByLabelText('聊天背景颜色'))
  await user.type(screen.getByLabelText('聊天背景颜色'), '#a1b2c3')
  expect(dispatch).toHaveBeenLastCalledWith({ type: 'set-field', field: 'wallpaper', value: { type: 'color', color: '#a1b2c3' } })
  await user.click(screen.getByRole('button', { name: '恢复默认背景' }))
  expect(dispatch).toHaveBeenLastCalledWith({ type: 'set-field', field: 'wallpaper', value: null })
})

it('closes a confirmed crop dialog after saving fails and preserves the existing wallpaper', async () => {
  const user = userEvent.setup()
  const dispatch = vi.fn()
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('storage unavailable')))
  render(<WallpaperFields wallpaper={{ type: 'color', color: '#112233' }} dispatch={dispatch} />)

  await user.upload(screen.getByLabelText('上传聊天背景图片'), new File(['image'], 'wall.png', { type: 'image/png' }))
  await user.click(await screen.findByRole('button', { name: '确认模拟取景' }))

  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('storage unavailable'))
  expect(screen.queryByRole('button', { name: '确认模拟取景' })).not.toBeInTheDocument()
  expect(dispatch).not.toHaveBeenCalled()
})
