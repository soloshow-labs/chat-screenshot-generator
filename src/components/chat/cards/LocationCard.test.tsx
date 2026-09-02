import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { LocationCard } from './LocationCard'

it('renders an uploaded local map at the fixed card dimensions and keeps it export-addressable after failure', () => {
  render(<LocationCard location={{ name: '集合点', address: '东门', mapDataUrl: 'data:image/png;base64,bWFw' }} side="left" theme="light" />)
  const image = screen.getByAltText('地图截图')
  expect(image).toHaveAttribute('src', 'data:image/png;base64,bWFw')
  expect(image).toHaveAttribute('data-export-image')
  expect(image).toHaveStyle({ width: '240px', height: '112px', objectFit: 'cover', display: 'block' })
  fireEvent.error(image)
  expect(image.closest('[data-map-image-error="true"]')).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('地图截图无法读取')
})

it('keeps the original offline illustration when no map screenshot was uploaded', () => {
  render(<LocationCard location={{ name: '公园', address: '公园路 1 号', mapDataUrl: null }} side="right" theme="dark" />)
  expect(screen.getByRole('img', { name: '离线位置示意图' })).toBeInTheDocument()
  expect(screen.queryByAltText('地图截图')).not.toBeInTheDocument()
})
