import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { unzipSync } from 'fflate'
import { PNG } from 'pngjs'

async function openTopAction(page: Page, name: string) {
  const action = page.getByRole('button', { name, exact: true })
  if (!await action.isVisible()) await page.getByText('更多操作', { exact: true }).click()
  await action.click()
}

async function stageCurrentPng(page: Page, expectedCount: number) {
  await openTopAction(page, '暂存 PNG')
  const continueButton = page.getByRole('button', { name: /继续暂存|继续导出/ })
  const notice = page.getByText(`PNG 已暂存（${expectedCount} / 20）`)
  await Promise.race([
    continueButton.waitFor({ state: 'visible', timeout: 10_000 }),
    notice.waitFor({ state: 'visible', timeout: 30_000 }),
  ])
  if (await continueButton.isVisible()) await continueButton.click()
  await expect(notice).toBeVisible({ timeout: 30_000 })
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`message navigator stays visible and clickable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    if (viewport.width < 1280) await page.getByRole('tab', { name: '消息', exact: true }).click()

    const navigator = page.getByRole('search', { name: '消息导航器' })
    const dropZone = page.getByRole('group', { name: '拖入或粘贴图片' })
    await expect(navigator).toBeVisible()
    const navigatorBox = await navigator.boundingBox()
    const dropZoneBox = await dropZone.boundingBox()
    expect(navigatorBox).not.toBeNull()
    expect(dropZoneBox).not.toBeNull()
    expect(navigatorBox!.y + navigatorBox!.height).toBeLessThanOrEqual(dropZoneBox!.y)

    await page.getByRole('searchbox', { name: '搜索消息' }).fill('隔壁城市')
    await page.getByRole('button', { name: '下一个匹配消息' }).click()
    await expect(page.getByLabel('消息 9 内容')).toBeVisible()
  })
}

test('desktop toolbar keeps secondary tools inside More', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')

  await expect(page.getByRole('button', { name: '暂存 PNG', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '复制 PNG', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '导出 PNG', exact: true })).toBeVisible()
  await expect(page.getByText('更多操作', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '效率工具', exact: true })).toBeHidden()
  await expect(page.getByRole('button', { name: '暂存盘（0）', exact: true })).toBeHidden()
  await expect(page.getByRole('button', { name: '重置', exact: true })).toBeHidden()

  await page.getByText('更多操作', { exact: true }).click()
  await expect(page.getByRole('button', { name: '效率工具', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '暂存盘（0）', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '重置', exact: true })).toBeVisible()
})

test('batch script starts with the script input before snippet management', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await openTopAction(page, '效率工具')
  const dialog = page.getByRole('dialog', { name: '效率工具' })
  const script = await dialog.getByLabel('聊天脚本').boundingBox()
  const snippets = await dialog.getByRole('heading', { name: '脚本片段' }).boundingBox()
  expect(script).not.toBeNull()
  expect(snippets).not.toBeNull()
  expect(script!.y).toBeLessThan(snippets!.y)
})

test('narrow primary actions and message navigator provide 44px touch targets', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  for (const locator of [
    page.getByRole('button', { name: '复制 PNG', exact: true }),
    page.getByRole('button', { name: '导出 PNG', exact: true }),
    page.getByText('更多操作', { exact: true }),
  ]) {
    const box = await locator.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }

  await page.getByRole('tab', { name: '消息', exact: true }).click()
  const compactLabel = page.getByLabel('精简编辑').locator('..')
  const compactBox = await compactLabel.boundingBox()
  expect(compactBox).not.toBeNull()
  expect(compactBox!.height).toBeGreaterThanOrEqual(44)
  for (const name of ['上一个匹配消息', '下一个匹配消息']) {
    const box = await page.getByRole('button', { name }).boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
})

test('empty snapshot queue does not present a disabled primary ZIP action', async ({ page }) => {
  await page.goto('/')
  await openTopAction(page, '暂存盘（0）')
  const zipButton = page.getByRole('button', { name: '批量下载 ZIP' })
  await expect(zipButton).toBeDisabled()
  expect(await zipButton.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)')
})

test('stages real PNGs and downloads them as a valid ZIP', async ({ page }, testInfo) => {
  await page.goto('/')
  await stageCurrentPng(page, 1)
  await stageCurrentPng(page, 2)
  await openTopAction(page, '暂存盘（2）')
  const dialog = page.getByRole('dialog', { name: '截图暂存盘' })
  await expect(dialog).toContainText('2 / 20 张')

  const downloadPromise = page.waitForEvent('download')
  await dialog.getByRole('button', { name: '批量下载 ZIP' }).click()
  const download = await downloadPromise
  const archivePath = testInfo.outputPath('snapshot-queue.zip')
  await download.saveAs(archivePath)
  const files = unzipSync(new Uint8Array(readFileSync(archivePath)))
  const names = Object.keys(files).sort()
  expect(names).toHaveLength(2)
  expect(new Set(names).size).toBe(2)
  for (const name of names) {
    expect(name).toMatch(/\.png$/)
    const png = PNG.sync.read(Buffer.from(files[name]))
    expect(png.width).toBe(1290)
    expect(png.height).toBe(2796)
  }
})
