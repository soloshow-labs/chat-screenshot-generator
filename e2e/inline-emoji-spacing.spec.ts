import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'

test('emoji spacing survives mixed lines, quotes and PNGs without changing ordinary bubbles', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.evaluate(async () => {
    const samplePath = '/src/app/sampleDraft.ts', factoryPath = '/src/app/messageFactory.ts'
    const { SAMPLE_DRAFT } = await import(samplePath), { createMessage } = await import(factoryPath)
    const common = { sentAt: '2026-08-31T12:00:00+08:00', timeVisibility: 'hide', side: 'left' }
    const messages = [
      createMessage('p2', { ...common, text: '你好世界' }),
      createMessage('p2', { ...common, text: '你好[微笑][捂脸]世界\n下一行[微笑]' }),
      createMessage('p2', { ...common, text: '[微笑]'.repeat(18) }),
      createMessage('self', { ...common, side: 'right', text: '回复', quote: { sourceMessageId: null, senderName: '小满', kind: 'text', text: '原文[微笑][捂脸]', media: null } }),
    ]
    localStorage.setItem('chat-screenshot-generator:draft:v1', JSON.stringify({ ...SAMPLE_DRAFT, conversationType: 'direct', theme: 'light', messages, outputMode: 'long' }))
  })
  await page.reload()
  const canvas = page.getByTestId('chat-canvas'), bubbles = canvas.locator('[data-message-bubble]')
  await expect(bubbles).toHaveCount(4)
  await canvas.evaluate(async element => {
    await document.fonts.ready
    await Promise.all([...element.querySelectorAll('img')].map(image => image.decode()))
  })
  const plain = await bubbles.nth(0).evaluate(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height, logicalHeight: (element as HTMLElement).offsetHeight, font: getComputedStyle(element).fontSize, lineHeight: getComputedStyle(element).lineHeight }))
  expect(plain.logicalHeight).toBe(41)
  expect([plain.font, plain.lineHeight]).toEqual(['17px', '21px'])

  const mixed = await bubbles.nth(1).evaluate(element => {
    const scale = element.closest('[data-testid="chat-canvas"]')!.getBoundingClientRect().width / 430
    const images = [...element.querySelectorAll('img')].map(image => image.getBoundingClientRect())
    return { gap: (images[1].left - images[0].right) / scale, sizes: images.map(rect => rect.width / scale), lineStep: (images[2].top - images[0].top) / scale }
  })
  expect(mixed.gap).toBeCloseTo(2.666, 1)
  for (const size of mixed.sizes) expect(size).toBeCloseTo(20, 1)
  expect(mixed.lineStep).toBeGreaterThanOrEqual(21)
  expect(mixed.lineStep).toBeLessThanOrEqual(25)
  const quote = canvas.locator('[data-quote-preview]')
  const small = await quote.evaluate(element => {
    const scale = element.closest('[data-testid="chat-canvas"]')!.getBoundingClientRect().width / 430
    const [first, second] = [...element.querySelectorAll('img')].map(image => image.getBoundingClientRect())
    return { size: first.width / scale, gap: (second.left - first.right) / scale }
  })
  expect(small.size).toBeCloseTo(16, 1)
  expect(small.gap).toBeCloseTo(2, 1)
  const wrapped = await bubbles.nth(2).evaluate(element => [...element.querySelectorAll('img')].map(image => Math.round(image.getBoundingClientRect().top)))
  expect(new Set(wrapped).size).toBeGreaterThan(1)
  const images = canvas.locator('img[data-inline-emoji]')
  await expect(images).toHaveCount(23)
  expect(await images.evaluateAll(elements => elements.every(image => {
    const frame = image.closest('[data-message-bubble], [data-quote-preview]')!.getBoundingClientRect(), rect = image.getBoundingClientRect()
    return rect.left >= frame.left && rect.right <= frame.right && rect.top >= frame.top && rect.bottom <= frame.bottom
  }))).toBe(true)

  for (const theme of ['浅色', '深色']) {
    await page.getByRole('button', { name: theme, exact: true }).click()
    const after = await bubbles.nth(0).evaluate(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }))
    expect(after).toEqual({ width: plain.width, height: plain.height })
    const regions = await images.evaluateAll(elements => elements.map(image => {
      const rect = image.getBoundingClientRect(), canvas = image.closest('[data-testid="chat-canvas"]')!.getBoundingClientRect()
      return { x: (rect.left - canvas.left) / canvas.width, y: (rect.top - canvas.top) / canvas.width, width: rect.width / canvas.width, height: rect.height / canvas.width }
    }))
    const downloaded = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出 PNG', exact: true }).click()
    await page.getByRole('button', { name: '继续导出', exact: true }).click()
    const path = info.outputPath(`inline-spacing-${theme}.png`)
    await (await downloaded).saveAs(path)
    const png = PNG.sync.read(readFileSync(path))
    expect(png.width).toBe(1290)
    for (const rect of regions) {
      let colored = 0
      for (let y = Math.ceil(rect.y * png.width); y < Math.floor((rect.y + rect.height) * png.width); y++) for (let x = Math.ceil(rect.x * png.width); x < Math.floor((rect.x + rect.width) * png.width); x++) {
        const i = (y * png.width + x) * 4
        if (png.data[i] > 180 && png.data[i + 1] > 90 && png.data[i + 2] < 120) colored++
      }
      expect(colored).toBeGreaterThan(40)
    }
    await info.attach(`inline-spacing-${theme}`, { path, contentType: 'image/png' })
  }
  expect(errors).toEqual([])
})
