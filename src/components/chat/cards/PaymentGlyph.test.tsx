import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { PaymentGlyph } from './PaymentGlyph'

it.each([
  ['transfer', 'pending', '转账：待收款', 1, 40, 120, '649f3379e5e6d6044eadd388f0d14ffbdc89cc3ed91aab4fc51f54273822be1f'],
  ['transfer', 'received', '转账：已收款', 2, 40, 120, 'f5f2e25470169d1e0a99ed0455f37824234e80fb2ad3ceb4704e0d4e2534053f'],
  ['red-packet', 'pending', '红包：待领取', 3, 34, 102, '6f11c803a0d1de85ffea149074dfc7bcd075549e1b0c76c6b47766f7d57b5485'],
  ['red-packet', 'received', '红包：已领取', 4, 34, 102, 'ca9973fd724464f679987c3fb93a4284126a5ba475a4acfff6dcc849211926c3'],
] as const)('renders %s %s from the unchanged reference PNG with its accessible state', (mode, status, label, assetId, width, naturalWidth, sha256) => {
  render(<PaymentGlyph mode={mode} status={status} label={label} />)
  const glyph = screen.getByRole('img', { name: label })
  expect(glyph.tagName.toLowerCase()).toBe('img')
  expect(glyph).toHaveAttribute('alt', label)
  expect(glyph).toHaveAttribute('data-payment-glyph')
  expect(glyph).toHaveAttribute('data-payment-mode', mode)
  expect(glyph).toHaveAttribute('width', String(width))
  expect(glyph).toHaveAttribute('height', '40')
  expect(glyph).toHaveAttribute('draggable', 'false')
  expect(glyph.getAttribute('src')).toMatch(new RegExp(`wechat-trans-icon${assetId}\\.png(?:\\?|$)`))
  expect(glyph.getAttribute('src')).not.toMatch(/^(https?:|data:)/)
  const bytes = readFileSync(resolve('src/components/chat/cards/assets', `wechat-trans-icon${assetId}.png`))
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha256)
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  expect(bytes.readUInt32BE(16)).toBe(naturalWidth)
  expect(bytes.readUInt32BE(20)).toBe(120)
})

it.each([
  ['refunded', '6e6abf28a342db707faa38f1d54d68225e96d59aafa183ceea082965ef5090fc'],
  ['expired', '0517d9bd5f89cfe07541fd3745de1ed89eb40a6eefa7da5beadc5a858a44c29b'],
] as const)('preserves the original official %s outline path byte for byte', (status, sha256) => {
  render(<PaymentGlyph mode="transfer" status={status} label="转账图形" />)
  const path = screen.getByRole('img', { name: '转账图形' }).querySelector('path')!
  expect(createHash('sha256').update(path.getAttribute('d')!).digest('hex')).toBe(sha256)
  expect(path).toHaveAttribute('transform', 'translate(2 2)')
  expect(path).toHaveAttribute('fill', '#fff')
})

it('preserves the existing refunded red packet compatibility SVG without claiming a reference asset', () => {
  const mode = 'red-packet', status = 'refunded', label = '红包：已退还'
  render(<PaymentGlyph mode={mode} status={status} label={label} />)
  const glyph = screen.getByRole('img', { name: label })
  expect(glyph.tagName.toLowerCase()).toBe('svg')
  expect(glyph).toHaveAttribute('data-payment-glyph')
  expect(glyph).toHaveAttribute('data-payment-mode', mode)
  expect(glyph).toHaveAttribute('data-payment-renderer', 'compatibility-svg')
  expect(glyph.querySelector('path')).not.toBeNull()
})
