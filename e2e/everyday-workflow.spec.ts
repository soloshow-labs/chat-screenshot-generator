import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'

const draftKey = 'chat-screenshot-generator:draft:v1'

async function tab(page: Page, name: string) {
  const control = page.getByRole('tab', { name, exact: true })
  if (await control.isVisible()) await control.click()
}

async function topAction(page: Page, name: string) {
  const action = page.getByRole('button', { name, exact: true })
  if (!await action.isVisible()) await page.getByText('更多操作', { exact: true }).click()
  await action.click()
}

async function start(page: Page, width = 1440) {
  await page.setViewportSize({ width, height: 1000 })
  await page.goto('/')
  await page.evaluate(async key => {
    const source = '/src/app/sampleDraft.ts'
    const { SAMPLE_DRAFT } = await import(source)
    localStorage.setItem(key, JSON.stringify({
      ...SAMPLE_DRAFT, wallpaper: null, title: '日常功能验证',
      participants: SAMPLE_DRAFT.participants.slice(0, 3),
      messages: SAMPLE_DRAFT.messages.slice(0, 3).map((message: Record<string, unknown>, index: number) => ({
        ...message, id: `m${index + 1}`, kind: 'text', participantId: index === 1 ? 'p2' : 'self',
        text: ['你好朋友', '第二条', '第三条'][index], media: null, quote: null,
        sentAt: `2026-08-31T02:0${index}:00.000Z`, timeVisibility: 'hide',
      })),
    }))
  }, draftKey)
  await page.reload()
  await expect(page).toHaveTitle('聊天截图生成器')
  await expect(page.getByRole('button', { name: '导出 PNG', exact: true })).toBeEnabled()
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
}

async function downloadPng(page: Page, info: TestInfo, name: string) {
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 PNG', exact: true }).click()
  await page.getByRole('button', { name: /^(?:继续导出)$/ }).click()
  const path = info.outputPath(`${name}.png`)
  await (await event).saveAs(path)
  await info.attach(name, { path, contentType: 'image/png' })
  return PNG.sync.read(readFileSync(path))
}

function imageFile(name: string, first = [210, 40, 70, 255], second = first) {
  const width = 430, height = 744, data = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    data.set(y < 372 ? first : second, (y * width + x) * 4)
  }
  return { name, mimeType: 'image/png', buffer: PNG.sync.write({ width, height, data }) }
}

async function transferFiles(target: Locator, type: 'drop' | 'paste', files: ReturnType<typeof imageFile>[], text = '') {
  return target.evaluate((element, input) => {
    const data = new DataTransfer()
    for (const file of input.files) data.items.add(new File([new Uint8Array(file.bytes)], file.name, { type: file.mimeType }))
    if (input.text) data.setData('text/plain', input.text)
    const event = input.type === 'paste'
      ? new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
      : new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true })
    element.dispatchEvent(event)
    return event.defaultPrevented
  }, { type, text, files: files.map(file => ({ name: file.name, mimeType: file.mimeType, bytes: [...file.buffer] })) })
}

async function savedMessages(page: Page) {
  await expect(page.getByText('已保存到此浏览器', { exact: true })).toBeVisible()
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!).messages, draftKey)
}

async function backupRoundtrip(page: Page, info: TestInfo, name: string) {
  await expect(page.getByText('已保存到此浏览器', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '项目', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '本地项目', exact: true })
  await dialog.getByText('项目 JSON 备份与恢复', { exact: true }).click()
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: '导出项目 JSON', exact: true }).click()
  const path = info.outputPath(`${name}.json`)
  await (await download).saveAs(path)
  const before = JSON.parse(readFileSync(path, 'utf8'))
  await dialog.getByLabel('导入项目 JSON', { exact: true }).setInputFiles(path)
  await expect(dialog.getByText('项目已导入', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  return before
}

test('auto-fit keeps the full preview visible on narrow screens without changing PNG dimensions', async ({ page }, info) => {
  test.setTimeout(90000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await start(page, 390)
  await tab(page, '预览')
  const canvas = page.getByTestId('chat-canvas')
  for (const width of [390, 320, 375]) {
    await page.setViewportSize({ width, height: 844 })
    await expect.poll(async () => {
      const box = await canvas.boundingBox()
      return Boolean(box && box.x >= 0 && box.x + box.width <= width + 1)
    }).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  }
  const automatic = await downloadPng(page, info, 'auto-fit')
  expect([automatic.width, automatic.height]).toEqual([1290, 2796])
  await page.getByRole('button', { name: '放大预览', exact: true }).click()
  const manual = await downloadPng(page, info, 'manual-zoom')
  expect([manual.width, manual.height]).toEqual([1290, 2796])
  await page.getByRole('button', { name: '恢复适应宽度', exact: true }).click()
  await tab(page, '消息')
  await tab(page, '预览')
  const box = (await canvas.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(376)
  await page.screenshot({ path: info.outputPath('preview-narrow.png') })
  expect(errors).toEqual([])
})

test('emoji search preserves selection and shares persisted recents between messages', async ({ page }, info) => {
  await start(page)
  const content = page.getByLabel('消息 1 内容', { exact: true })
  await content.focus()
  await content.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(2, 4))
  await page.getByRole('button', { name: '消息 1 插入表情', exact: true }).click()
  const search = page.getByRole('searchbox', { name: '消息 1 搜索表情', exact: true })
  await expect(search).toBeFocused()
  await search.fill('笑哭')
  await page.getByRole('button', { name: '插入破涕为笑', exact: true }).click()
  await expect(content).toHaveValue('你好[破涕为笑]')
  await expect(content).toBeFocused()
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(content).toHaveValue('你好朋友')
  await page.getByRole('button', { name: '消息 2 插入表情', exact: true }).click()
  await expect(page.getByRole('region', { name: '消息 2 最近使用表情', exact: true }).getByRole('button', { name: '插入破涕为笑', exact: true })).toBeVisible()
  await page.getByRole('searchbox', { name: '消息 2 搜索表情', exact: true }).fill('不会有这个表情')
  await expect(page.getByText(/没有找到|无匹配/)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('searchbox', { name: '消息 2 搜索表情', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('消息 2 内容', { exact: true })).toBeFocused()
  await page.reload()
  await page.getByRole('button', { name: '消息 1 插入表情', exact: true }).click()
  await expect(page.getByRole('region', { name: '消息 1 最近使用表情', exact: true }).getByRole('button', { name: '插入破涕为笑', exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('emoji-search-recents.png') })
})

test('batch edits non-contiguous messages in one undo step and fits a narrow dialog', async ({ page }, info) => {
  await start(page, 390)
  await tab(page, '消息')
  await page.getByLabel('消息 1 内容', { exact: true }).fill('批量测试原文')
  const original = await savedMessages(page)
  await page.getByRole('button', { name: '多选消息', exact: true }).click()
  await page.getByRole('checkbox', { name: '选择消息 1', exact: true }).check()
  await page.getByRole('checkbox', { name: '选择消息 3', exact: true }).check()
  await page.getByRole('button', { name: '批量修改（2）', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '批量修改消息', exact: true })
  await expect(dialog.getByRole('checkbox', { name: '修改发送人', exact: true })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: '应用批量修改', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('checkbox', { name: '修改发送人', exact: true })).toBeFocused()
  await page.keyboard.press('ControlOrMeta+Z')
  expect(await savedMessages(page)).toEqual(original)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: '批量修改（2）', exact: true })).toBeFocused()
  await page.getByRole('button', { name: '批量修改（2）', exact: true }).click()
  await dialog.getByRole('checkbox', { name: '修改发送人', exact: true }).check()
  await dialog.getByLabel('批量发送人', { exact: true }).selectOption('p2')
  await dialog.getByRole('checkbox', { name: '平移日期时间', exact: true }).check()
  await dialog.getByLabel('第一条新时间', { exact: true }).fill('2027-01-01T12:00')
  await page.screenshot({ path: info.outputPath('batch-edit-narrow.png') })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await dialog.getByRole('button', { name: '应用批量修改', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  const changed = await savedMessages(page)
  expect(changed.map((message: { id: string }) => message.id)).toEqual(['m1', 'm2', 'm3'])
  expect(changed[0].participantId).toBe('p2')
  expect(changed[2].participantId).toBe('p2')
  expect(changed[1]).toEqual(original[1])
  expect(Date.parse(changed[2].sentAt) - Date.parse(changed[0].sentAt)).toBe(120000)
  expect(Date.parse(changed[0].sentAt)).toBeGreaterThan(Date.parse('2026-12-31'))
  await topAction(page, '撤销')
  expect(await savedMessages(page)).toEqual(original)
  await topAction(page, '重做')
  expect(await savedMessages(page)).toEqual(changed)
})

test('image drop and textarea paste append ordered batches without replacing text', async ({ page, context }, info) => {
  await start(page)
  const receiver = page.getByRole('group', { name: '拖入或粘贴图片', exact: true })
  // Browsers hide external file contents during dragover but expose the Files type.
  expect(await receiver.evaluate(element => {
    const data = new DataTransfer()
    Object.defineProperty(data, 'types', { value: ['Files'] })
    const event = new DragEvent('dragover', { dataTransfer: data, bubbles: true, cancelable: true })
    element.dispatchEvent(event)
    return event.defaultPrevented
  })).toBe(true)
  const red = imageFile('first-red.png'), green = imageFile('second-green.png', [30, 190, 80, 255])
  await transferFiles(receiver, 'drop', [red, { name: 'ignore.txt', mimeType: 'text/plain', buffer: Buffer.from('text') }, green])
  await expect(receiver.getByRole('status')).toHaveText('已追加 2 张图片，已忽略 1 个非图片文件')
  const afterDrop = await savedMessages(page)
  expect(afterDrop.slice(3).map((message: { media: { fileName: string } }) => message.media.fileName)).toEqual(['first-red.png', 'second-green.png'])
  expect(afterDrop.slice(3).map((message: { participantId: string }) => message.participantId)).toEqual(['self', 'self'])
  expect(afterDrop[3].sentAt).toBe(afterDrop[4].sentAt)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  expect(await savedMessages(page)).toHaveLength(3)
  await page.getByRole('button', { name: '重做', exact: true }).click()
  expect(await savedMessages(page)).toHaveLength(5)

  const content = page.getByLabel('消息 1 内容', { exact: true })
  await content.focus()
  expect(await transferFiles(content, 'paste', [green], '普通文字优先')).toBe(false)
  await expect(content).toHaveValue('你好朋友')
  expect(await savedMessages(page)).toHaveLength(5)
  expect(await transferFiles(content, 'paste', [green])).toBe(true)
  await expect(receiver.getByRole('status')).toHaveText('已追加 1 张图片')
  expect(await savedMessages(page)).toHaveLength(6)
  await expect(content).toHaveValue('你好朋友')

  await transferFiles(receiver, 'drop', [red, { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') }])
  await expect(receiver.getByRole('alert')).toContainText('broken.png')
  expect(await savedMessages(page)).toHaveLength(6)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.evaluate(async bytes => {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(bytes)], { type: 'image/png' }) })])
  }, [...green.buffer])
  await content.focus()
  await page.keyboard.press('ControlOrMeta+V')
  await expect.poll(async () => (await savedMessages(page)).length).toBe(7)
  await expect(content).toHaveValue('你好朋友')
  await page.evaluate(() => navigator.clipboard.writeText('正常文字粘贴'))
  await content.focus()
  await content.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(0, 0))
  await page.keyboard.press('ControlOrMeta+V')
  await expect(content).toHaveValue('正常文字粘贴你好朋友')
  const project = await backupRoundtrip(page, info, 'imported-images')
  expect(project.draft.messages).toHaveLength(7)
  expect(project.assets).toHaveLength(4)
  await page.reload()
  expect(await savedMessages(page)).toHaveLength(7)
})

test('native clipboard receives the same PNG pixels as download in screen and ranged long modes', async ({ page, context }, info) => {
  test.setTimeout(90000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await start(page)
  await page.getByLabel('消息 1 内容', { exact: true }).fill('复制验证\n'.repeat(50))
  const list = page.getByTestId('message-list')
  await list.evaluate(element => { element.scrollTop = 180; element.dispatchEvent(new Event('scroll')) })
  for (const mode of ['screen', 'long']) {
    if (mode === 'long') {
      await page.getByRole('button', { name: '聊天长图', exact: true }).click()
      await page.getByLabel('开始消息', { exact: true }).selectOption('m2')
      await page.getByLabel('结束消息', { exact: true }).selectOption('m3')
    }
    const downloaded = await downloadPng(page, info, `clipboard-reference-${mode}`)
    let unexpectedDownloads = 0
    const onDownload = () => { unexpectedDownloads += 1 }
    page.on('download', onDownload)
    await page.getByRole('button', { name: '复制 PNG', exact: true }).click()
    await page.getByRole('button', { name: '继续复制', exact: true }).click()
    await expect(page.getByText('PNG 已复制', { exact: true })).toBeVisible()
    // Read only after this isolated test has successfully written its own PNG.
    const bytes = await page.evaluate(async () => {
      const items = await navigator.clipboard.read()
      const png = items.find(item => item.types.includes('image/png'))
      if (!png) throw new Error('Clipboard did not contain image/png')
      const blob = await png.getType('image/png')
      return [...new Uint8Array(await blob.arrayBuffer())]
    })
    const copied = PNG.sync.read(Buffer.from(bytes))
    expect([copied.width, copied.height]).toEqual([downloaded.width, downloaded.height])
    expect(Buffer.compare(copied.data, downloaded.data)).toBe(0)
    expect(unexpectedDownloads).toBe(0)
    page.off('download', onDownload)
    if (mode === 'screen') await expect.poll(() => list.evaluate(element => element.scrollTop)).toBe(180)
  }
  await page.screenshot({ path: info.outputPath('workflow-desktop.png') })
  expect(errors).toEqual([])
})

test('clipboard permission failure is explicit and restores controls without downloading', async ({ page }, info) => {
  await start(page, 390)
  await tab(page, '预览')
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'write', { configurable: true, value: () => Promise.reject(new DOMException('Test permission denied', 'NotAllowedError')) })
  })
  let downloads = 0
  page.on('download', () => { downloads += 1 })
  await page.getByRole('button', { name: '复制 PNG', exact: true }).click()
  await page.getByRole('button', { name: '继续复制', exact: true }).click()
  await expect(page.getByText('无法复制图片，请使用导出 PNG', { exact: true })).toBeVisible()
  await expect(page.getByText('PNG 已复制', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '导出 PNG', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: '复制 PNG', exact: true })).toBeEnabled()
  expect(downloads).toBe(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: info.outputPath('clipboard-permission-narrow.png') })
  const png = await downloadPng(page, info, 'download-after-clipboard-error')
  expect([png.width, png.height]).toEqual([1290, 2796])
})

test('wallpaper crop persists through undo and JSON and repeats at fixed scale in real PNGs', async ({ page }, info) => {
  test.setTimeout(90000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await start(page)
  await page.getByRole('button', { name: '纯色背景', exact: true }).click()
  await page.getByLabel('聊天背景颜色', { exact: true }).fill('#345678')
  const list = page.getByTestId('message-list')
  await expect(list).toHaveCSS('background-color', 'rgb(52, 86, 120)')
  const upload = page.getByLabel('上传聊天背景图片', { exact: true })
  const fixture = imageFile('two-color-wallpaper.png', [210, 40, 70, 255], [30, 190, 80, 255])
  await upload.setInputFiles(fixture)
  await expect(page.getByRole('dialog', { name: '聊天背景取景', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(list).toHaveAttribute('data-wallpaper', 'color')
  await upload.setInputFiles(fixture)
  await page.getByRole('button', { name: '确认背景', exact: true }).click()
  await expect(list).toHaveAttribute('data-wallpaper', 'image')
  await expect(page.getByRole('dialog', { name: '聊天背景取景', exact: true })).toHaveCount(0)
  const probe = page.getByTestId('wallpaper-probe')
  await expect(probe).toHaveAttribute('src', /^blob:/)
  await page.getByRole('button', { name: '恢复默认背景', exact: true }).click()
  await expect(list).toHaveAttribute('data-wallpaper', 'default')
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(list).toHaveAttribute('data-wallpaper', 'image')
  await page.getByLabel('消息 1 内容', { exact: true }).fill('背景验证\n'.repeat(60))
  const project = await backupRoundtrip(page, info, 'wallpaper')
  expect(project.draft.wallpaper.type).toBe('image')
  expect(project.assets.some((asset: { originalAssetId: string }) => asset.originalAssetId === project.draft.wallpaper.media.assetId)).toBe(true)
  await expect(page.getByText('已保存到此浏览器', { exact: true })).toBeVisible()
  const restored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), draftKey)
  expect(restored.wallpaper.media.assetId).not.toBe(project.draft.wallpaper.media.assetId)
  await page.reload()
  await expect(list).toHaveAttribute('data-wallpaper', 'image')

  for (const theme of ['浅色', '深色']) {
    await page.getByRole('button', { name: theme, exact: true }).click()
    await page.getByRole('button', { name: '手机屏幕', exact: true }).click()
    await list.evaluate(element => { element.scrollTop = 240; element.dispatchEvent(new Event('scroll')) })
    const screenPng = await downloadPng(page, info, `wallpaper-screen-${theme}`)
    expect([screenPng.width, screenPng.height]).toEqual([1290, 2796])
    const red = ((98 + 100) * 3 * screenPng.width + 6 * 3) * 4
    const green = ((98 + 500) * 3 * screenPng.width + 6 * 3) * 4
    expect(screenPng.data[red]).toBeGreaterThan(180)
    expect(screenPng.data[red + 1]).toBeLessThan(75)
    expect(screenPng.data[green]).toBeLessThan(60)
    expect(screenPng.data[green + 1]).toBeGreaterThan(160)
    await expect.poll(() => list.evaluate(element => element.scrollTop)).toBe(240)

    await page.getByRole('button', { name: '聊天长图', exact: true }).click()
    const longPng = await downloadPng(page, info, `wallpaper-long-${theme}`)
    const repeat = ((98 + 744 + 100) * 3 * longPng.width + 6 * 3) * 4
    expect(longPng.height).toBeGreaterThan((98 + 744 + 100) * 3)
    expect(longPng.data[repeat]).toBeGreaterThan(180)
    expect(longPng.data[repeat + 1]).toBeLessThan(75)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await tab(page, '设置')
  await upload.setInputFiles(fixture)
  const dialog = page.getByRole('dialog', { name: '聊天背景取景', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading')).toHaveCSS('font-size', '16px')
  const confirm = dialog.getByRole('button', { name: '确认背景', exact: true })
  await expect(confirm).toHaveCSS('height', '40px')
  await expect(confirm).toHaveCSS('font-size', '12px')
  await page.screenshot({ path: info.outputPath('wallpaper-crop-narrow.png') })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.setViewportSize({ width: 320, height: 740 })
  await confirm.scrollIntoViewIfNeeded()
  await expect(confirm).toHaveCSS('height', '40px')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.screenshot({ path: info.outputPath('wallpaper-crop-320.png') })
  await page.getByRole('button', { name: '取消', exact: true }).click()
  expect(errors).toEqual([])
})
