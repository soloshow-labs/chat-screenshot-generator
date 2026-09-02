import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SAMPLE_DRAFT } from '../../app/sampleDraft'
import type { ContactRecord, GroupPresetRecord } from '../../services/libraryStore'
import { ContactLibraryDialog } from './ContactLibraryDialog'

const contacts: ContactRecord[] = [
  { id: 'contact-1', name: '阿花', avatarDataUrl: null, updatedAt: 2 },
  { id: 'contact-2', name: '阿花', avatarDataUrl: null, updatedAt: 1 },
]

const groups: GroupPresetRecord[] = [{
  id: 'group-1',
  title: '周末球局',
  participants: SAMPLE_DRAFT.participants.slice(0, 2),
  updatedAt: 1,
}]

function renderDialog(overrides: Partial<React.ComponentProps<typeof ContactLibraryDialog>> = {}) {
  const props: React.ComponentProps<typeof ContactLibraryDialog> = {
    participants: SAMPLE_DRAFT.participants,
    conversationType: 'group',
    contacts,
    groups,
    loading: false,
    error: null,
    onSaveParticipant: vi.fn(),
    onRenameContact: vi.fn(),
    onDeleteContact: vi.fn(),
    onApplyContact: vi.fn(),
    onSaveCurrentGroup: vi.fn(),
    onDeleteGroup: vi.fn(),
    onApplyGroup: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
  render(<ContactLibraryDialog {...props} />)
  return props
}

describe('ContactLibraryDialog', () => {
  it('saves current members and keeps duplicate contact rows independently actionable', async () => {
    const user = userEvent.setup()
    const props = renderDialog()

    expect(screen.getAllByText('阿花')).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: '保存联系人：阿花' }))
    expect(props.onSaveParticipant).toHaveBeenCalledWith(SAMPLE_DRAFT.participants[1])

    await user.click(screen.getByRole('button', { name: '添加联系人 contact-1' }))
    expect(props.onApplyContact).toHaveBeenCalledWith(contacts[0])
    await user.click(screen.getByRole('button', { name: '删除联系人 contact-2' }))
    expect(props.onDeleteContact).toHaveBeenCalledWith('contact-2')
  })

  it('saves/applies groups and closes on Escape', async () => {
    const user = userEvent.setup()
    const props = renderDialog()

    await user.click(screen.getByRole('button', { name: '保存当前群组' }))
    expect(props.onSaveCurrentGroup).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: '应用群组：周末球局' }))
    expect(props.onApplyGroup).toHaveBeenCalledWith(groups[0])

    await user.keyboard('{Escape}')
    expect(props.onClose).toHaveBeenCalled()
  })

  it('renames one saved contact without affecting a duplicate name', async () => {
    const user = userEvent.setup()
    const onRenameContact = vi.fn()
    renderDialog({ onRenameContact })

    await user.click(screen.getByRole('button', { name: '重命名联系人 contact-1' }))
    const nameInput = screen.getByRole('textbox', { name: '联系人 contact-1 昵称' })
    await user.clear(nameInput)
    await user.type(nameInput, '小花')
    await user.click(screen.getByRole('button', { name: '保存联系人 contact-1' }))

    expect(onRenameContact).toHaveBeenCalledWith(contacts[0], '小花')
  })
})
