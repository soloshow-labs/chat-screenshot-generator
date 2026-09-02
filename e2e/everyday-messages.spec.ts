import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'

const draftKey = 'chat-screenshot-generator:draft:v1'

function colorPng(width = 80, height = 40) {
  const data = Buffer.alloc(width * height * 4)
  for (let index = 0; index < data.length; index += 4) data.set([18, 164, 210, 255], index)
  return PNG.sync.write({ width, height, data })
}

function offsetPng() {
  const width = 800, height = 400, data = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(x >= 560 && x < 640 && y >= 160 && y < 240 ? [20, 210, 60, 255] : [210, 30, 40, 255], (y * width + x) * 4)
  return PNG.sync.write({ width, height, data })
}

function silentWav(seconds = 2.4) {
  const sampleRate = 8000, sampleCount = Math.round(sampleRate * seconds), buffer = Buffer.alloc(44 + sampleCount * 2)
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVE', 8); buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(sampleCount * 2, 40)
  return buffer
}

async function start(page: Page, count = 3) {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.evaluate(async ({ key, count }) => {
    const path = '/src/app/sampleDraft.ts'
    const { SAMPLE_DRAFT } = await import(path)
    const draft = structuredClone(SAMPLE_DRAFT)
    draft.messages = draft.messages.slice(0, count)
    draft.title = '常用消息回归'
    localStorage.setItem(key, JSON.stringify(draft))
  }, { key: draftKey, count })
  await page.reload()
  await expect(page).toHaveTitle(/聊天截图生成器/)
  await expect(page.getByRole('heading', { name: '聊天截图生成器' })).toBeVisible()
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
}

async function saved(page: Page) {
  await expect(page.getByText('已保存到此浏览器', { exact: true })).toBeVisible()
}

async function exportPng(page: Page, info: TestInfo, filename: string) {
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 PNG', exact: true }).click()
  await page.getByRole('button', { name: '继续导出', exact: true }).click()
  const download = await downloadPromise
  const path = info.outputPath(filename)
  await download.saveAs(path)
  await info.attach(filename, { path, contentType: 'image/png' })
  return PNG.sync.read(readFileSync(path))
}

test('emoji insertion preserves selection and undo; manual voice/transcript exports in both themes and modes', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await start(page)
  const text = page.getByLabel('消息 1 内容', { exact: true })
  await text.fill('你好世界')
  await text.focus(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight')
  await page.getByRole('button', { name: '消息 1 插入表情' }).click()
  await expect(page.getByRole('group', { name: '消息 1 表情选择器' }).getByRole('button', { name: /^插入/ })).toHaveCount(108)
  await page.getByRole('button', { name: '插入微笑', exact: true }).click()
  await expect(text).toHaveValue('你好[微笑]世界')
  await expect(text).toBeFocused()
  const emoji = page.getByTestId('chat-canvas').getByRole('img', { name: '[微笑]', exact: true })
  await expect(emoji).toBeVisible()
  await expect.poll(() => emoji.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
  const asset = await emoji.evaluate((image: HTMLImageElement) => ({ url: image.src, width: image.naturalWidth, height: image.naturalHeight }))
  expect(new URL(asset.url).origin).toBe(new URL(page.url()).origin)
  expect(new URL(asset.url).pathname).toMatch(/\.png$/)
  expect([asset.width, asset.height]).toEqual([96, 96])
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(text).toHaveValue('你好世界')
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect(text).toHaveValue('你好[微笑]世界')

  await page.getByLabel('消息 2 类型', { exact: true }).selectOption('voice')
  await page.getByLabel('消息 2 显示秒数', { exact: true }).fill('12')
  await page.getByLabel('消息 2 手填转文字', { exact: true }).fill('明天见[微笑]')
  await page.getByLabel('消息 2 显示转文字', { exact: true }).check()
  const canvas = page.getByTestId('chat-canvas')
  await expect(canvas).toContainText('12″')
  await expect(canvas.locator('[data-voice-transcript]')).toContainText('明天见')
  await expect(canvas.getByRole('button', { name: '播放语音', exact: true })).toHaveCount(0)
  await expect(canvas).not.toContainText('请上传语音')
  await page.getByLabel('消息 2 显示秒数', { exact: true }).fill('61')
  await expect(page.getByRole('alert')).toContainText('1–60')
  await expect(canvas).toContainText('12″')
  await page.getByLabel('消息 2 显示秒数', { exact: true }).fill('12')

  for (const theme of ['深色', '浅色']) {
    await page.getByRole('button', { name: theme, exact: true }).click()
    for (const mode of ['手机屏幕', '聊天长图']) {
      await page.getByRole('button', { name: mode, exact: true }).click()
      const png = await exportPng(page, info, `everyday-${theme}-${mode}.png`)
      expect(png.width).toBe(1290)
      if (mode === '手机屏幕') expect(png.height).toBe(2796)
      else expect(png.height).toBeGreaterThan(400)
      const coloredPixels = Array.from({ length: png.width * Math.min(png.height, 1000) }, (_, index) => index * 4).filter(index => png.data[index] > 180 && png.data[index + 1] > 110 && png.data[index + 2] < 100).length
      expect(coloredPixels).toBeGreaterThan(60)
    }
  }
  await saved(page); await page.reload()
  await expect(page.getByLabel('消息 2 显示秒数', { exact: true })).toHaveValue('12')
  await expect(page.getByLabel('消息 2 手填转文字', { exact: true })).toHaveValue('明天见[微笑]')
  expect(errors).toEqual([])
})

test('quote-only image survives source deletion, refresh, JSON ID remapping and real PNG export', async ({ page }, info) => {
  await start(page)
  await page.getByLabel('消息 1 类型', { exact: true }).selectOption('image')
  await page.getByLabel('消息 1 上传图片', { exact: true }).setInputFiles({ name: 'quote-source.png', mimeType: 'image/png', buffer: colorPng() })
  await page.getByRole('article', { name: '消息 2', exact: true }).getByText('引用回复', { exact: true }).click()
  await page.getByLabel('消息 2 引用来源', { exact: true }).selectOption('m1')
  const quoteImage = page.getByTestId('chat-canvas').locator('[data-quote-preview] img')
  await expect(quoteImage).toBeVisible()
  await page.getByLabel('昵称：小美', { exact: true }).fill('改名后的成员')
  await page.getByRole('button', { name: '删除消息 1', exact: true }).click()
  await expect(page.getByTestId('chat-canvas').locator('[data-quote-preview]')).toContainText('小美')
  await expect(quoteImage).toBeVisible()
  await saved(page); await page.reload()
  await expect.poll(() => quoteImage.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
  await page.getByRole('button', { name: '项目', exact: true }).click()
  const projectDialog = page.getByRole('dialog', { name: '本地项目', exact: true })
  await projectDialog.getByText('项目 JSON 备份与恢复', { exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await projectDialog.getByRole('button', { name: '导出项目 JSON', exact: true }).click()
  const download = await downloadPromise, jsonPath = info.outputPath('quote-only.json')
  await download.saveAs(jsonPath)
  const envelope = JSON.parse(readFileSync(jsonPath, 'utf8'))
  expect(envelope.assets).toHaveLength(1)
  expect(envelope.draft.messages[0].quote.sourceMessageId).toBeNull()
  expect(envelope.draft.messages[0].quote.senderName).toBe('小美')
  const oldAssetId = envelope.draft.messages[0].quote.media.assetId
  await projectDialog.getByLabel('导入项目 JSON', { exact: true }).setInputFiles(jsonPath)
  await expect(projectDialog.getByText('项目已导入', { exact: true })).toBeVisible()
  await projectDialog.getByRole('button', { name: '关闭', exact: true }).click()
  await saved(page)
  const restored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), draftKey)
  expect(restored.messages[0].quote.media.assetId).not.toBe(oldAssetId)
  expect(restored.messages[0].id).not.toBe(envelope.draft.messages[0].id)
  await expect.poll(() => quoteImage.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 80)).toBe(true)
  const point = await quoteImage.evaluate(element => {
    const image = element.getBoundingClientRect(), canvas = element.closest('[data-testid="chat-canvas"]')!.getBoundingClientRect()
    return { x: (image.x + image.width / 2 - canvas.x) / canvas.width, y: (image.y + image.height / 2 - canvas.y) / canvas.width }
  })
  const png = await exportPng(page, info, 'quote-only-restored.png')
  const index = (Math.round(point.y * png.width) * png.width + Math.round(point.x * png.width)) * 4
  expect(Array.from(png.data.subarray(index, index + 4))).toEqual([18, 164, 210, 255])
  await page.screenshot({ path: info.outputPath('quote-only-workspace.png') })
})

test('real audio stays playable when displayed seconds change and removing it preserves transcript/manual mode', async ({ page }, info) => {
  await start(page, 1)
  await page.getByLabel('消息 1 类型', { exact: true }).selectOption('voice')
  await page.getByLabel('消息 1 上传语音', { exact: true }).setInputFiles({ name: 'real-audio.wav', mimeType: 'audio/wav', buffer: silentWav() })
  await expect(page.getByLabel('消息 1 时长模式')).toHaveValue('auto')
  const canvas = page.getByTestId('chat-canvas'), play = canvas.getByRole('button', { name: '播放语音', exact: true })
  await expect(play).toContainText('3″')
  await play.click()
  await expect(canvas.getByRole('button', { name: '暂停语音', exact: true })).toBeVisible()
  await page.getByLabel('消息 1 时长模式').selectOption('manual')
  await page.getByLabel('消息 1 显示秒数').fill('30')
  await expect(canvas).toContainText('30″')
  expect(await canvas.locator('audio').evaluate((audio: HTMLAudioElement) => audio.duration)).toBeCloseTo(2.4, 1)
  await page.getByLabel('消息 1 手填转文字').fill('保留真实音频，不裁剪。')
  await page.getByLabel('消息 1 显示转文字').check()
  await page.getByRole('article', { name: '消息 1', exact: true }).getByRole('button', { name: '移除', exact: true }).click()
  await expect(page.getByLabel('消息 1 时长模式')).toHaveValue('manual')
  await expect(page.getByLabel('消息 1 显示秒数')).toHaveValue('30')
  await expect(canvas.locator('audio')).toHaveCount(0)
  await expect(canvas.locator('[data-voice-transcript]')).toHaveText('保留真实音频，不裁剪。')
  await exportPng(page, info, 'manual-after-audio-removal.png')
})

test('off-center avatar crop saves the selected pixels only after confirm and supports cancellation and undo', async ({ page }, info) => {
  await start(page, 1)
  const upload = page.getByLabel('更换头像：小美', { exact: true })
  const file = { name: 'offset-avatar.png', mimeType: 'image/png', buffer: offsetPng() }
  await upload.setInputFiles(file)
  const dialog = page.getByRole('dialog', { name: '头像取景' })
  await expect(dialog).toBeVisible()
  await expect(page.getByRole('button', { name: '导出 PNG', exact: true })).toBeDisabled()
  expect(await dialog.evaluate(node => Boolean(node.closest('[inert]')))).toBe(false)
  await page.getByRole('button', { name: '取消', exact: true }).click()
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).participants[0].avatarDataUrl, draftKey)).toBeNull()
  await upload.setInputFiles(file)
  await expect(page.getByRole('button', { name: '确认头像' })).toBeEnabled()
  await page.getByRole('slider', { name: '缩放头像' }).fill('2')
  const crop = page.getByRole('img', { name: '头像取景区' })
  const cropBox = await crop.boundingBox()
  expect(cropBox).not.toBeNull()
  // A real pointer capture/drag moves the source center from x=400 to x=600.
  await page.mouse.move(cropBox!.x + cropBox!.width * .75, cropBox!.y + cropBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(cropBox!.x - cropBox!.width * .25, cropBox!.y + cropBox!.height / 2, { steps: 8 })
  await page.mouse.up()
  await crop.focus()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowRight')
  await page.screenshot({ path: info.outputPath('avatar-offset-selection.png') })
  await page.getByRole('button', { name: '确认头像' }).click()
  await expect(dialog).toHaveCount(0)
  await saved(page)
  const result = await page.evaluate(async key => {
    const dataUrl = JSON.parse(localStorage.getItem(key)!).participants[0].avatarDataUrl
    const image = new Image(); image.src = dataUrl; await image.decode()
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0)
    return { dataUrl, width: canvas.width, height: canvas.height, pixel: Array.from(context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data) }
  }, draftKey)
  expect(result.width).toBe(result.height); expect(result.width).toBeLessThanOrEqual(512)
  expect(result.pixel[1]).toBeGreaterThan(180); expect(result.pixel[0]).toBeLessThan(50)
  await upload.setInputFiles(file)
  await page.getByRole('button', { name: '取消', exact: true }).click()
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).participants[0].avatarDataUrl, draftKey)).toBe(result.dataUrl)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await saved(page)
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).participants[0].avatarDataUrl, draftKey)).toBeNull()
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await exportPng(page, info, 'offset-avatar-confirmed.png')
})

test('narrow-screen emoji, quote and crop controls remain usable without horizontal overflow', async ({ page }, info) => {
  await start(page, 2)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('tab', { name: '消息', exact: true }).click()
  await page.getByRole('button', { name: '消息 1 插入表情' }).click()
  await expect(page.getByRole('group', { name: '消息 1 表情选择器' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.keyboard.press('Escape')
  await expect(page.getByLabel('消息 1 内容', { exact: true })).toBeFocused()
  await page.getByRole('article', { name: '消息 2', exact: true }).getByText('引用回复', { exact: true }).click()
  await page.getByLabel('消息 2 引用来源').selectOption('m1')
  await page.getByRole('tab', { name: '预览', exact: true }).click()
  await expect(page.getByTestId('chat-canvas').locator('[data-quote-preview]')).toBeVisible()
  await page.screenshot({ path: info.outputPath('everyday-mobile-preview.png') })
  await page.getByRole('tab', { name: '设置', exact: true }).click()
  await page.getByLabel('更换头像：小美', { exact: true }).setInputFiles({ name: 'mobile.png', mimeType: 'image/png', buffer: offsetPng() })
  await expect(page.getByRole('dialog', { name: '头像取景' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: info.outputPath('everyday-mobile-crop.png') })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('an emoji request failing after export preflight does not download a fallback PNG', async ({ page }) => {
  await start(page, 1)
  // Hold only the readiness boundary so the late error commits before rendering.
  await page.evaluate(() => {
    const fonts = document.fonts as FontFaceSet & { releaseTestReady?: () => void }
    const ready = new Promise<FontFaceSet>(resolve => { fonts.releaseTestReady = () => resolve(fonts) })
    Object.defineProperty(fonts, 'ready', { value: ready, configurable: true })
  })
  let releaseImage = () => {}
  let blocked = false
  const imageGate = new Promise<void>(resolve => { releaseImage = resolve })
  const downloads: string[] = []
  page.on('download', download => downloads.push(download.suggestedFilename()))
  await page.route('**/src/components/emoji/assets/**', async route => {
    if (!decodeURIComponent(new URL(route.request().url()).pathname).endsWith('/微笑.png')) return route.continue()
    blocked = true
    await imageGate
    await route.abort('failed')
  })
  try {
    await page.getByLabel('消息 1 内容', { exact: true }).fill('加载中的表情[微笑]')
    await expect.poll(() => blocked).toBe(true)
    await page.getByRole('button', { name: '导出 PNG', exact: true }).click()
    await page.getByRole('button', { name: '继续导出', exact: true }).click()
    await expect(page.getByRole('button', { name: '导出中…', exact: true })).toBeVisible()
    releaseImage()
    await expect(page.getByTestId('chat-canvas').locator('[data-emoji-error]')).toHaveText('[微笑]')
    await page.evaluate(() => (document.fonts as FontFaceSet & { releaseTestReady?: () => void }).releaseTestReady?.())
    // Depending on whether the resource failure lands during the repeated
    // quality check or the renderer's final guard, it is reported in the
    // dedicated export-check dialog or the export failure toast. Both paths
    // must be explicit and must block delivery.
    await expect(page.getByText(/导出失败|表情资源无法加载/)).toBeVisible()
    await expect(page.getByRole('button', { name: '导出 PNG', exact: true })).toBeEnabled()
    expect(downloads).toEqual([])
    expect(await page.getByTestId('chat-canvas').getAttribute('data-export-mode')).not.toBe('true')
  } finally {
    releaseImage()
    await page.evaluate(() => (document.fonts as FontFaceSet & { releaseTestReady?: () => void }).releaseTestReady?.())
  }
})
