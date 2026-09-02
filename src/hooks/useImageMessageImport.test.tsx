import 'fake-indexeddb/auto'
import { StrictMode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SAMPLE_DRAFT } from '../app/sampleDraft'
import { useImageMessageImport } from './useImageMessageImport'
import * as mediaStore from '../services/mediaAssetStore'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('useImageMessageImport', () => {
  it('appends image messages in the source file order with one shared timestamp', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 640, height: 480, close: vi.fn() }))
    const dispatch = vi.fn()
    const { result } = renderHook(() => useImageMessageImport({ participants: SAMPLE_DRAFT.participants, dispatch }))
    const first = new File(['first'], 'first.png', { type: 'image/png' })
    const second = new File(['second'], 'second.png', { type: 'image/png' })

    await act(async () => { await result.current.importFiles([first, second]) })

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'add-messages',
      messages: [
        expect.objectContaining({ kind: 'image', participantId: 'self', media: expect.objectContaining({ fileName: 'first.png' }) }),
        expect.objectContaining({ kind: 'image', participantId: 'self', media: expect.objectContaining({ fileName: 'second.png' }) }),
      ],
    }))
    const messages = dispatch.mock.calls[0][0].messages
    expect(messages[0].sentAt).toBe(messages[1].sentAt)
  })

  it('does not append any image when one batch member cannot decode', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn()
      .mockResolvedValueOnce({ width: 640, height: 480, close: vi.fn() })
      .mockRejectedValueOnce(new Error('bad image')))
    const dispatch = vi.fn()
    const { result } = renderHook(() => useImageMessageImport({ participants: SAMPLE_DRAFT.participants, dispatch }))

    await act(async () => { await result.current.importFiles([
      new File(['first'], 'first.png', { type: 'image/png' }),
      new File(['bad'], 'bad.png', { type: 'image/png' }),
    ]) })

    expect(dispatch).not.toHaveBeenCalled()
    expect(result.current.error).toContain('bad.png')
  })

  it('remains usable after Strict Mode has exercised its import cleanup', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 1, height: 1, close: vi.fn() }))
    const dispatch = vi.fn()
    const { result } = renderHook(() => useImageMessageImport({ participants: SAMPLE_DRAFT.participants, dispatch }), { wrapper: StrictMode })

    await act(async () => { await result.current.importFiles([new File(['one'], 'one.png', { type: 'image/png' })]) })

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'add-messages' }))
  })

  it('ignores a repeated import while the first image is still decoding', async () => {
    let resolveDecode!: (value: ImageBitmap) => void
    vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise<ImageBitmap>(resolve => { resolveDecode = resolve })))
    const dispatch = vi.fn()
    const { result } = renderHook(() => useImageMessageImport({ participants: SAMPLE_DRAFT.participants, dispatch }))
    const first = result.current.importFiles([new File(['one'], 'one.png', { type: 'image/png' })])
    const second = result.current.importFiles([new File(['two'], 'two.png', { type: 'image/png' })])

    await act(async () => { resolveDecode({ width: 1, height: 1, close: vi.fn() } as unknown as ImageBitmap); await first; await second })

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0][0].messages[0].media.fileName).toBe('one.png')
  })

  it('releases an asset whose save completes after the importer unmounts', async () => {
    let resolveSave!: (value: { id: string }) => void
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 1, height: 1, close: vi.fn() }))
    vi.spyOn(mediaStore, 'saveMediaAsset').mockImplementation(() => new Promise(resolve => { resolveSave = resolve }) as never)
    const release = vi.spyOn(mediaStore, 'releaseMediaAssets')
    const dispatch = vi.fn()
    const view = renderHook(() => useImageMessageImport({ participants: SAMPLE_DRAFT.participants, dispatch }))

    void view.result.current.importFiles([new File(['one'], 'one.png', { type: 'image/png' })])
    await waitFor(() => expect(resolveSave).toBeTypeOf('function'))
    view.unmount()
    await act(async () => resolveSave({ id: 'late-asset' }))

    expect(release).toHaveBeenCalledWith(['late-asset'])
    expect(dispatch).not.toHaveBeenCalled()
  })
})
