import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'

const qaPath = (filename: string) => test.info().outputPath(filename)

function pixelAt(png: PNG, x: number, y: number) {
  const offset = (png.width * y + x) * 4
  return Array.from(png.data.subarray(offset, offset + 4))
}

function makeSilentWav(seconds: number): Buffer {
  const sampleRate = 8_000
  const sampleCount = Math.max(1, Math.round(sampleRate * seconds))
  const buffer = Buffer.alloc(44 + sampleCount * 2)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(buffer.length - 8, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(sampleCount * 2, 40)
  return buffer
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('edits a group chat and exports fixed-screen and long PNGs', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({ path: qaPath('desktop-editor.png') })
  await page.getByLabel('聊天标题').fill('周末球局')
  await page.getByLabel('昵称：阿花').fill('小林')
  await page.getByRole('button', { name: '添加消息' }).click()
  await page.getByLabel(/消息 \d+ 内容/).last().fill('明天下午三点见')
  await expect(page.getByTestId('chat-canvas')).toContainText('明天下午三点见')
  await expect(page.getByTestId('chat-canvas')).toContainText('小林')
  await expect(page.getByTestId('chat-canvas')).toHaveAttribute('data-theme', 'dark')
  const titleStyle = await page.getByTestId('chat-canvas').getByText('周末球局 (4)').evaluate((element) => {
    const style = getComputedStyle(element)
    return { fontSize: style.fontSize, fontWeight: style.fontWeight }
  })
  expect(titleStyle).toEqual({ fontSize: '17.5px', fontWeight: '400' })
  expect(await page.getByTestId('chat-canvas').getByText('姐妹们！').evaluate((element) => (
    getComputedStyle(element).fontSize
  ))).toBe('17px')
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(900)

  const darkDownloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 PNG' }).click()
  await page.getByRole('button', { name: '继续导出' }).click()
  const darkDownload = await darkDownloadEvent
  const darkPath = qaPath('export-dark.png')
  await darkDownload.saveAs(darkPath)
  const darkPng = PNG.sync.read(readFileSync(darkPath))
  expect(darkPng.width).toBe(1290)
  expect(darkPng.height).toBe(2796)

  await page.getByRole('button', { name: '浅色' }).click()
  await page.getByText('手机状态栏', { exact: true }).click()
  await page.getByRole('button', { name: '5G' }).click()
  await page.getByRole('spinbutton', { name: '电量' }).fill('100')
  await expect(page.getByTestId('chat-canvas')).toHaveAttribute('data-theme', 'light')
  await expect(page.getByTestId('chat-canvas')).toContainText('5G')
  await page.screenshot({ path: qaPath('light-preview.png') })
  const lightDownloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 PNG' }).click()
  await page.getByRole('button', { name: '继续导出' }).click()
  const lightDownload = await lightDownloadEvent
  const lightPath = qaPath('export-light.png')
  await lightDownload.saveAs(lightPath)
  const lightPng = PNG.sync.read(readFileSync(lightPath))
  expect(lightPng.width).toBe(1290)
  expect(lightPng.height).toBe(2796)
  expect(pixelAt(lightPng, 645, 2758)).toEqual([246, 246, 246, 255])
  expect(pixelAt(lightPng, 645, 2772)).toEqual([246, 246, 246, 255])
  expect(pixelAt(lightPng, 100, 292)).toEqual([237, 237, 237, 255])
  expect(pixelAt(lightPng, 100, 293)).toEqual([213, 213, 213, 255])
  expect(pixelAt(lightPng, 100, 294)).toEqual([237, 237, 237, 255])
  expect(pixelAt(lightPng, 640, 2525)).toEqual([237, 237, 237, 255])
  expect(pixelAt(lightPng, 640, 2526)).toEqual([221, 221, 221, 255])
  expect(pixelAt(lightPng, 640, 2527)).toEqual([246, 246, 246, 255])
  expect(pixelAt(lightPng, 900, 305)).toEqual([237, 237, 237, 255])
  expect(pixelAt(lightPng, 900, 306)).toEqual([149, 236, 105, 255])

  await page.getByRole('button', { name: '聊天长图' }).click()
  const longDownloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 PNG' }).click()
  await page.getByRole('button', { name: '继续导出' }).click()
  const longDownload = await longDownloadEvent
  const longPath = qaPath('export-long.png')
  await longDownload.saveAs(longPath)
  const longPng = PNG.sync.read(readFileSync(longPath))
  expect(longPng.width).toBe(1290)
  expect(longPng.height).toBeGreaterThan(2796)
})

test('supports direct chat, hidden time and local persistence', async ({ page }) => {
  await page.getByLabel('聊天标题').fill('单聊测试')
  await page.getByRole('button', { name: '单聊' }).click()
  await page.getByLabel('保留联系人').selectOption('p2')
  await page.getByRole('button', { name: '确认切换单聊' }).click()
  await expect(page.getByTestId('chat-canvas')).toContainText('单聊测试')
  await expect(page.getByTestId('chat-canvas').locator('[data-sender-name]')).toHaveCount(0)

  await page.getByRole('button', { name: '不显示时间' }).click()
  await expect(page.getByTestId('chat-canvas').getByTestId('time-divider')).toHaveCount(0)
  await page.waitForTimeout(450)
  await page.reload()
  await expect(page.getByLabel('聊天标题')).toHaveValue('单聊测试')
  await expect(page.getByRole('button', { name: '单聊' })).toHaveAttribute('aria-pressed', 'true')
})

test('creates recall notices for self and other participants', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByLabel('消息 1 发送人').selectOption('p2')
  await page.getByLabel('消息 1 类型').selectOption('recall')

  const notice = page.getByTestId('chat-canvas').getByTestId('recall-notice')
  await expect(notice).toHaveText('"阿花" 撤回了一条消息')
  await expect(notice.locator('img')).toHaveCount(0)
  await expect(notice.locator('[data-message-bubble]')).toHaveCount(0)
  expect(await notice.evaluate((element) => {
    const style = getComputedStyle(element)
    return { fontSize: style.fontSize, fontWeight: style.fontWeight, textAlign: style.textAlign }
  })).toEqual({ fontSize: '13px', fontWeight: '400', textAlign: 'center' })

  await page.getByLabel('消息 1 发送人').selectOption('self')
  await page.getByLabel('消息 1 显示重新编辑').check()
  await expect(notice).toContainText('你撤回了一条消息 重新编辑')
  await expect(notice.locator('[data-reedit-link]')).toHaveCSS('color', 'rgb(125, 144, 184)')
  await page.screenshot({ path: qaPath('recall-editor.png') })
})

test('persists screen scroll and exports custom geometry and message ranges', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByLabel('设备预设').selectOption('custom')
  await page.getByLabel('输出宽度').fill('500')
  await page.getByLabel('输出高度').fill('600')
  await page.getByLabel('清晰度倍率').selectOption('2')
  await page.getByLabel('消息 2 内容').fill(Array.from({ length: 24 }, (_, index) => `用于滚动的第 ${index + 1} 行`).join('\n'))

  const list = page.getByTestId('message-list')
  await list.evaluate((element) => {
    element.scrollTop = 120
    element.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
  await page.waitForTimeout(500)
  await page.reload()
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(120)

  const screenDownloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 PNG' }).click()
  await page.getByRole('button', { name: '继续导出' }).click()
  const screenDownload = await screenDownloadEvent
  const screenPath = qaPath('export-custom-size.png')
  await screenDownload.saveAs(screenPath)
  const screenPng = PNG.sync.read(readFileSync(screenPath))
  expect(screenPng.width).toBe(1000)
  expect(screenPng.height).toBe(1200)

  await page.getByRole('button', { name: '聊天长图' }).click()
  await page.getByLabel('开始消息').selectOption('m2')
  await page.getByLabel('结束消息').selectOption('m4')
  await expect(page.getByTestId('chat-canvas')).not.toContainText('姐妹们！')
  await expect(page.getByTestId('chat-canvas')).toContainText('他一个月工资多少啊')
  await expect(page.getByTestId('chat-canvas')).not.toContainText('他月薪四万五')
})

test('creates image, playable voice, and video call messages', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const onePixelPng = PNG.sync.write({
    width: 2,
    height: 2,
    data: Buffer.alloc(2 * 2 * 4, 255),
  })

  await page.getByLabel('消息 1 类型').selectOption('image')
  await page.getByLabel('消息 1 上传图片').setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: onePixelPng,
  })
  const originalButton = page.getByTestId('chat-canvas').getByRole('button', { name: '查看原图' })
  await expect(originalButton).toBeVisible()
  await originalButton.click()
  await expect(page.getByRole('dialog', { name: '原图预览' })).toBeVisible()
  await page.getByRole('button', { name: '关闭原图', exact: true }).click()

  await page.getByLabel('消息 2 类型').selectOption('voice')
  await page.getByLabel('消息 2 上传语音').setInputFiles({
    name: 'voice.wav',
    mimeType: 'audio/wav',
    buffer: makeSilentWav(1),
  })
  const playButton = page.getByTestId('chat-canvas').getByRole('button', { name: '播放语音' })
  await expect(playButton).toContainText('1″')
  await playButton.click()
  await expect(page.getByTestId('chat-canvas').getByRole('button', { name: '暂停语音' })).toBeVisible()

  await page.getByLabel('消息 3 类型').selectOption('call')
  await page.getByLabel('消息 3 通话类型').selectOption('video')
  await page.getByLabel('消息 3 通话状态').selectOption('missed')
  await expect(page.getByTestId('chat-canvas')).toContainText('未接听')
  await expect(page.getByTestId('chat-canvas').locator('[data-call-mode="video"]')).toBeVisible()
  await page.screenshot({ path: qaPath('media-editor.png') })

  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 PNG' }).click()
  await page.getByRole('button', { name: '继续导出' }).click()
  const download = await downloadEvent
  const exportPath = qaPath('export-media.png')
  await download.saveAs(exportPath)
  const exported = PNG.sync.read(readFileSync(exportPath))
  expect(exported.width).toBe(1290)
  expect(exported.height).toBe(2796)
})

test('persists contacts and applies confirmed group templates', async ({ page }) => {
  await page.getByLabel('昵称：阿花').fill('花姐')
  await page.getByRole('button', { name: '打开素材库' }).click()
  await page.getByRole('button', { name: '保存联系人：花姐' }).click()
  const savedContacts = page.getByRole('region', { name: '已存联系人' })
  await expect(savedContacts.getByRole('button', { name: /^添加联系人 / })).toBeVisible()
  await savedContacts.getByRole('button', { name: /^重命名联系人 / }).click()
  await savedContacts.getByRole('textbox', { name: /^联系人 .* 昵称$/ }).fill('小花')
  await savedContacts.getByRole('button', { name: /^保存联系人 / }).click()
  await expect(savedContacts).toContainText('小花')
  await page.getByRole('button', { name: '关闭素材库', exact: true }).click()

  await page.getByLabel('昵称：花姐').fill('临时联系人')
  await page.waitForTimeout(450)
  await page.reload()
  await page.getByRole('button', { name: '打开素材库' }).click()
  await expect(savedContacts).toContainText('小花')
  await savedContacts.getByRole('button', { name: /^添加联系人 / }).click()
  await page.getByRole('button', { name: '关闭素材库', exact: true }).click()
  await expect(page.getByLabel('昵称：小花')).toBeVisible()

  await page.getByLabel('聊天标题').fill('存档群')
  await page.getByRole('button', { name: '打开素材库' }).click()
  await page.getByRole('button', { name: '保存当前群组' }).click()
  await expect(page.getByRole('button', { name: '应用群组：存档群' })).toBeVisible()
  await page.getByRole('button', { name: '关闭素材库', exact: true }).click()
  await page.getByLabel('聊天标题').fill('临时群名')

  await page.getByRole('button', { name: '打开素材库' }).click()
  await page.getByRole('button', { name: '应用群组：存档群' }).click()
  await expect(page.getByRole('dialog', { name: '应用群组“存档群”？' })).toContainText('移除 0 条')
  await page.getByRole('button', { name: '确认应用群组' }).click()
  await expect(page.getByLabel('聊天标题')).toHaveValue('存档群')
  await expect(page.getByLabel('昵称：小花')).toBeVisible()
})

test('shows a forced weekday divider for messages two days old', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-30T12:00:00+08:00'))
  await page.getByLabel('消息 1 时间', { exact: true }).fill('2026-08-28T09:30')
  await page.getByLabel('消息 1 时间显示').selectOption('show')
  await expect(page.getByTestId('chat-canvas').getByTestId('time-divider').first()).toHaveText('星期五 09:30')
})

test('uses tabs on a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('tab', { name: '设置' })).toBeVisible()
  await page.getByRole('tab', { name: '消息' }).click()
  await expect(page.getByRole('button', { name: '添加消息' })).toBeVisible()
  await page.getByRole('tab', { name: '预览' }).click()
  await expect(page.getByTestId('preview-panel')).toBeVisible()
  await page.screenshot({ path: qaPath('mobile-editor.png') })
})

test('uses tabs when a compact desktop cannot fit three usable columns', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 })

  await expect(page.getByRole('tablist', { name: '编辑工作区' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '设置' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: '预览' }).click()
  await expect(page.getByTestId('preview-panel')).toBeVisible()
  await expect(page.getByTestId('chat-canvas')).toBeVisible()
})

test('keeps message type and direction controls separated', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const type = page.getByLabel('消息 1 类型')
  const direction = page.getByLabel('消息 1 方向')

  await type.selectOption('call')
  const typeBox = await type.boundingBox()
  const directionBox = await direction.boundingBox()

  expect(typeBox).not.toBeNull()
  expect(directionBox).not.toBeNull()
  expect(typeBox!.x + typeBox!.width).toBeLessThanOrEqual(directionBox!.x - 2)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await page.getByRole('tab', { name: '消息' }).click()
  const viewportWidth = await page.evaluate(() => window.innerWidth)
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  const mobileDirectionBox = await page.getByLabel('消息 1 方向').boundingBox()
  expect(documentWidth).toBeLessThanOrEqual(viewportWidth)
  expect(mobileDirectionBox).not.toBeNull()
  expect(mobileDirectionBox!.x + mobileDirectionBox!.width).toBeLessThanOrEqual(viewportWidth - 8)
})
