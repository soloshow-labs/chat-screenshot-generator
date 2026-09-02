import 'fake-indexeddb/auto'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { SAMPLE_DRAFT } from '../../app/sampleDraft'
import { DRAFT_STORAGE_KEY } from '../../services/draftStore'
import * as projectFile from '../../services/projectFile'
import { EditorErrorBoundary } from './EditorErrorBoundary'

function BrokenEditor(): never { throw new Error('render exploded') }

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

it('replaces a crashed editor with reload and complete-project recovery actions', async () => {
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(SAMPLE_DRAFT))
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(projectFile, 'serializeProject').mockResolvedValue('{"complete":true}')
  const url = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:recovery')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

  render(<EditorErrorBoundary><BrokenEditor /></EditorErrorBoundary>)
  expect(screen.getByRole('heading', { name: '编辑器发生异常' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '重新载入页面' })).toBeEnabled()
  expect(screen.getByText('错误详情').closest('details')).not.toHaveAttribute('open')
  fireEvent.click(screen.getByRole('button', { name: '下载完整项目 JSON' }))

  await waitFor(() => expect(click).toHaveBeenCalledOnce())
  expect(projectFile.serializeProject).toHaveBeenCalledWith(expect.objectContaining({ title: SAMPLE_DRAFT.title }))
  expect(url.mock.calls[0][0]).toBeInstanceOf(Blob)
})

it('offers the untouched localStorage text when complete project serialization fails', async () => {
  localStorage.setItem(DRAFT_STORAGE_KEY, '{"damaged":true}')
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(projectFile, 'serializeProject').mockRejectedValue(new Error('media missing'))
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:raw')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

  render(<EditorErrorBoundary><BrokenEditor /></EditorErrorBoundary>)
  fireEvent.click(screen.getByRole('button', { name: '下载完整项目 JSON' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('不包含附件二进制')
  fireEvent.click(screen.getByRole('button', { name: '下载原始草稿文本' }))
  expect(click).toHaveBeenCalledOnce()
})
