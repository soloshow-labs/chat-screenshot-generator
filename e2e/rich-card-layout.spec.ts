import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'

test('rich cards keep compact rows, aligned tails and a map preview in both themes and exported PNGs', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.evaluate(async () => {
    const samplePath = '/src/app/sampleDraft.ts', factoryPath = '/src/app/messageFactory.ts'
    const { SAMPLE_DRAFT } = await import(samplePath), { createMessage } = await import(factoryPath)
    const common = { sentAt: '2026-08-31T12:00:00+08:00', timeVisibility: 'hide' }
    const messages = [
      createMessage('p2', { ...common, kind: 'payment', side: 'left', payment: { mode: 'transfer', status: 'pending', amount: 88.8, note: '午餐费用' } }),
      createMessage('self', { ...common, kind: 'payment', side: 'right', payment: { mode: 'red-packet', status: 'pending', amount: 888, note: '恭喜发财，大吉大利' } }),
      createMessage('p2', { ...common, kind: 'contact', side: 'left', contactCard: { name: '林小满', description: '微信号：linxiaoman', avatarDataUrl: null } }),
      createMessage('self', { ...common, kind: 'location', side: 'right', location: { name: '世纪公园', address: '上海市浦东新区锦绣路1001号' } }),
      createMessage('p2', { ...common, kind: 'payment', side: 'left', payment: { mode: 'transfer', status: 'received', amount: 88.8, note: '午餐费用' } }),
      createMessage('self', { ...common, kind: 'payment', side: 'right', payment: { mode: 'red-packet', status: 'received', amount: 888, note: '恭喜发财，大吉大利' } }),
    ]
    localStorage.setItem('chat-screenshot-generator:draft:v1', JSON.stringify({ ...SAMPLE_DRAFT, title: '日常消息', conversationType: 'direct', messages, outputMode: 'long' }))
  })
  await page.reload()
  const canvas = page.getByTestId('chat-canvas')
  const payments = canvas.locator('[data-rich-kind="payment"]')
  await expect(payments).toHaveCount(4)
  await expect(payments.nth(0)).not.toContainText('待收款')
  await expect(payments.nth(1)).not.toContainText('待领取')
  await expect(payments.nth(2)).toContainText('已收款')
  await expect(payments.nth(2)).not.toContainText('午餐费用')
  await expect(payments.nth(3)).not.toContainText('888')
  const originals = payments.locator('img[data-payment-glyph]')
  await expect(originals).toHaveCount(4)
  await expect.poll(() => originals.evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalHeight === 120))).toBe(true)
  const referenceGeometry = await payments.evaluateAll(rows => rows.map(row => {
    const card = row.querySelector<HTMLElement>('[data-card-kind="payment"]')!
    const image = row.querySelector<HTMLImageElement>('img[data-payment-glyph]')!
    const box = card.getBoundingClientRect(), glyph = image.getBoundingClientRect()
    const text = image.nextElementSibling!.getBoundingClientRect()
    const scale = card.closest('[data-testid="chat-canvas"]')!.getBoundingClientRect().width / 430
    return { width: box.width / scale, height: box.height / scale, glyphWidth: glyph.width / scale, glyphHeight: glyph.height / scale, textInset: (text.left - box.left) / scale, naturalWidth: image.naturalWidth }
  }))
  for (const [index, geometry] of referenceGeometry.entries()) {
    expect(geometry.width).toBeCloseTo(700 / 3, 1)
    expect(geometry.height).toBeCloseTo(263 / 3, 1)
    expect(geometry.glyphWidth).toBeCloseTo(index % 2 === 0 ? 40 : 34, 1)
    expect(geometry.glyphHeight).toBeCloseTo(40, 1)
    expect(geometry.textInset).toBeCloseTo(index % 2 === 0 ? 188 / 3 : 179 / 3, 1)
    expect(geometry.naturalWidth).toBe(index % 2 === 0 ? 120 : 102)
  }
  const map = canvas.getByRole('img', { name: '离线位置示意图', exact: true })
  await expect(map).toHaveJSProperty('tagName', 'svg')

  for (const theme of ['浅色', '深色']) {
    await page.getByRole('button', { name: theme, exact: true }).click()
    const geometries = await payments.evaluateAll(rows => rows.map(row => {
      const card = row.querySelector('footer')!.parentElement!
      const tail = card.querySelector<HTMLElement>('[data-card-tail]')
      return { height: card.offsetHeight, tailWidth: tail?.offsetWidth ?? 0, overflow: getComputedStyle(card).overflow }
    }))
    for (const geometry of geometries) {
      expect(geometry.height).toBeLessThanOrEqual(94)
      expect(geometry.tailWidth).toBeGreaterThan(0)
      expect(geometry.overflow).toBe('visible')
    }
    const dimensions = await map.evaluate(element => {
      const rect = element.getBoundingClientRect(), canvas = element.closest('[data-testid="chat-canvas"]')!.getBoundingClientRect()
      return { width: rect.width / canvas.width * 430, height: rect.height / canvas.width * 430 }
    })
    expect(dimensions.width).toBeGreaterThan(200)
    expect(dimensions.height).toBeGreaterThanOrEqual(100)
    expect(dimensions.height).toBeLessThanOrEqual(125)
    const mapRegion = await map.evaluate(element => {
      const rect = element.getBoundingClientRect(), canvas = element.closest('[data-testid="chat-canvas"]')!.getBoundingClientRect()
      return { x: (rect.left - canvas.left) / canvas.width, y: (rect.top - canvas.top) / canvas.width, width: rect.width / canvas.width, height: rect.height / canvas.width }
    })
    const tailPoints = await payments.locator('[data-card-tail]').evaluateAll(tails => tails.map(tail => {
      const rect = tail.getBoundingClientRect(), canvas = tail.closest('[data-testid="chat-canvas"]')!.getBoundingClientRect()
      return { x: (rect.left + rect.width / 2 - canvas.left) / canvas.width, y: (rect.top + rect.height / 2 - canvas.top) / canvas.width }
    }))
    const foregroundRegions = await payments.evaluateAll(rows => rows.map(row => {
      const canvas = row.closest('[data-testid="chat-canvas"]')!.getBoundingClientRect()
      const glyph = row.querySelector('[data-payment-glyph]')!
      return [glyph, glyph.nextElementSibling!].map(element => {
        const rect = element.getBoundingClientRect()
        return { x: (rect.left - canvas.left) / canvas.width, y: (rect.top - canvas.top) / canvas.width, width: rect.width / canvas.width, height: rect.height / canvas.width }
      })
    }))
    const downloadEvent = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出 PNG', exact: true }).click()
    await page.getByRole('button', { name: '继续导出', exact: true }).click()
    const path = info.outputPath(`rich-cards-${theme}.png`)
    await (await downloadEvent).saveAs(path)
    const png = PNG.sync.read(readFileSync(path))
    expect(png.width).toBe(1290)
    expect(png.height).toBeGreaterThanOrEqual(2796)
    // These pixels are outside the card body: a clipped or wrong-side tail must fail.
    for (const [index, point] of tailPoints.entries()) {
      const offset = (Math.round(point.y * png.width) * png.width + Math.round(point.x * png.width)) * 4
      expect(Array.from(png.data.subarray(offset, offset + 4))).toEqual(index < 2 ? [249, 157, 59, 255] : [253, 225, 194, 255])
    }
    // Prove the exported SVG contains park, water and pin fills, not a blank/black placeholder.
    const colors = theme === '浅色' ? [[207, 229, 190], [172, 213, 229], [240, 82, 77]] : [[67, 91, 68], [53, 92, 109], [240, 82, 77]]
    const counts = [0, 0, 0]
    const x1 = Math.ceil(mapRegion.x * png.width), y1 = Math.ceil(mapRegion.y * png.width)
    const x2 = Math.floor((mapRegion.x + mapRegion.width) * png.width), y2 = Math.floor((mapRegion.y + mapRegion.height) * png.width)
    for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) {
      const offset = (y * png.width + x) * 4
      for (const [index, color] of colors.entries()) if (color.every((channel, c) => png.data[offset + c] === channel)) counts[index]++
    }
    for (const count of counts) expect(count).toBeGreaterThan(300)
    for (const [index, regions] of foregroundRegions.entries()) for (const [part, region] of regions.entries()) {
      const color = part === 1 ? [255, 255, 255] : index % 2 === 0 ? [254, 254, 254] : index === 1 ? [216, 60, 29] : [238, 123, 101]
      let count = 0
      for (let y = Math.ceil(region.y * png.width); y < Math.floor((region.y + region.height) * png.width); y++) {
        for (let x = Math.ceil(region.x * png.width); x < Math.floor((region.x + region.width) * png.width); x++) {
          const offset = (y * png.width + x) * 4
          if (color.every((channel, c) => png.data[offset + c] === channel)) count++
        }
      }
      expect(count, `${theme} payment ${index} ${part === 0 ? 'glyph' : 'text'} is painted`).toBeGreaterThan(80)
      if (part === 0) {
        // Original images are opaque; their top-left corner must blend into the card.
        const x = Math.ceil(region.x * png.width), y = Math.ceil(region.y * png.width)
        const offset = (y * png.width + x) * 4
        expect(Array.from(png.data.subarray(offset, offset + 4))).toEqual(index < 2 ? [249, 157, 59, 255] : [253, 225, 194, 255])
      }
    }
    await info.attach(`rich-cards-${theme}`, { path, contentType: 'image/png' })
  }
  expect(errors).toEqual([])
})

test('long names and addresses are truncated without stretching rich cards in a narrow workspace', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.getByLabel('消息 1 类型', { exact: true }).selectOption('contact')
  await page.getByLabel('消息 1 名片姓名', { exact: true }).fill('这是一个很长的联系人名称'.repeat(8))
  await page.getByLabel('消息 1 名片描述', { exact: true }).fill('微信号：very-long-contact-description'.repeat(8))
  await page.getByLabel('消息 2 类型', { exact: true }).selectOption('location')
  await page.getByLabel('消息 2 地点名称', { exact: true }).fill('这是一个很长的地点名称'.repeat(8))
  await page.getByLabel('消息 2 地点地址', { exact: true }).fill('上海市浦东新区锦绣路1001号'.repeat(8))
  const canvas = page.getByTestId('chat-canvas')
  const contact = canvas.locator('[data-rich-kind="contact"]')
  const location = canvas.locator('[data-rich-kind="location"]')
  const originalHeights = await contact.evaluate(row => ({
    card: row.querySelector('footer')!.parentElement!.offsetHeight,
    name: getComputedStyle(row.querySelector('strong')!).whiteSpace,
    description: getComputedStyle(row.querySelector('p')!).whiteSpace,
  }))
  expect(originalHeights.card).toBeLessThanOrEqual(100)
  expect(originalHeights.name).toBe('nowrap')
  expect(originalHeights.description).toBe('nowrap')
  const locationHeight = await location.evaluate(row => row.querySelector('[role="img"]')!.parentElement!.offsetHeight)
  expect(locationHeight).toBeLessThanOrEqual(185)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('tab', { name: '预览', exact: true }).click()
  // The workspace scales the preview; the approved chat layout remains 430px.
  await expect(canvas).toHaveCSS('width', '430px')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  const bounds = await canvas.evaluate(element => {
    const viewport = element.getBoundingClientRect()
    return Array.from(element.querySelectorAll('[data-rich-kind]')).map(row => {
      const card = row.querySelector('footer')?.parentElement ?? row.querySelector('[role="img"]')?.parentElement
      const rect = card!.getBoundingClientRect()
      return rect.left >= viewport.left && rect.right <= viewport.right
    })
  })
  expect(bounds).toEqual([true, true])
})
