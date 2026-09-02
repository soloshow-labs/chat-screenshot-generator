import { useReducer } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createHistory, historyReducer } from '../../app/chatHistory'
import { SAMPLE_DRAFT } from '../../app/sampleDraft'
import { SettingsPanel } from './SettingsPanel'
import { ChatCanvas } from '../chat/ChatCanvas'

function Harness() {
  const [history, send] = useReducer(historyReducer, { ...SAMPLE_DRAFT, participants: SAMPLE_DRAFT.participants.slice(0, 3), messages: SAMPLE_DRAFT.messages.filter(message => message.participantId !== 'p4') }, createHistory)
  const draft = history.present
  return <>
    <SettingsPanel draft={draft} messages={draft.messages} dispatch={action => send({ type: 'edit', action, timestamp: Date.now() })} onRequestConversationTypeChange={value => send({ type: 'edit', action: { type: 'set-field', field: 'conversationType', value }, timestamp: Date.now() })} />
    <ChatCanvas draft={draft} exportMode={false} />
    <button onClick={() => send({ type: 'undo' })}>撤销测试</button>
    <output aria-label="实际成员数">{draft.participants.length}</output>
  </>
}

describe('group display settings', () => {
  it('shows 128 members using only three speakers and returns to automatic count when cleared', () => {
    render(<Harness />)
    const canvas = screen.getByTestId('chat-canvas')
    expect(within(canvas).getByText('仙女驻凡大使馆 (3)')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('群显示人数'), { target: { value: '128' } })
    expect(within(canvas).getByText('仙女驻凡大使馆 (128)')).toBeInTheDocument()
    expect(screen.getByLabelText('实际成员数')).toHaveTextContent('3')
    fireEvent.change(screen.getByLabelText('群显示人数'), { target: { value: '' } })
    expect(within(canvas).getByText('仙女驻凡大使馆 (3)')).toBeInTheDocument()
  })

  it('hides group names without changing message authors and undo restores them', async () => {
    render(<Harness />)
    const canvas = screen.getByTestId('chat-canvas')
    const names = canvas.querySelectorAll('[data-sender-name]').length
    expect(names).toBeGreaterThan(0)
    const avatars = within(canvas).getAllByAltText('阿花的头像').length
    await userEvent.click(screen.getByLabelText('显示群成员昵称'))
    expect(canvas.querySelectorAll('[data-sender-name]')).toHaveLength(0)
    expect(within(canvas).getAllByAltText('阿花的头像')).toHaveLength(avatars)
    await userEvent.click(screen.getByRole('button', { name: '撤销测试' }))
    expect(canvas.querySelectorAll('[data-sender-name]')).toHaveLength(names)
  })

  it('keeps group settings out of direct-chat titles and retains them when switching back', async () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('群显示人数'), { target: { value: '128' } })
    await userEvent.click(screen.getByRole('button', { name: /^单聊$/ }))
    expect(screen.queryByLabelText('群显示人数')).not.toBeInTheDocument()
    const canvas = screen.getByTestId('chat-canvas')
    expect(within(canvas).getByText('仙女驻凡大使馆', { exact: true })).toBeInTheDocument()
    expect(canvas.querySelectorAll('[data-sender-name]')).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: /^群聊$/ }))
    expect(screen.getByLabelText('群显示人数')).toHaveValue(128)
  })

  it('does not save invalid display counts', () => {
    render(<Harness />)
    for (const value of ['0', '100000', '1.5']) {
      fireEvent.change(screen.getByLabelText('群显示人数'), { target: { value } })
      expect(within(screen.getByTestId('chat-canvas')).getByText('仙女驻凡大使馆 (3)')).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent('1–99999')
    }
  })
})
