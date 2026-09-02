import { expect, test } from '@playwright/test'
import { PNG } from 'pngjs'

test('rejects oversized long PNGs instead of silently downscaling the requested width', async ({ page }) => {
  await page.goto('/')
  const outcome = await page.evaluate(async () => {
    const modulePath = '/src/services/exportChatImage.ts'
    const { exportChatImage } = await import(modulePath)
    const node = document.createElement('div')
    node.style.cssText = 'width:430px;height:6000px;background:#95ec69'
    document.body.append(node)
    try {
      const result = await exportChatImage(node, '过长', { outputMode: 'long', outputWidth: 430, outputHeight: 932, exportScale: 3 })
      const image = new Image()
      image.src = result.dataUrl
      await image.decode()
      return { error: '', width: image.naturalWidth, height: image.naturalHeight }
    } catch (error) {
      return { error: String(error), width: 0, height: 0 }
    } finally { node.remove() }
  })
  expect(outcome.error).toContain('16384')
  expect(outcome.error).toContain('倍率')
})

test('screen export freezes the visible scroll position in PNG pixels and restores it on failure', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('消息 2 内容', { exact: true }).fill('用于滚动的消息\n'.repeat(50))
  const images = await page.getByTestId('chat-canvas').evaluate(async element => {
    const modulePath = '/src/services/exportChatImage.ts'
    const { exportChatImage } = await import(modulePath)
    const list = element.querySelector('[data-testid="message-list"]') as HTMLElement
    const options = { outputMode: 'screen', outputWidth: 430, outputHeight: 932, exportScale: 1 }
    const top = (await exportChatImage(element, 'top', options)).dataUrl
    list.scrollTop = 180
    list.dispatchEvent(new Event('scroll', { bubbles: true }))
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const scrolled = (await exportChatImage(element, 'scrolled', options)).dataUrl
    const afterSuccess = list.scrollTop
    try { await exportChatImage(element, 'failure', options, async () => { throw new Error('render failure') }) } catch { /* verify restoration below */ }
    return { top, scrolled, afterSuccess, afterFailure: list.scrollTop }
  })
  expect(images.afterSuccess).toBe(180)
  expect(images.afterFailure).toBe(180)
  const first = PNG.sync.read(Buffer.from(images.top.split(',')[1], 'base64'))
  const second = PNG.sync.read(Buffer.from(images.scrolled.split(',')[1], 'base64'))
  expect(second.width).toBe(430)
  expect(second.height).toBe(932)
  const region = (png: PNG, from: number, to: number) => png.data.subarray(from * 430 * 4, to * 430 * 4)
  const expectStableChromePaint = (actual: Buffer, expected: Buffer) => {
    let changedPixels = 0, maxDelta = 0
    for (let offset = 0; offset < actual.length; offset += 4) {
      let changed = false
      for (let channel = 0; channel < 4; channel++) {
        const delta = Math.abs(actual[offset + channel] - expected[offset + channel])
        if (delta) changed = true
        maxDelta = Math.max(maxDelta, delta)
      }
      if (changed) changedPixels++
    }
    // Chrome may repaint a few antialiased text-edge pixels differently
    // between two html-to-image captures. A shifted region changes far more.
    expect(changedPixels).toBeLessThanOrEqual(Math.ceil(actual.length / 4_000))
    expect(maxDelta).toBeLessThanOrEqual(16)
  }
  expectStableChromePaint(region(second, 0, 98), region(first, 0, 98))
  expectStableChromePaint(region(second, 842, 932), region(first, 842, 932))
  expect(region(second, 98, 600)).not.toEqual(region(first, 98, 600))
})

test('short screen capture lays out the footer inside the image and restores preview after success and failure', async ({ page }) => {
  await page.goto('/')
  const geometry = await page.getByTestId('chat-canvas').evaluate(async element => {
    const modulePath = '/src/services/exportChatImage.ts'
    const { exportChatImage } = await import(modulePath)
    const node = element as HTMLElement
    const measure = () => ({ height: node.offsetHeight, footerBottom: node.querySelector('[aria-label="聊天输入栏"]')!.getBoundingClientRect().bottom - node.getBoundingClientRect().top })
    const before = measure()
    let capture = before
    await exportChatImage(node, '短截图', { outputMode: 'screen', outputWidth: 430, outputHeight: 480, exportScale: 1 }, async () => { capture = measure(); return 'data:image/png;base64,' })
    const after = measure()
    try { await exportChatImage(node, '短截图', { outputMode: 'screen', outputWidth: 430, outputHeight: 480, exportScale: 1 }, async () => { throw new Error('render failed') }) } catch { /* restoration is the assertion */ }
    return { before, capture, after, failed: measure() }
  })
  expect(geometry.before.height).toBe(932)
  expect(geometry.capture.height).toBe(480)
  expect(geometry.capture.footerBottom).toBeLessThanOrEqual(480)
  expect(geometry.capture.footerBottom).toBeGreaterThan(400)
  expect(geometry.after).toEqual(geometry.before)
  expect(geometry.failed).toEqual(geometry.before)
})

test('image viewer stays outside export geometry and PNG pixels, with readable close and Escape', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('消息 1 类型', { exact: true }).selectOption('image')
  await page.getByLabel('消息 1 上传图片', { exact: true }).setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG.sync.write({ width: 2, height: 2, data: Buffer.alloc(16, 255) }) })
  const canvas = page.getByTestId('chat-canvas')
  const render = () => canvas.evaluate(async element => {
    const modulePath = '/src/services/exportChatImage.ts'
    const { exportChatImage } = await import(modulePath)
    return (await exportChatImage(element, '图片预览', { outputMode: 'screen', outputWidth: 430, outputHeight: 932, exportScale: 1 })).dataUrl
  })
  await expect(canvas.getByRole('button', { name: '查看原图' })).toBeVisible()
  const closedPng = await render()
  await canvas.getByRole('button', { name: '查看原图' }).click()
  await expect(page.getByRole('dialog', { name: '原图预览' })).toBeVisible()
  await expect(canvas.getByRole('dialog')).toHaveCount(0)
  expect(await page.getByRole('button', { name: '关闭原图', exact: true }).evaluate(node => getComputedStyle(node).color)).toBe('rgb(255, 255, 255)')
  expect(await render()).toBe(closedPng)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: '原图预览' })).toHaveCount(0)
  await canvas.getByRole('button', { name: '查看原图' }).click()
  await page.getByRole('button', { name: '关闭原图', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '原图预览' })).toHaveCount(0)
})
