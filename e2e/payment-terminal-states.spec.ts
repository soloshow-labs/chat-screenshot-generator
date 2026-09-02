import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'

async function settings(page: Page) {
  const tab = page.getByRole('tab', { name: '设置', exact: true })
  if (await tab.isVisible()) await tab.click()
}

async function topAction(page: Page, name: string) {
  const action = page.getByRole('button', { name, exact: true })
  if (!await action.isVisible()) await page.getByText('更多操作', { exact: true }).click()
  await action.click()
}

async function exportPng(page: Page, info: TestInfo, name: string) {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 PNG', exact: true }).click()
  await page.getByRole('button', { name: '继续导出', exact: true }).click()
  const path = info.outputPath(`${name}.png`)
  await (await download).saveAs(path)
  await info.attach(name, { path, contentType: 'image/png' })
  return PNG.sync.read(readFileSync(path))
}

function pixel(png: PNG, x: number, y: number) {
  const offset = (Math.floor(y * png.width) * png.width + Math.floor(x * png.width)) * 4
  return [...png.data.subarray(offset, offset + 4)]
}

for (const width of [1440, 390]) {
  test(`terminal payment graphics and whole-card colors survive undo and real PNG capture at ${width}px`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (['warning', 'error'].includes(message.type())) errors.push(message.text()) })
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/')
    await expect(page).toHaveTitle('聊天截图生成器')
    await page.evaluate(async () => {
      const samplePath = '/src/app/sampleDraft.ts', factoryPath = '/src/app/messageFactory.ts'
      const { SAMPLE_DRAFT } = await import(samplePath), { createMessage } = await import(factoryPath)
      const common = { sentAt: '2026-08-31T10:00:00+08:00', timeVisibility: 'hide' }
      const messages = []
      for (const [mode, status] of [['transfer', 'refunded'], ['transfer', 'expired'], ['red-packet', 'expired']]) {
        for (const side of ['left', 'right']) messages.push(createMessage(side === 'left' ? 'p2' : 'self', {
          ...common, kind: 'payment', side, payment: { mode, status, amount: 88.8, note: '终态备注' },
        }))
      }
      for (let i = 0; i < 8; i++) messages.push(createMessage('p2', { ...common, text: `长图内容 ${i + 1}` }))
      localStorage.setItem('chat-screenshot-generator:draft:v1', JSON.stringify({ ...SAMPLE_DRAFT, title: '终态卡片验证', conversationType: 'direct', messages, outputMode: 'screen' }))
    })
    await page.reload()
    const canvas = page.getByTestId('chat-canvas'), cards = canvas.locator('[data-card-kind="payment"]')
    await expect(cards).toHaveCount(6)
    const messageTab = page.getByRole('tab', { name: '消息', exact: true })
    if (await messageTab.isVisible()) await messageTab.click()
    // Each mutation is followed directly by undo, without depending on history debounce timing.
    for (const [number, expected] of [[1, 'refunded'], [3, 'expired'], [5, 'expired']] as const) {
      const redPacket = number === 5
      const status = page.getByLabel(`消息 ${number} 支付状态`, { exact: true })
      await status.selectOption('pending')
      await expect(cards.nth(number - 1)).toHaveAttribute('data-payment-status', 'pending')
      await topAction(page, '撤销')
      await expect(status).toHaveValue(expected)
      await expect(cards.nth(number - 1)).toHaveAttribute('data-payment-status', expected)
      await expect(page.getByLabel(`消息 ${number} ${redPacket ? '红包祝福语' : '转账备注'}`, { exact: true })).toHaveValue('终态备注')
      await expect(page.getByLabel(`消息 ${number} ${redPacket ? '金额（红包截图不显示）' : '金额'}`, { exact: true })).toHaveValue('88.8')
    }

    for (const theme of ['浅色', '深色']) for (const mode of ['手机屏幕', '聊天长图']) {
      await settings(page)
      await page.getByRole('button', { name: theme, exact: true }).click()
      await page.getByRole('button', { name: mode, exact: true }).click()
      const previewTab = page.getByRole('tab', { name: '预览', exact: true })
      if (await previewTab.isVisible()) await previewTab.click()
      await canvas.locator('img').evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode())))
      const metrics = await cards.evaluateAll(elements => elements.map(card => {
        const root = card.closest('[data-testid="chat-canvas"]')!.getBoundingClientRect(), bounds = card.getBoundingClientRect()
        const glyph = card.querySelector<HTMLElement>('[data-payment-glyph]')!, g = glyph.getBoundingClientRect()
        const tail = card.querySelector<HTMLElement>('[data-card-tail]')!.getBoundingClientRect()
        const footer = card.querySelector('footer')!.getBoundingClientRect()
        const path = glyph.querySelector('path')
        const ink = glyph.tagName.toLowerCase() === 'svg' ? (glyph as unknown as SVGSVGElement).getBBox() : null
        return {
          side: card.getAttribute('data-side'), tag: glyph.tagName.toLowerCase(), viewBox: glyph.getAttribute('viewBox'),
          fill: path ? getComputedStyle(path).fill : null, stroke: path ? getComputedStyle(path).stroke : null,
          color: getComputedStyle(card).backgroundColor, filter: getComputedStyle(card).filter,
          glyphWidth: g.width / root.width * 430, glyphHeight: g.height / root.width * 430,
          inkWidth: ink ? ink.width : null, inkHeight: ink ? ink.height : null,
          natural: glyph instanceof HTMLImageElement ? [glyph.naturalWidth, glyph.naturalHeight] : null,
          region: { x: (g.left - root.left) / root.width, y: (g.top - root.top) / root.width, width: g.width / root.width, height: g.height / root.width },
          points: [[bounds.right - 6 * root.width / 430, bounds.top + 6 * root.width / 430], [footer.right - 6 * root.width / 430, footer.bottom - 6 * root.width / 430], [tail.left + tail.width / 2, tail.top + tail.height / 2]].map(([x, y]) => ({ x: (x - root.left) / root.width, y: (y - root.top) / root.width })),
        }
      }))
      await info.attach(`${theme}-${mode}-${width}-metrics`, { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' })
      for (const [index, metric] of metrics.entries()) {
        expect.soft(metric.side).toBe(index % 2 === 0 ? 'left' : 'right')
        expect.soft(metric.color).toBe('rgb(253, 225, 196)')
        expect.soft(metric.filter).toBe(index === 2 || index === 3 ? 'saturate(0.6)' : 'none')
        expect.soft(metric.glyphWidth).toBeCloseTo(index < 4 ? 40 : 34, 1)
        expect.soft(metric.glyphHeight).toBeCloseTo(40, 1)
        if (index < 4) {
          expect.soft(metric.tag).toBe('svg')
          expect.soft(metric.viewBox).toBe('0 0 24 24')
          expect.soft(metric.inkWidth).toBeCloseTo(20, 3)
          expect.soft(metric.inkHeight).toBeCloseTo(20, 3)
          expect.soft(metric.fill).toBe('rgb(255, 255, 255)')
          expect.soft(metric.stroke).toBe('none')
        } else {
          expect.soft(metric.tag).toBe('img')
          expect.soft(metric.natural).toEqual([102, 120])
        }
      }
      const png = await exportPng(page, info, `terminal-${theme}-${mode}-${width}`)
      expect(png.width).toBe(1290)
      if (mode === '手机屏幕') expect(png.height).toBe(2796)
      else expect(png.height).toBeGreaterThan(2796)
      for (const [index, metric] of metrics.entries()) {
        const expected = index === 2 || index === 3 ? [243, 227, 209, 255] : [253, 225, 196, 255]
        // Body, footer and protruding tail must all receive the same whole-card filter.
        for (const point of metric.points) {
          const actual = pixel(png, point.x, point.y)
          for (let channel = 0; channel < 4; channel++) expect.soft(Math.abs(actual[channel] - expected[channel])).toBeLessThanOrEqual(1)
        }
        let white = 0, closedRed = 0, orangeTile = 0
        const region = metric.region
        for (let y = Math.ceil(region.y * png.width); y < Math.floor((region.y + region.height) * png.width); y++) for (let x = Math.ceil(region.x * png.width); x < Math.floor((region.x + region.width) * png.width); x++) {
          const offset = (y * png.width + x) * 4, [r, g, b] = png.data.subarray(offset, offset + 3)
          if (r > 248 && g > 248 && b > 248) white++
          if (r === 216 && g === 60 && b === 29) closedRed++
          if (r === 249 && g === 157 && b === 59) orangeTile++
        }
        if (index < 4) expect.soft(white, 'terminal transfer glyph is painted').toBeGreaterThan(100)
        else {
          expect.soft(closedRed, 'closed red envelope artwork is painted, not the X coin').toBeGreaterThan(100)
          // Chrome's image scaling can preserve a couple of exact source-color
          // edge pixels. A visible unmasked tile would contribute thousands.
          expect.soft(orangeTile, 'no visible orange tile remains on the pale expired envelope').toBeLessThan(10)
          for (const [x, y] of [[region.x, region.y], [region.x + region.width - 1 / png.width, region.y], [region.x, region.y + region.height - 1 / png.width]]) {
            const corner = pixel(png, x, y)
            for (let c = 0; c < 4; c++) expect.soft(Math.abs(corner[c] - expected[c]), 'envelope corners blend into the terminal card').toBeLessThanOrEqual(1)
          }
        }
      }
      await expect(page.locator('vite-error-overlay')).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.screenshot({ path: info.outputPath(`terminal-workspace-${theme}-${mode}-${width}.png`) })
    }
    expect(errors).toEqual([])
  })
}
