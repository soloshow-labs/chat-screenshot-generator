import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SAMPLE_DRAFT } from '../../app/sampleDraft'
import { PreviewStage } from './PreviewStage'

class TestResizeObserver {
  static instances: TestResizeObserver[] = []
  private readonly observed: Element[] = []
  disconnected = false

  constructor(private readonly callback: ResizeObserverCallback) {
    TestResizeObserver.instances.push(this)
  }

  disconnect() { this.disconnected = true }
  observe(element: Element) { this.observed.push(element) }
  unobserve() {}

  resize(width: number, targetIndex = 0, height = 900) {
    this.callback([
      {
        contentRect: new DOMRect(0, 0, width, height),
        target: this.observed[targetIndex],
      } as ResizeObserverEntry,
    ], this as unknown as ResizeObserver)
  }
}

function installResizeObserver() {
  TestResizeObserver.instances = []
  vi.stubGlobal('ResizeObserver', TestResizeObserver)
}

afterEach(() => vi.unstubAllGlobals())

describe('PreviewStage', () => {
  it('fits the preview to a narrow available width', () => {
    installResizeObserver()
    render(<PreviewStage draft={SAMPLE_DRAFT} dispatch={vi.fn()} />)

    act(() => TestResizeObserver.instances[0]?.resize(258))

    expect(screen.getByRole('status', { name: '预览缩放' })).toHaveTextContent('60%')
  })

  it('keeps the last visible fit while hidden and recalculates after returning', () => {
    installResizeObserver()
    render(<PreviewStage draft={SAMPLE_DRAFT} dispatch={vi.fn()} />)
    const observer = TestResizeObserver.instances[0]

    act(() => observer.resize(215))
    expect(screen.getByRole('status', { name: '预览缩放' })).toHaveTextContent('50%')

    act(() => observer.resize(0))
    expect(screen.getByRole('status', { name: '预览缩放' })).toHaveTextContent('50%')

    act(() => observer.resize(390))
    expect(screen.getByRole('status', { name: '预览缩放' })).toHaveTextContent('91%')
  })

  it('uses scaled dimensions for the preview frame', () => {
    installResizeObserver()
    render(<PreviewStage draft={SAMPLE_DRAFT} dispatch={vi.fn()} />)
    const observer = TestResizeObserver.instances[0]

    act(() => {
      observer.resize(258)
      observer.resize(430, 1, 900)
    })

    const canvas = screen.getByTestId('chat-canvas')
    expect(canvas.parentElement?.parentElement).toHaveStyle({ width: '258px', height: '540px' })
  })

  it('returns to the narrow automatic fit after manual zoom', () => {
    installResizeObserver()
    render(<PreviewStage draft={SAMPLE_DRAFT} dispatch={vi.fn()} />)
    const observer = TestResizeObserver.instances[0]
    act(() => observer.resize(215))

    fireEvent.click(screen.getByRole('button', { name: '缩小预览' }))
    expect(screen.getByRole('status', { name: '预览缩放' })).toHaveTextContent('60%')

    fireEvent.click(screen.getByRole('button', { name: '恢复适应宽度' }))
    expect(screen.getByRole('status', { name: '预览缩放' })).toHaveTextContent('50%')
  })

  it('keeps manual zoom inside its 60 to 120 percent range', () => {
    installResizeObserver()
    render(<PreviewStage draft={SAMPLE_DRAFT} dispatch={vi.fn()} />)
    const observer = TestResizeObserver.instances[0]
    act(() => observer.resize(258))

    for (let count = 0; count < 7; count += 1) {
      fireEvent.click(screen.getByRole('button', { name: '放大预览' }))
    }
    expect(screen.getByRole('status', { name: '预览缩放' })).toHaveTextContent('120%')
  })

  it('disconnects its observers when the preview unmounts', () => {
    installResizeObserver()
    const view = render(<PreviewStage draft={SAMPLE_DRAFT} dispatch={vi.fn()} />)
    const observer = TestResizeObserver.instances[0]

    view.unmount()

    expect(observer.disconnected).toBe(true)
  })

  it('restores and reports the screen message scroll position', () => {
    const dispatch = vi.fn()
    render(<PreviewStage draft={{ ...SAMPLE_DRAFT, screenScrollTop: 64 }} dispatch={dispatch} />)
    const list = screen.getByTestId('message-list')
    expect(list.scrollTop).toBe(64)

    list.scrollTop = 123
    fireEvent.scroll(list)
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-field', field: 'screenScrollTop', value: 123 })
  })
})
