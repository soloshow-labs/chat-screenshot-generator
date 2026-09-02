import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ExportQualityDialog } from './ExportQualityDialog'

it('shows a dedicated copy warning dialog and offers the matching action', () => {
  const onContinue = vi.fn()
  render(<ExportQualityDialog delivery="clipboard" issues={[{ code: 'avatar', severity: 'warning', message: '成员没有上传头像' }]} onClose={vi.fn()} onContinue={onContinue} />)

  expect(screen.getByRole('dialog', { name: '复制前检查' })).toHaveTextContent('成员没有上传头像')
  expect(screen.queryByText('效率工具')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '继续复制' }))
  expect(onContinue).toHaveBeenCalledOnce()
})

it('uses dedicated wording for staging warnings', () => {
  render(<ExportQualityDialog delivery="stage" issues={[{ code: 'avatar', severity: 'warning', message: '成员没有上传头像' }]} onClose={vi.fn()} onContinue={vi.fn()} />)
  expect(screen.getByRole('dialog', { name: '暂存前检查' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '继续暂存' })).toBeInTheDocument()
})

it('blocks continuation for errors and closes with Escape', () => {
  const onClose = vi.fn()
  render(<ExportQualityDialog delivery="download" issues={[{ code: 'empty', severity: 'error', message: '截图范围内没有消息' }]} onClose={onClose} onContinue={vi.fn()} />)

  const dialog = screen.getByRole('dialog', { name: '导出前检查' })
  expect(screen.queryByRole('button', { name: '继续导出' })).not.toBeInTheDocument()
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(onClose).toHaveBeenCalledOnce()
})

it('offers ZIP segmentation only for a segmentable long-image limit error', () => {
  const onSegment = vi.fn()
  const view = render(<ExportQualityDialog delivery="download" issues={[{ code: 'canvas-limit', severity: 'error', message: '图片过高' }]} onClose={vi.fn()} onContinue={vi.fn()} onSegmentExport={onSegment} />)
  fireEvent.click(screen.getByRole('button', { name: '自动分段导出 ZIP' }))
  expect(onSegment).toHaveBeenCalledOnce()

  view.rerender(<ExportQualityDialog delivery="clipboard" issues={[{ code: 'canvas-limit', severity: 'error', message: '图片过高' }]} onClose={vi.fn()} onContinue={vi.fn()} onSegmentExport={onSegment} />)
  expect(screen.queryByRole('button', { name: '自动分段导出 ZIP' })).not.toBeInTheDocument()
})

it('waits for the initial quality-check action to release its export lock', () => {
  const view = render(<ExportQualityDialog delivery="download" busy issues={[{ code: 'avatar', severity: 'warning', message: '成员没有上传头像' }]} onClose={vi.fn()} onContinue={vi.fn()} />)

  expect(screen.getByRole('button', { name: '继续导出' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '关闭导出前检查' })).toBeDisabled()
  view.rerender(<ExportQualityDialog delivery="download" issues={[{ code: 'avatar', severity: 'warning', message: '成员没有上传头像' }]} onClose={vi.fn()} onContinue={vi.fn()} />)
  expect(screen.getByRole('button', { name: '继续导出' })).toBeEnabled()
})
