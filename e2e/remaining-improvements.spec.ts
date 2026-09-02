import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'

const draftKey = 'chat-screenshot-generator:draft:v1'
async function tab(page: Page, name: string) {
  const target = page.getByRole('tab', { name, exact: true })
  if (await target.isVisible()) await target.click()
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
    const path = '/src/app/sampleDraft.ts'
    const { SAMPLE_DRAFT } = await import(path)
    localStorage.setItem(key, JSON.stringify({ ...SAMPLE_DRAFT, title: '朋友小群', participants: SAMPLE_DRAFT.participants.slice(0, 3), messages: SAMPLE_DRAFT.messages.slice(0, 3) }))
  }, draftKey)
  await page.reload()
  await expect(page).toHaveTitle('聊天截图生成器')
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
}
async function saved(page: Page) { await expect(page.getByText('已保存到此浏览器', { exact: true })).toBeVisible() }
async function png(page: Page, info: TestInfo, name: string) {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 PNG', exact: true }).click()
  await page.getByRole('button', { name: '继续导出', exact: true }).click()
  const path = info.outputPath(`${name}.png`)
  await (await download).saveAs(path)
  await info.attach(name, { path, contentType: 'image/png' })
  return PNG.sync.read(readFileSync(path))
}
function mapFile() {
  const width = 1500, height = 700, data = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(x >= 1000 && x < 1250 && y >= 225 && y < 475 ? [20, 210, 60, 255] : [210, 30, 40, 255], (y * width + x) * 4)
  return { name: 'map-source.png', mimeType: 'image/png', buffer: PNG.sync.write({ width, height, data }) }
}

for (const width of [1440, 390]) test(`payment replies, red-packet notices and group display work through JSON and PNG at ${width}px`, async ({ page }, info) => {
  test.setTimeout(90000)
  const refunded = width === 390
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await start(page, width)
  await tab(page, '设置')
  await page.getByLabel('群显示人数', { exact: true }).fill('128')
  await page.getByLabel('显示群成员昵称', { exact: true }).uncheck()
  await tab(page, '消息')
  await page.getByLabel('消息 1 类型', { exact: true }).selectOption('payment')
  await expect(page.getByLabel('消息 1 付款人', { exact: true })).toHaveValue('self')
  await expect(page.getByRole('button', { name: '生成收款回执', exact: true })).toBeDisabled()
  await page.getByLabel('消息 1 收款人', { exact: true }).selectOption('p2')
  await page.getByLabel('消息 1 金额', { exact: true }).fill('66')
  await page.getByRole('button', { name: refunded ? '生成退还回执' : '生成收款回执', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(4)
  const canvas = page.getByTestId('chat-canvas')
  await expect(canvas.locator('[data-card-kind="payment"]')).toHaveCount(2)
  await expect(canvas.locator('[data-card-kind="payment"]').nth(1)).toContainText(refunded ? '已退还' : '已收款')
  await expect(page.getByLabel('消息 1 支付状态', { exact: true })).toHaveValue(refunded ? 'refunded' : 'received')
  await topAction(page, '撤销')
  await expect(page.getByRole('article')).toHaveCount(3)
  await expect(page.getByLabel('消息 1 支付状态', { exact: true })).toHaveValue('pending')
  await topAction(page, '重做')
  await expect(page.getByRole('article')).toHaveCount(4)
  await page.getByLabel('消息 1 方向', { exact: true }).selectOption('left')
  await expect(canvas.locator('[data-card-kind="payment"]').first()).toContainText(refunded ? '已被退还' : '已被接受')

  await page.getByLabel('消息 3 类型', { exact: true }).selectOption('payment')
  await page.getByLabel('消息 3 支付类型', { exact: true }).selectOption('red-packet')
  await page.getByLabel('消息 3 收款人', { exact: true }).selectOption('p2')
  await page.getByRole('button', { name: '生成领取通知', exact: true }).click()
  const notice = canvas.locator('[data-payment-notice]')
  await expect(notice).toHaveText('阿花领取了你的红包')
  await expect(page.getByLabel('消息 4 方向', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '删除消息 3', exact: true }).click()
  await expect(notice).toHaveText('阿花领取了你的红包')
  await tab(page, '设置')
  await page.getByLabel('昵称：阿花', { exact: true }).fill('阿花改名')
  await expect(notice).toHaveText('阿花领取了你的红包')
  await expect(canvas.locator('[data-sender-name]')).toHaveCount(0)
  await expect(canvas).toContainText('朋友小群 (128)')

  await page.getByRole('button', { name: '项目', exact: true }).click()
  const projectDialog = page.getByRole('dialog', { name: '本地项目', exact: true })
  await projectDialog.getByText('项目 JSON 备份与恢复', { exact: true }).click()
  const backup = page.waitForEvent('download')
  await projectDialog.getByRole('button', { name: '导出项目 JSON', exact: true }).click()
  const backupPath = info.outputPath('payment-group.json')
  await (await backup).saveAs(backupPath)
  const before = JSON.parse(readFileSync(backupPath, 'utf8')).draft
  await projectDialog.getByLabel('导入项目 JSON', { exact: true }).setInputFiles(backupPath)
  await expect(projectDialog.getByText('项目已导入', { exact: true })).toBeVisible()
  await projectDialog.getByRole('button', { name: '关闭', exact: true }).click()
  await saved(page)
  const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), draftKey)
  expect(after.groupMemberCount).toBe(128)
  expect(after.participants).toHaveLength(3)
  expect(after.showGroupNicknames).toBe(false)
  expect(after.messages[0].payment.payerId).not.toBe(before.messages[0].payment.payerId)
  expect(after.messages[1].payment.sourceMessageId).toBe(after.messages[0].id)
  expect(after.messages[2].payment.sourceMessageId).toBeNull()
  await expect(notice).toHaveText('阿花领取了你的红包')

  for (const theme of ['浅色', '深色']) for (const mode of ['手机屏幕', '聊天长图']) {
    await tab(page, '设置')
    await page.getByRole('button', { name: theme, exact: true }).click()
    await page.getByRole('button', { name: mode, exact: true }).click()
    await tab(page, '预览')
    const geometry = await notice.evaluate(element => {
      const bounds = element.getBoundingClientRect(), content = element.closest('[data-chat-message-content]')!.getBoundingClientRect()
      return { center: bounds.x + bounds.width / 2, contentCenter: content.x + content.width / 2, avatarCount: element.querySelectorAll('[alt$="的头像"]').length }
    })
    expect(geometry.center).toBeCloseTo(geometry.contentCenter, 1)
    expect(geometry.avatarCount).toBe(0)
    const output = await png(page, info, `payment-${width}-${theme}-${mode}`)
    expect(output.width).toBe(1290)
    if (mode === '手机屏幕') expect(output.height).toBe(2796)
    else expect(output.height).toBeGreaterThan(400)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  }
  await page.screenshot({ path: info.outputPath(`payment-workspace-${width}.png`) })
  expect(errors).toEqual([])
})

test('local map crop selects pixels, cancels safely, survives undo/JSON and exports in both themes and modes', async ({ page }, info) => {
  test.setTimeout(90000)
  await start(page)
  await page.getByLabel('消息 1 类型', { exact: true }).selectOption('location')
  await page.getByLabel('消息 1 地点名称', { exact: true }).fill('集合地点')
  await page.getByLabel('消息 1 地点地址', { exact: true }).fill('东门')
  const upload = page.getByLabel('消息 1 上传地图截图', { exact: true })
  await upload.setInputFiles(mapFile())
  const dialog = page.getByRole('dialog', { name: '地图截图取景', exact: true })
  await expect(dialog).toBeVisible()
  await expect(page.getByRole('button', { name: '导出 PNG', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  const map = page.getByTestId('chat-canvas').getByAltText('地图截图', { exact: true })
  await expect(map).toHaveCount(0)
  await upload.setInputFiles(mapFile())
  await expect(page.getByRole('button', { name: '确认地图截图', exact: true })).toBeEnabled()
  await page.getByRole('slider', { name: '缩放地图截图', exact: true }).fill('2')
  const crop = page.getByRole('img', { name: '地图截图取景区', exact: true })
  const box = (await crop.boundingBox())!
  expect(box.width / box.height).toBeCloseTo(15 / 7, 2)
  await page.mouse.move(box.x + box.width * .75, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x - box.width * .25, box.y + box.height / 2, { steps: 8 })
  await page.mouse.up()
  await page.getByRole('button', { name: '确认地图截图', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(map).toBeVisible()
  const originalUrl = await map.getAttribute('src')
  const bitmap = await map.evaluate(async (image: HTMLImageElement) => {
    await image.decode()
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0)
    return { width: canvas.width, height: canvas.height, pixel: [...context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data] }
  })
  expect(bitmap.width).toBeLessThanOrEqual(960)
  expect(bitmap.height).toBeLessThanOrEqual(448)
  expect(bitmap.width / bitmap.height).toBe(15 / 7)
  expect(bitmap.pixel[1]).toBeGreaterThan(180)
  expect(bitmap.pixel[0]).toBeLessThan(50)
  await page.getByRole('button', { name: '移除地图截图', exact: true }).click()
  await expect(map).toHaveCount(0)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(map).toHaveAttribute('src', originalUrl!)

  await page.setViewportSize({ width: 390, height: 844 })
  await tab(page, '消息')
  await upload.setInputFiles(mapFile())
  await expect(dialog).toBeVisible()
  await page.getByRole('slider', { name: '缩放地图截图', exact: true }).fill('3')
  await crop.focus(); await page.keyboard.press('ArrowRight')
  await page.screenshot({ path: info.outputPath('map-crop-narrow.png') })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(map).toHaveAttribute('src', originalUrl!)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await saved(page); await page.reload()
  await expect(map).toHaveAttribute('src', originalUrl!)
  await page.getByRole('button', { name: '项目', exact: true }).click()
  const projectDialog = page.getByRole('dialog', { name: '本地项目', exact: true })
  await projectDialog.getByText('项目 JSON 备份与恢复', { exact: true }).click()
  const backup = page.waitForEvent('download')
  await projectDialog.getByRole('button', { name: '导出项目 JSON', exact: true }).click()
  const backupPath = info.outputPath('map.json'); await (await backup).saveAs(backupPath)
  await projectDialog.getByLabel('导入项目 JSON', { exact: true }).setInputFiles(backupPath)
  await expect(projectDialog.getByText('项目已导入', { exact: true })).toBeVisible()
  await projectDialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(map).toHaveAttribute('src', originalUrl!)
  for (const theme of ['浅色', '深色']) for (const mode of ['手机屏幕', '聊天长图']) {
    await page.getByRole('button', { name: theme, exact: true }).click()
    await page.getByRole('button', { name: mode, exact: true }).click()
    const point = await map.evaluate(element => {
      const bounds = element.getBoundingClientRect(), root = element.closest('[data-chat-canvas]')!.getBoundingClientRect()
      return { x: (bounds.x + bounds.width / 2 - root.x) / root.width, y: (bounds.y + bounds.height / 2 - root.y) / root.width }
    })
    const output = await png(page, info, `map-${theme}-${mode}`)
    const index = (Math.round(point.y * output.width) * output.width + Math.round(point.x * output.width)) * 4
    expect(output.data[index + 1]).toBeGreaterThan(180)
    expect(output.data[index]).toBeLessThan(50)
  }
  await page.screenshot({ path: info.outputPath('map-workspace.png') })
})

test('an undecodable map blocks export instead of reverting to the demonstration map', async ({ page }) => {
  await start(page)
  await page.evaluate(async key => {
    const path = '/src/app/messageFactory.ts', { createMessage } = await import(path)
    const draft = JSON.parse(localStorage.getItem(key)!)
    draft.messages = [createMessage('self', { kind: 'location', location: { name: '坏图片', address: '东门', mapDataUrl: 'data:image/png;base64,aGVsbG8=' } })]
    localStorage.setItem(key, JSON.stringify(draft))
  }, draftKey)
  await page.reload()
  await expect(page.getByTestId('chat-canvas').locator('[data-map-image-error]')).toHaveCount(1)
  await page.getByRole('button', { name: '导出 PNG', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '导出前检查', exact: true })).toContainText('地图截图无法解码，请重新上传有效图片')
  await expect(page.getByRole('button', { name: '继续导出', exact: true })).toHaveCount(0)
})

test('long immutable red-packet name snapshots wrap inside the canvas and remain exportable', async ({ page }, info) => {
  await start(page)
  const snapshotName = 'LongNickname'.repeat(15)
  await page.evaluate(async ({ key, snapshotName }) => {
    const factoryPath = '/src/app/messageFactory.ts', { createMessage } = await import(factoryPath)
    const helperPath = '/src/utils/paymentMessage.ts', { createOriginalPayment, respondToPayment } = await import(helperPath)
    const draft = JSON.parse(localStorage.getItem(key)!)
    draft.participants[1].name = snapshotName
    const payment = createOriginalPayment({ mode: 'red-packet', amount: 10, note: '恭喜发财', status: 'pending' }, 'self', draft.participants, 'group')
    payment.receiverId = draft.participants[1].id
    payment.receiverName = snapshotName
    draft.messages = [createMessage('self', { id: 'source', kind: 'payment', payment })]
    const next = respondToPayment(draft, { messageId: 'source', newId: 'notice', outcome: 'received', receiverId: draft.participants[1].id, sentAt: draft.messages[0].sentAt })
    next.participants[1].name = '已改短名'
    localStorage.setItem(key, JSON.stringify(next))
  }, { key: draftKey, snapshotName })
  await page.reload()
  const notice = page.getByTestId('chat-canvas').locator('[data-payment-notice]')
  await expect(notice).toContainText(snapshotName)
  const bounds = await notice.evaluate(element => {
    const content = element.closest('[data-chat-message-content]')!.getBoundingClientRect()
    const text = element.querySelector('span:last-child')!.getBoundingClientRect()
    return { contentLeft: content.left, contentRight: content.right, textLeft: text.left, textRight: text.right, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }
  })
  expect(bounds.textLeft).toBeGreaterThanOrEqual(bounds.contentLeft)
  expect(bounds.textRight).toBeLessThanOrEqual(bounds.contentRight)
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth)
  for (const theme of ['浅色', '深色']) {
    await page.getByRole('button', { name: theme, exact: true }).click()
    expect((await png(page, info, `long-notice-${theme}`)).width).toBe(1290)
  }
})
