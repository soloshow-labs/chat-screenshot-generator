import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./components/editor/ProductivityDialog', () => ({
  ProductivityDialog: () => <div role="dialog" aria-label="效率工具">效率工具内容</div>,
}))

describe('low-frequency dialogs', () => {
  it('shows a loading status while the productivity dialog chunk is loading', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '效率工具' }))

    expect(screen.getByRole('status', { name: '正在加载效率工具' })).toBeInTheDocument()
    expect(await screen.findByRole('dialog', { name: '效率工具' })).toBeInTheDocument()
  })
})
