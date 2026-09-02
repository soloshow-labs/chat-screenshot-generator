import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { LazyAvatarCropDialog } from './LazyAvatarCropDialog'

vi.mock('./AvatarCropDialog', () => ({
  AvatarCropDialog: () => <div role="dialog" aria-label="头像取景">取景内容</div>,
}))

it('shows a loading status while the crop dialog chunk is loading', async () => {
  render(<LazyAvatarCropDialog file={new File(['avatar'], 'avatar.png', { type: 'image/png' })} onCancel={vi.fn()} onConfirm={vi.fn()} />)

  expect(screen.getByRole('status', { name: '正在加载图片取景工具' })).toBeInTheDocument()
  expect(await screen.findByRole('dialog', { name: '头像取景' })).toBeInTheDocument()
})
