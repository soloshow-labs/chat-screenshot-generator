import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useMediaAssetUrl } from './useMediaAssetUrl'

const getMediaAsset = vi.fn()

vi.mock('../services/mediaAssetStore', () => ({
  getMediaAsset: (...args: unknown[]) => getMediaAsset(...args),
}))

function Probe({ assetId }: { assetId: string | null }) {
  const state = useMediaAssetUrl(assetId)
  return <output>{state.loading ? 'loading' : state.error ?? state.url ?? 'empty'}</output>
}

afterEach(() => {
  vi.restoreAllMocks()
  getMediaAsset.mockReset()
})

describe('useMediaAssetUrl', () => {
  it('loads an asset URL and revokes it on replacement and cleanup', async () => {
    getMediaAsset.mockImplementation(async (id: string) => ({
      id,
      blob: new Blob([id]),
    }))
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation((blob) => `blob:${(blob as Blob).size}`)
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const view = render(<Probe assetId="first" />)
    expect(screen.getByText('loading')).toBeInTheDocument()
    await screen.findByText('blob:5')

    view.rerender(<Probe assetId="second-value" />)
    await screen.findByText('blob:12')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:5')

    view.unmount()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:12')
    expect(createObjectURL).toHaveBeenCalledTimes(2)
  })

  it('reports a missing asset in Chinese', async () => {
    getMediaAsset.mockResolvedValue(null)
    render(<Probe assetId="missing" />)

    await waitFor(() => {
      expect(screen.getByText('找不到媒体素材')).toBeInTheDocument()
    })
  })

  it('returns an empty state without loading when no id is supplied', () => {
    render(<Probe assetId={null} />)
    expect(screen.getByText('empty')).toBeInTheDocument()
    expect(getMediaAsset).not.toHaveBeenCalled()
  })
})
