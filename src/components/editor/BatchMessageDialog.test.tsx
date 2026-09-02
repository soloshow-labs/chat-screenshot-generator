import { createEvent, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createMessage } from '../../app/messageFactory'
import { SAMPLE_DRAFT } from '../../app/sampleDraft'
import { BatchMessageDialog } from './BatchMessageDialog'

describe('BatchMessageDialog', () => {
  it('applies only the enabled sender change for its selected messages', () => {
    const onApply = vi.fn()
    render(<BatchMessageDialog messages={[createMessage('self', { id: 'm1' })]} participants={SAMPLE_DRAFT.participants} selectedIds={['m1']} onApply={onApply} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('checkbox', { name: '修改发送人' }))
    fireEvent.change(screen.getByLabelText('批量发送人'), { target: { value: 'p2' } })
    fireEvent.click(screen.getByRole('button', { name: '应用批量修改' }))

    expect(onApply).toHaveBeenCalledWith({ messageIds: ['m1'], participantId: 'p2' })
  })

  it('shows a validation error for an empty edit without closing', () => {
    render(<BatchMessageDialog messages={[createMessage('self', { id: 'm1' })]} participants={SAMPLE_DRAFT.participants} selectedIds={['m1']} onApply={vi.fn()} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '应用批量修改' }))

    expect(screen.getByRole('alert')).toHaveTextContent('请至少启用一项批量修改')
  })

  it('reports an invalid time instead of submitting it', () => {
    const onApply = vi.fn()
    render(<BatchMessageDialog messages={[createMessage('self', { id: 'm1' })]} participants={SAMPLE_DRAFT.participants} selectedIds={['m1']} onApply={onApply} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('checkbox', { name: '平移日期时间' }))
    fireEvent.change(screen.getByLabelText('第一条新时间'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '应用批量修改' }))

    expect(screen.getByRole('alert')).toHaveTextContent('日期时间无效')
    expect(onApply).not.toHaveBeenCalled()
  })

  it('keeps the exact baseline instant when time shifting is enabled but left unchanged', () => {
    const onApply = vi.fn()
    const message = createMessage('self', { id: 'm1', sentAt: '2026-08-27T08:00:30.500Z' })
    render(<BatchMessageDialog messages={[message]} participants={SAMPLE_DRAFT.participants} selectedIds={['m1']} onApply={onApply} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('checkbox', { name: '平移日期时间' }))
    fireEvent.click(screen.getByRole('button', { name: '应用批量修改' }))

    expect(screen.getByText('原时间：2026-08-27T08:00:30.500Z')).toBeInTheDocument()
    expect(onApply).toHaveBeenCalledWith({ messageIds: ['m1'], firstSentAt: '2026-08-27T08:00:30.500Z' })
  })

  it('explains that payment identity is independent from a batch sender edit', () => {
    const payment = createMessage('self', { id: 'payment', kind: 'payment' })
    render(<BatchMessageDialog messages={[payment]} participants={SAMPLE_DRAFT.participants} selectedIds={['payment']} onApply={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText('发送人与付款／收款身份独立，不会自动修改支付身份。')).toBeInTheDocument()
  })

  it('moves focus into the dialog, traps Tab, restores its opener, and blocks background shortcuts', () => {
    const onClose = vi.fn()
    const backgroundShortcut = vi.fn()
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const view = render(<div onKeyDown={backgroundShortcut}><BatchMessageDialog messages={[createMessage('self', { id: 'm1' })]} participants={SAMPLE_DRAFT.participants} selectedIds={['m1']} onApply={vi.fn()} onClose={onClose} /></div>)
    const senderToggle = screen.getByRole('checkbox', { name: '修改发送人' })
    const apply = screen.getByRole('button', { name: '应用批量修改' })

    expect(senderToggle).toHaveFocus()
    apply.focus()
    fireEvent.keyDown(apply, { key: 'Tab' })
    expect(senderToggle).toHaveFocus()
    backgroundShortcut.mockClear()
    const undo = createEvent.keyDown(senderToggle, { key: 'z', ctrlKey: true })
    fireEvent(senderToggle, undo)
    expect(backgroundShortcut).not.toHaveBeenCalled()
    expect(undo.defaultPrevented).toBe(true)
    fireEvent.keyDown(senderToggle, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    view.unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })
})
