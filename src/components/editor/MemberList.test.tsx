import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SAMPLE_DRAFT } from '../../app/sampleDraft'
import { MemberList } from './MemberList'
import { hasPendingMediaImports } from '../../hooks/useMediaImportActivity'

beforeEach(() => {
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 800, height: 400, close: vi.fn() }))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/webp;base64,processed')
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('MemberList', () => {
  it('edits nicknames, marks self, adds and requests member removal', async () => {
    const user = userEvent.setup()
    const dispatch = vi.fn()
    const onRequestRemove = vi.fn()
    const onOpenLibrary = vi.fn()
    render(
      <MemberList
        participants={SAMPLE_DRAFT.participants}
        dispatch={dispatch}
        onRequestRemove={onRequestRemove}
        onOpenLibrary={onOpenLibrary}
      />,
    )

    fireEvent.change(screen.getByLabelText('昵称：阿花'), { target: { value: '花姐' } })
    expect(dispatch).toHaveBeenCalledWith({
      type: 'update-participant',
      participantId: 'p2',
      patch: { name: '花姐' },
    })

    await user.click(screen.getByRole('button', { name: '设为我：阿花' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'mark-self', participantId: 'p2' })

    await user.click(screen.getByRole('button', { name: '添加成员' }))
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'add-participant',
      participant: expect.objectContaining({ name: '新成员', isSelf: false }),
    }))

    await user.click(screen.getByRole('button', { name: '删除成员：阿花' }))
    expect(onRequestRemove).toHaveBeenCalledWith('p2')

    await user.click(screen.getByRole('button', { name: '打开素材库' }))
    expect(onOpenLibrary).toHaveBeenCalledOnce()
  })

  it('opens a crop dialog without changing the draft, then confirms exactly one independent edit', async () => {
    const dispatch = vi.fn()
    render(<MemberList participants={SAMPLE_DRAFT.participants} dispatch={dispatch} onRequestRemove={vi.fn()} />)
    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' })

    fireEvent.change(screen.getByLabelText('更换头像：阿花'), { target: { files: [file] } })
    expect(dispatch).not.toHaveBeenCalled()
    expect(await screen.findByRole('dialog', { name: '头像取景' })).toBeInTheDocument()
    const confirm = screen.getByRole('button', { name: '确认头像' })
    await waitFor(() => expect(confirm).toBeEnabled())
    fireEvent.click(confirm)
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({
      type: 'update-participant',
      participantId: 'p2',
      patch: { avatarDataUrl: 'data:image/webp;base64,processed' },
      separateHistory: true,
    }))
    expect(dispatch).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('cancels without replacing an existing avatar and allows selecting the same file again', async () => {
    const dispatch = vi.fn()
    render(<MemberList participants={SAMPLE_DRAFT.participants} dispatch={dispatch} onRequestRemove={vi.fn()} />)
    const input = screen.getByLabelText('更换头像：阿花') as HTMLInputElement
    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })
    fireEvent.click(await screen.findByRole('button', { name: '取消' }))
    expect(dispatch).not.toHaveBeenCalled()
    expect(input.value).toBe('')
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(screen.getByRole('button', { name: '确认头像' })).toBeEnabled())
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('discards a removed participant crop even if that participant is later restored', async () => {
    let finish!: (bitmap: ImageBitmap) => void
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise<ImageBitmap>(resolve => { finish = resolve })))
    const dispatch = vi.fn()
    const props = { dispatch, onRequestRemove: vi.fn() }
    const view = render(<MemberList {...props} participants={SAMPLE_DRAFT.participants} />)
    fireEvent.change(screen.getByLabelText('更换头像：阿花'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } })
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    view.rerender(<MemberList {...props} participants={SAMPLE_DRAFT.participants.filter(participant => participant.id !== 'p2')} />)
    await act(async () => finish({ width: 800, height: 400, close } as unknown as ImageBitmap))
    view.rerender(<MemberList {...props} participants={SAMPLE_DRAFT.participants} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(dispatch).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledOnce()
    expect(hasPendingMediaImports()).toBe(false)
  })
})
