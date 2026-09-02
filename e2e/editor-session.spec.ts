import { expect, test } from '@playwright/test'
import { PNG } from 'pngjs'

test('a second same-origin tab cannot overwrite the draft or collect the active editors media', async ({ page, context }) => {
  await page.goto('/')
  await page.getByLabel('聊天标题', { exact: true }).fill('只允许一个编辑页')
  await expect.poll(() => page.evaluate(async () => (await navigator.locks.query()).held?.map(lock => lock.name))).toContain('chat-screenshot-generator:editor')
  await page.getByLabel('消息 1 类型', { exact: true }).selectOption('image')
  await page.getByLabel('消息 1 上传图片', { exact: true }).setInputFiles({ name: 'retained.png', mimeType: 'image/png', buffer: PNG.sync.write({ width: 2, height: 2, data: Buffer.alloc(16, 255) }) })
  await expect(page.getByText('已保存到此浏览器', { exact: true })).toBeVisible()
  const other = await context.newPage()
  await other.goto('/')
  await expect(other.getByRole('heading', { name: '已在其他标签页打开' })).toBeVisible()
  await expect(other.getByLabel('聊天标题', { exact: true })).toHaveCount(0)
  await page.getByLabel('聊天标题', { exact: true }).fill('媒体仍然保留')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('chat-screenshot-generator:draft:v1'))).toContain('媒体仍然保留')
  await page.close()
  await other.getByRole('button', { name: '重试打开', exact: true }).click()
  await expect(other.getByLabel('聊天标题', { exact: true })).toHaveValue('媒体仍然保留')
  const image = other.getByTestId('chat-canvas').getByRole('button', { name: '查看原图', exact: true })
  await expect(image).toBeVisible()
  expect(await image.locator('img').evaluate((el: HTMLImageElement) => ({ loaded: el.complete, width: el.naturalWidth }))).toEqual({ loaded: true, width: 2 })
  await other.close()
})

test('unsupported browser locking fails closed instead of mounting unsafe autosave', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined }))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '无法安全打开编辑器' })).toBeVisible()
  await expect(page.getByText(/HTTPS/)).toBeVisible()
  await expect(page.getByLabel('聊天标题', { exact: true })).toHaveCount(0)
})
