import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RichMessage } from '../RichMessage'
import { ChatCanvas } from '../ChatCanvas'
import { createMessage } from '../../../app/messageFactory'
import { SAMPLE_DRAFT } from '../../../app/sampleDraft'
import type { Message } from '../../../app/chatTypes'

function card(message: Message, side: 'left' | 'right' = 'left', theme: 'light' | 'dark' = 'light') {
  return render(<div data-theme={theme}><RichMessage message={message} sender={SAMPLE_DRAFT.participants[1]} side={side} showName={false} exportMode={false} /></div>)
}

describe('polished payment, contact and location cards', () => {
  it('keeps map colors self-contained for SVG cloning and updates them when the canvas theme changes', () => {
    const draft = { ...SAMPLE_DRAFT, messages: [createMessage('p2', { kind: 'location', location: { name: '公园', address: '公园路' } })] }
    const { rerender } = render(<ChatCanvas draft={{ ...draft, theme: 'light' }} exportMode={false} />)
    for (const [theme, land, park, water] of [
      ['light', '#f0eee7', '#cfe5be', '#acd5e5'],
      ['dark', '#363b3c', '#435b44', '#355c6d'],
      ['light', '#f0eee7', '#cfe5be', '#acd5e5'],
    ] as const) {
      rerender(<ChatCanvas draft={{ ...draft, theme }} exportMode={false} />)
      const map = screen.getByRole('img', { name: '离线位置示意图' })
      expect(map.querySelector('rect')).toHaveAttribute('fill', land)
      expect(map.querySelector('[data-map-layer="park"] path')).toHaveAttribute('fill', park)
      expect(map.querySelector('[data-map-layer="water"] path')).toHaveAttribute('fill', water)
      expect(map.querySelector('[fill*="var("], [stroke*="var("]')).toBeNull()
    }
  })

  it.each(['left', 'right'] as const)('keeps pending transfer to two text lines and points its tail %s', side => {
    const { container } = card(createMessage('p2', { kind: 'payment', payment: { mode: 'transfer', amount: 88.8, note: '晚餐', status: 'pending' } }), side)
    const surface = container.querySelector<HTMLElement>('[data-card-kind="payment"]')!
    expect(surface).toHaveAttribute('data-side', side)
    expect(surface.querySelector('[data-card-tail]')).toBeInTheDocument()
    expect(screen.getByText('¥88.80')).toBeInTheDocument()
    expect(screen.getByText('晚餐')).toBeInTheDocument()
    expect(screen.queryByText('待收款')).not.toBeInTheDocument()
    expect(parseFloat(getComputedStyle(surface).width)).toBeCloseTo(700 / 3, 2)
    expect(surface).toHaveStyle({ overflow: 'visible' })
    const footer = screen.getByText('微信转账')
    expect(getComputedStyle(footer).backgroundColor).toBe(getComputedStyle(footer.previousElementSibling!).backgroundColor)
    expect(parseFloat(getComputedStyle(footer).height)).toBeCloseTo(71 / 3, 2)
    const tail = surface.querySelector<HTMLElement>('[data-card-tail]')!
    expect(parseFloat(getComputedStyle(tail).top)).toBeCloseTo(50 / 3, 2)
    expect(tail).toHaveStyle({ transform: 'rotate(45deg)' })
  })

  it.each(['light', 'dark'] as const)('keeps handled payment bodies pale peach with white text and matching footer in %s mode', theme => {
    card(createMessage('p2', { kind: 'payment', payment: { mode: 'transfer', amount: 9, note: '不应成为第三行', status: 'received' } }), 'right', theme)
    const footer = screen.getByText('微信转账')
    expect(screen.queryByText('不应成为第三行')).not.toBeInTheDocument()
    expect(screen.getByText('已收款')).toBeInTheDocument()
    expect(getComputedStyle(footer.previousElementSibling!).color).toBe('rgb(255, 255, 255)')
    expect(getComputedStyle(footer.previousElementSibling!).backgroundColor).toBe('rgb(253, 225, 194)')
    expect(getComputedStyle(footer).backgroundColor).toBe('rgb(253, 225, 194)')
  })

  it('renders the original closed-envelope PNG at its natural aspect ratio', () => {
    card(createMessage('p2', { kind: 'payment', payment: { mode: 'red-packet', amount: 888, note: '', status: 'pending' } }))
    expect(screen.getByText('恭喜发财，大吉大利')).toBeInTheDocument()
    expect(screen.queryByText('待领取')).not.toBeInTheDocument()
    expect(screen.queryByText(/888/)).not.toBeInTheDocument()
    const glyph = screen.getByRole('img', { name: '红包：待领取' })
    expect(glyph.tagName.toLowerCase()).toBe('img')
    expect(glyph).toHaveAttribute('width', '34')
    expect(glyph).toHaveAttribute('height', '40')
  })

  it('keeps the contact identity compact, with a left avatar, bounded text and inset divider', () => {
    const { container } = card(createMessage('p2', { kind: 'contact', contactCard: { name: '联系人'.repeat(30), description: '描述'.repeat(60), avatarDataUrl: null } }), 'right')
    const avatar = screen.getByAltText('名片头像')
    const surface = container.querySelector<HTMLElement>('[data-card-kind="contact"]')!
    expect(surface).toHaveAttribute('data-side', 'right')
    expect(surface.querySelector('[data-card-tail]')).toBeInTheDocument()
    expect(avatar).toHaveStyle({ width: '36px', height: '36px' })
    expect(parseFloat(getComputedStyle(surface).paddingLeft)).toBeCloseTo(28 / 3, 2)
    expect(avatar.compareDocumentPosition(screen.getByText('联系人'.repeat(30))) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('联系人'.repeat(30))).toHaveStyle({ whiteSpace: 'nowrap', textOverflow: 'ellipsis' })
    expect(screen.getByText('描述'.repeat(60))).toHaveStyle({ whiteSpace: 'nowrap', textOverflow: 'ellipsis' })
    const caption = getComputedStyle(screen.getByText('个人名片'))
    expect(parseFloat(caption.fontSize)).toBeCloseTo(28 / 3, 2)
    expect(parseFloat(caption.top)).toBeCloseTo(-8 / 3, 2)
  })

  it.each(['left', 'right'] as const)('renders a local map with streets, blocks, park, water and a pin on the %s card', side => {
    const location = { name: '<b>城市公园</b>', address: '公园路一号'.repeat(30) }
    const { container } = card(createMessage('p2', { kind: 'location', location }), side)
    const surface = container.querySelector<HTMLElement>('[data-card-kind="location"]')!
    expect(surface).toHaveAttribute('data-side', side)
    expect(surface.querySelector('[data-card-tail]')).toBeInTheDocument()
    const map = screen.getByRole('img', { name: '离线位置示意图' })
    expect(map.tagName.toLowerCase()).toBe('svg')
    expect(map).toHaveAttribute('viewBox', '0 0 240 112')
    for (const feature of ['roads', 'blocks', 'park', 'water', 'pin']) expect(map.querySelector(`[data-map-layer="${feature}"]`)).toBeInTheDocument()
    expect(map.querySelector('image, foreignObject, a')).toBeNull()
    expect(within(surface).queryByText('离线位置示意图')).not.toBeInTheDocument()
    expect(screen.getByText(location.name)).toBeInTheDocument()
    expect(container.querySelector('b')).toBeNull()
    expect(screen.getByText(location.address)).toHaveStyle({ whiteSpace: 'nowrap', textOverflow: 'ellipsis' })
  })
})
