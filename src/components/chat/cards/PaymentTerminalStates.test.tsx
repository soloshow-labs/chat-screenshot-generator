import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { PaymentCard } from './PaymentCard'
import { PaymentGlyph } from './PaymentGlyph'

it.each([
  ['refunded', '已退还', 'M7.26862907,9.20000005 L8.6769553,10.6083263'],
  ['expired', '已过期', 'M9.34082031,4.43115234 L10.6591797,4.43115234'],
] as const)('uses the reference filled-path %s transfer glyph in its original 24-unit viewport', (status, label, identifyingPath) => {
  render(<PaymentGlyph mode="transfer" status={status} label={`转账：${label}`} />)
  const glyph = screen.getByRole('img', { name: `转账：${label}` })
  expect(glyph).toHaveAttribute('viewBox', '0 0 24 24')
  expect(glyph).toHaveAttribute('width', '40')
  expect(glyph).toHaveAttribute('height', '40')
  expect(glyph.querySelector('circle')).toBeNull()
  expect(glyph.querySelectorAll('path')).toHaveLength(1)
  const path = glyph.querySelector('path')!
  expect(path).toHaveAttribute('fill-rule', 'evenodd')
  expect(path.getAttribute('d')).toContain(identifyingPath)
  expect(path.closest('[transform]')?.getAttribute('transform')).toMatch(/^translate\(\s*2(?:\.0+)?(?:,\s*|\s+)2(?:\.0+)?\s*\)$/)
  expect(glyph.getAttribute('stroke')).not.toBe('currentColor')
})

it('renders an expired red packet as an accessible closed-envelope image, not the compatibility X coin', () => {
  render(<PaymentGlyph mode="red-packet" status="expired" label="红包：已过期" />)
  const glyph = screen.getByRole('img', { name: '红包：已过期' })
  expect(glyph.tagName.toLowerCase()).toBe('img')
  expect(glyph).toHaveAttribute('width', '34')
  expect(glyph).toHaveAttribute('height', '40')
  expect(glyph.getAttribute('src')).not.toMatch(/^https?:/)
  expect(glyph.querySelector('[data-envelope-seal]')).toBeNull()
})

it.each([
  ['transfer', 'refunded', '已退还', 'none'],
  ['transfer', 'expired', '已过期', 'saturate(0.6)'],
  ['red-packet', 'expired', '已过期', 'none'],
] as const)('keeps %s %s on the terminal pale surface with a mode-specific whole-card filter', (mode, status, label, filter) => {
  const { container } = render(<PaymentCard payment={{ mode, status, amount: 88.8, note: '保留备注' }} side="left" />)
  const card = container.firstElementChild as HTMLElement
  expect(getComputedStyle(card).backgroundColor).toBe('rgb(253, 225, 196)')
  expect(getComputedStyle(card).filter || 'none').toBe(filter)
  const footer = card.querySelector('footer')!
  expect(getComputedStyle(footer).backgroundColor).toBe('rgb(253, 225, 196)')
  expect(screen.getByText(label)).toBeInTheDocument()
  if (mode === 'transfer') expect(screen.getByText('¥88.80')).toBeInTheDocument()
  else expect(screen.queryByText('¥88.80')).not.toBeInTheDocument()
})

it.each([['pending', 'rgb(249, 157, 59)'], ['received', 'rgb(253, 225, 194)']] as const)('does not recolor or desaturate the existing %s reference states', (status, color) => {
  const { container } = render(<PaymentCard payment={{ mode: 'transfer', status, amount: 1, note: '' }} side="right" />)
  expect(getComputedStyle(container.firstElementChild!).backgroundColor).toBe(color)
  expect(getComputedStyle(container.firstElementChild!).filter || 'none').toBe('none')
})
