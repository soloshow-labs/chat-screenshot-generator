import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmojiPicker } from './EmojiPicker'

const recentKey = 'chat-screenshot-generator:emoji-recents:v1'

function Editor({ number = 1, composing = false }: { number?: number; composing?: boolean }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState('你好世界')
  return <div>
    <textarea aria-label={`正文 ${number}`} ref={textareaRef} value={text} onChange={event => setText(event.target.value)} />
    <EmojiPicker number={number} composing={composing} textareaRef={textareaRef} text={text} onInsert={setText} />
  </div>
}

afterEach(() => vi.restoreAllMocks())

describe('emoji search and recents panel', () => {
  it('focuses search, filters aliases once, and shows an explicit empty result', async () => {
    const user = userEvent.setup()
    render(<Editor />)
    await user.click(screen.getByRole('button', { name: '消息 1 插入表情' }))
    const search = screen.getByRole('searchbox', { name: '消息 1 搜索表情' })
    expect(search).toHaveFocus()
    expect(within(screen.getByRole('region', { name: '消息 1 全部表情' })).getAllByRole('button')).toHaveLength(108)
    await user.type(search, '笑哭')
    expect(screen.getAllByRole('button', { name: '插入破涕为笑' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: '插入微笑' })).not.toBeInTheDocument()
    await user.clear(search)
    await user.type(search, '不存在的表情')
    expect(screen.getByRole('status')).toHaveTextContent('没有找到匹配的表情')
  })
  it('inserts into the current textarea selection after searching and restores the caret', async () => {
    const user = userEvent.setup()
    render(<Editor />)
    const textarea = screen.getByRole('textbox', { name: '正文 1' }) as HTMLTextAreaElement
    textarea.focus(); textarea.setSelectionRange(0, 1)
    await user.click(screen.getByRole('button', { name: '消息 1 插入表情' }))
    const search = screen.getByRole('searchbox', { name: '消息 1 搜索表情' })
    await user.type(search, '微笑')
    textarea.setSelectionRange(2, 4)
    await user.click(screen.getByRole('button', { name: '插入微笑' }))
    expect(textarea).toHaveValue('你好[微笑]')
    expect(textarea).toHaveFocus()
    expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([6, 6])
    expect(JSON.parse(localStorage.getItem(recentKey)!)[0]).toBe('smile')
  })
  it('shares a successful insert immediately with another open panel, without recording search or cancellation', async () => {
    const user = userEvent.setup()
    render(<><Editor /><Editor number={2} /></>)
    await user.click(screen.getByRole('button', { name: '消息 1 插入表情' }))
    await user.click(screen.getByRole('button', { name: '消息 2 插入表情' }))
    const before = localStorage.getItem(recentKey)
    await user.type(screen.getByRole('searchbox', { name: '消息 1 搜索表情' }), 'oK')
    expect(localStorage.getItem(recentKey)).toBe(before)
    await user.click(within(screen.getByRole('group', { name: '消息 1 表情选择器' })).getByRole('button', { name: '插入OK' }))
    const recents = screen.getByRole('region', { name: '消息 2 最近使用表情' })
    expect(within(recents).getAllByRole('button')[0]).toHaveAccessibleName('插入OK')
    const recorded = localStorage.getItem(recentKey)
    await user.type(screen.getByRole('searchbox', { name: '消息 2 搜索表情' }), '其他')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: '消息 2 表情选择器' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '正文 2' })).toHaveFocus()
    expect(localStorage.getItem(recentKey)).toBe(recorded)
  })
  it('closes on Escape when Chrome reports legacy keyCode 229 outside composition', async () => {
    const user = userEvent.setup()
    render(<Editor />)
    const textarea = screen.getByRole('textbox', { name: '正文 1' })
    await user.click(screen.getByRole('button', { name: '消息 1 插入表情' }))
    const search = screen.getByRole('searchbox', { name: '消息 1 搜索表情' })
    fireEvent.keyDown(search, { key: 'Escape', keyCode: 229, isComposing: false })
    expect(screen.queryByRole('group', { name: '消息 1 表情选择器' })).not.toBeInTheDocument()
    expect(textarea).toHaveFocus()
  })
  it('blocks IME Enter/Escape and insertion until search composition ends', async () => {
    const user = userEvent.setup()
    render(<Editor />)
    const textarea = screen.getByRole('textbox', { name: '正文 1' }) as HTMLTextAreaElement
    textarea.setSelectionRange(4, 4)
    await user.click(screen.getByRole('button', { name: '消息 1 插入表情' }))
    const search = screen.getByRole('searchbox', { name: '消息 1 搜索表情' })
    fireEvent.change(search, { target: { value: '微笑' } })
    fireEvent.compositionStart(search)
    expect(fireEvent.keyDown(search, { key: 'Enter', isComposing: true, keyCode: 229 })).toBe(true)
    fireEvent.keyDown(search, { key: 'Escape', isComposing: true })
    await user.click(screen.getByRole('button', { name: '插入微笑' }))
    expect(screen.getByRole('textbox', { name: '正文 1' })).toHaveValue('你好世界')
    expect(screen.getByRole('group', { name: '消息 1 表情选择器' })).toBeInTheDocument()
    fireEvent.compositionEnd(search)
    await user.click(screen.getByRole('button', { name: '插入微笑' }))
    expect(screen.getByRole('textbox', { name: '正文 1' })).toHaveValue('你好世界[微笑]')
  })
  it('does not insert on search Enter, but allows keyboard selection and returns to the original range', async () => {
    const user = userEvent.setup()
    render(<Editor />)
    const textarea = screen.getByRole('textbox', { name: '正文 1' }) as HTMLTextAreaElement
    textarea.setSelectionRange(1, 3)
    await user.click(screen.getByRole('button', { name: '消息 1 插入表情' }))
    await user.type(screen.getByRole('searchbox', { name: '消息 1 搜索表情' }), '微笑')
    await user.keyboard('{Enter}')
    expect(textarea).toHaveValue('你好世界')
    await user.tab()
    expect(screen.getByRole('button', { name: '插入微笑' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(textarea).toHaveValue('你[微笑]界')
    expect(textarea).toHaveFocus()
    expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([5, 5])
  })
  it('keeps body composition protected and still allows insertion when preference writes fail', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Editor composing />)
    expect(screen.getByRole('button', { name: '消息 1 插入表情' })).toBeDisabled()
    rerender(<Editor />)
    const textarea = screen.getByRole('textbox', { name: '正文 1' }) as HTMLTextAreaElement
    textarea.setSelectionRange(4, 4)
    await user.click(screen.getByRole('button', { name: '消息 1 插入表情' }))
    await user.type(screen.getByRole('searchbox', { name: '消息 1 搜索表情' }), '微笑')
    rerender(<Editor composing />)
    expect(screen.getByRole('button', { name: '插入微笑' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('group', { name: '消息 1 表情选择器' })).toBeInTheDocument()
    rerender(<Editor />)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError') })
    await user.click(screen.getByRole('button', { name: '插入微笑' }))
    expect(screen.getByRole('textbox', { name: '正文 1' })).toHaveValue('你好世界[微笑]')
    await user.click(screen.getByRole('button', { name: '消息 1 插入表情' }))
    expect(within(screen.getByRole('region', { name: '消息 1 最近使用表情' })).getAllByRole('button')[0]).toHaveAccessibleName('插入微笑')
  })
})
