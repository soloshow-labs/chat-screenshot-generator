import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ChatWallpaper } from './ChatWallpaper'

vi.mock('../../hooks/useMediaAssetUrl', () => ({
  useMediaAssetUrl: () => ({ url: 'blob:wallpaper', loading: false, error: null }),
}))

it('exposes a non-layout decode probe for an image wallpaper', () => {
  render(<ChatWallpaper wallpaper={{ type: 'image', media: { assetId: 'wall', fileName: 'wall.png', mimeType: 'image/png', width: 430, height: 744 } }} />)
  expect(screen.getByTestId('wallpaper-probe')).toHaveAttribute('src', 'blob:wallpaper')
})
