import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'

async function downloadPng(page: Page, info: TestInfo, filename: string) {
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 PNG', exact: true }).click()
  await page.getByRole('button', { name: '继续导出', exact: true }).click()
  const path = info.outputPath(filename)
  await (await event).saveAs(path)
  await info.attach(filename, { path, contentType: 'image/png' })
  return PNG.sync.read(readFileSync(path))
}

test('all payment modes/statuses retain their artwork and handled colors in left/right light/dark PNGs', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.evaluate(async () => {
    const samplePath = '/src/app/sampleDraft.ts', factoryPath = '/src/app/messageFactory.ts'
    const { SAMPLE_DRAFT } = await import(samplePath), { createMessage } = await import(factoryPath)
    const messages = []
    for (const mode of ['transfer', 'red-packet']) for (const status of ['pending', 'received', 'refunded', 'expired']) for (const side of ['left', 'right']) {
      messages.push(createMessage(side === 'left' ? 'p2' : 'self', { kind: 'payment', side, sentAt: '2026-08-31T10:00:00+08:00', timeVisibility: 'hide', payment: { mode, status, amount: 88.8, note: mode === 'transfer' ? '餐费' : '生日快乐' } }))
    }
    localStorage.setItem('chat-screenshot-generator:draft:v1', JSON.stringify({ ...SAMPLE_DRAFT, title: '卡片状态矩阵', messages, outputMode: 'long' }))
  })
  await page.reload()
  const canvas = page.getByTestId('chat-canvas'), rows = canvas.locator('[data-rich-kind="payment"]')
  await expect(rows).toHaveCount(16)
  for (const [mode, prefix] of [['transfer', '转账'], ['red-packet', '红包']]) {
    for (const label of [mode === 'transfer' ? '待收款' : '待领取', mode === 'transfer' ? '已收款' : '已领取', '已退还', '已过期']) {
      await expect(canvas.getByRole('img', { name: `${prefix}：${label}`, exact: true })).toHaveCount(2)
    }
  }
  for (let index = 8; index < 16; index++) await expect(rows.nth(index)).not.toContainText('88.80')
  await expect(rows.first()).toContainText('¥88.80')
  for (const [theme, pendingColor, handledColor] of [['浅色', 'rgb(249, 157, 59)', 'rgb(253, 225, 194)'], ['深色', 'rgb(249, 157, 59)', 'rgb(253, 225, 194)']]) {
    await page.getByRole('button', { name: theme, exact: true }).click()
    const samples = await rows.evaluateAll(elements => [0, 2].map(index => {
      const card = elements[index].querySelector('footer')!.parentElement!
      const rect = card.getBoundingClientRect(), canvas = card.closest('[data-testid="chat-canvas"]')!.getBoundingClientRect()
      return { color: getComputedStyle(card).backgroundColor, width: card.offsetWidth, x: (rect.right - 5 * canvas.width / 430 - canvas.left) / canvas.width, y: (rect.top + 10 * canvas.width / 430 - canvas.top) / canvas.width }
    }))
    expect(samples.map(sample => sample.width)).toEqual([233, 233])
    expect(samples.map(sample => sample.color)).toEqual([pendingColor, handledColor])
    const png = await downloadPng(page, info, `cards-${theme}-long.png`)
    expect(png.width).toBe(1290)
    expect(png.height).toBeGreaterThan(2796)
    for (const sample of samples) {
      const offset = (Math.round(sample.y * png.width) * png.width + Math.round(sample.x * png.width)) * 4
      const rgb = sample.color.match(/\d+/g)!.map(Number)
      expect(Array.from(png.data.subarray(offset, offset + 4))).toEqual([...rgb, 255])
    }
    await page.getByRole('button', { name: '手机屏幕', exact: true }).click()
    const screen = await downloadPng(page, info, `cards-${theme}-screen.png`)
    expect([screen.width, screen.height]).toEqual([1290, 2796])
    await page.getByRole('button', { name: '聊天长图', exact: true }).click()
  }
  await page.screenshot({ path: info.outputPath('payment-matrix-workspace.png') })
})

test('file card downloads real bytes and expired state disables it; contact avatar is left and video plays outside PNG', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.evaluate(async () => {
    const path = '/src/app/sampleDraft.ts', { SAMPLE_DRAFT } = await import(path)
    localStorage.setItem('chat-screenshot-generator:draft:v1', JSON.stringify({ ...SAMPLE_DRAFT, title: '附件名片视频', messages: SAMPLE_DRAFT.messages.slice(0, 3) }))
  })
  await page.reload()
  const canvas = page.getByTestId('chat-canvas')
  await page.getByLabel('消息 1 类型', { exact: true }).selectOption('file')
  await page.getByLabel('消息 1 上传文件', { exact: true }).setInputFiles({ name: 'report.pdf', mimeType: 'application/pdf', buffer: Buffer.from('synthetic attachment bytes') })
  const fileCard = canvas.getByRole('link', { name: '下载文件', exact: true })
  await expect(fileCard).toContainText('report.pdf')
  await expect(fileCard).toContainText('26 B')
  await expect(fileCard.getByText('下载文件', { exact: true })).toHaveCount(0)
  const downloadEvent = page.waitForEvent('download')
  await fileCard.click()
  const attachment = await downloadEvent, filePath = info.outputPath('downloaded-report.pdf')
  await attachment.saveAs(filePath)
  expect(readFileSync(filePath, 'utf8')).toBe('synthetic attachment bytes')
  await page.getByLabel('消息 1 文件已过期', { exact: true }).check()
  await expect(fileCard).toHaveCount(0)
  await expect(canvas).toContainText('文件已过期')

  await page.getByLabel('消息 2 类型', { exact: true }).selectOption('contact')
  await page.getByLabel('消息 2 名片姓名', { exact: true }).fill('联系人小林')
  await page.getByLabel('消息 2 名片描述', { exact: true }).fill('设计师')
  const avatarBox = await canvas.getByRole('img', { name: '名片头像', exact: true }).boundingBox()
  const nameBox = await canvas.getByText('联系人小林', { exact: true }).boundingBox()
  expect(avatarBox!.x + avatarBox!.width).toBeLessThan(nameBox!.x)
  await expect(canvas).toContainText('个人名片')

  const videoBytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180
    const context = canvas.getContext('2d')!; context.fillStyle = '#147dad'; context.fillRect(0, 0, 320, 180)
    const stream = canvas.captureStream(10), recorder = new MediaRecorder(stream, { mimeType: 'video/webm' }), chunks: Blob[] = []
    recorder.ondataavailable = event => chunks.push(event.data)
    const done = new Promise<void>(resolve => { recorder.onstop = () => resolve() })
    recorder.start(); await new Promise(resolve => setTimeout(resolve, 350)); recorder.stop(); await done
    stream.getTracks().forEach(track => track.stop())
    return Array.from(new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer()))
  })
  await page.getByLabel('消息 3 类型', { exact: true }).selectOption('video')
  await page.getByLabel('消息 3 上传视频', { exact: true }).setInputFiles({ name: 'synthetic.webm', mimeType: 'video/webm', buffer: Buffer.from(videoBytes) })
  const play = canvas.getByRole('button', { name: '播放视频', exact: true })
  await expect(play).toBeEnabled()
  await page.getByLabel('消息 3 视频时长（秒）', { exact: true }).fill('65')
  await expect(play).toContainText('1:05')
  const posterData = Buffer.alloc(80 * 80 * 4)
  for (let index = 0; index < posterData.length; index += 4) posterData.set([22, 162, 214, 255], index)
  await page.getByLabel('消息 3 上传视频封面', { exact: true }).setInputFiles({ name: 'manual-cover.png', mimeType: 'image/png', buffer: PNG.sync.write({ width: 80, height: 80, data: posterData }) })
  const poster = play.getByRole('img', { name: '视频封面', exact: true })
  await expect.poll(() => poster.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
  const size = await play.evaluate(element => ({ width: (element as HTMLElement).offsetWidth, height: (element as HTMLElement).offsetHeight, padding: getComputedStyle(element).padding }))
  expect(size.width).toBe(220); expect(Math.abs(size.height - 123.75)).toBeLessThan(1); expect(size.padding).toBe('0px')
  await play.click()
  const dialog = page.getByRole('dialog', { name: '视频播放' })
  await expect(dialog).toBeVisible()
  await expect(canvas.getByRole('dialog')).toHaveCount(0)
  await expect.poll(() => dialog.locator('video').evaluate((video: HTMLVideoElement) => video.readyState >= 2)).toBe(true)
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: '关闭视频', exact: true }).click()
  await page.getByRole('button', { name: '聊天长图', exact: true }).click()
  for (const theme of ['浅色', '深色']) {
    await page.getByRole('button', { name: theme, exact: true }).click()
    const posterPoint = await poster.evaluate(image => {
      const rect = image.getBoundingClientRect(), canvas = image.closest('[data-testid="chat-canvas"]')!.getBoundingClientRect()
      return { x: (rect.x + rect.width * .2 - canvas.x) / canvas.width, y: (rect.y + rect.height * .2 - canvas.y) / canvas.width }
    })
    const png = await downloadPng(page, info, `file-contact-video-${theme}.png`)
    expect(png.width).toBe(1290)
    const pixelIndex = (Math.round(posterPoint.y * png.width) * png.width + Math.round(posterPoint.x * png.width)) * 4
    const pixel = Array.from(png.data.subarray(pixelIndex, pixelIndex + 4))
    // Avatar/cover encoding is lossy WebP; allow small color drift, not a blank cover.
    expect(Math.abs(pixel[0] - 22)).toBeLessThan(12)
    expect(Math.abs(pixel[1] - 162)).toBeLessThan(12)
    expect(Math.abs(pixel[2] - 214)).toBeLessThan(12)
    expect(pixel[3]).toBe(255)
  }
  expect(errors).toEqual([])
  await page.screenshot({ path: info.outputPath('file-contact-video-workspace.png') })
})
