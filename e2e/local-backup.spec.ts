import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

for (const width of [1440, 768, 521, 390, 320]) {
  test(`local-save controls and storage explanation fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    const backup = page.getByRole('button', { name: '项目', exact: true })
    const summary = page.getByText('存储说明', { exact: true })
    await expect(backup).toBeVisible()
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    const controls = [page.getByText('已保存到此浏览器', { exact: true }), backup, summary]
    await expect(controls[0]).toBeVisible()
    const boxes = await Promise.all(controls.map(control => control.boundingBox()))
    for (const box of boxes) {
      expect(box).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    }
    for (let index = 1; index < boxes.length; index++) {
      const previous = boxes[index - 1]!
      const current = boxes[index]!
      expect(current.x >= previous.x + previous.width || current.y >= previous.y + previous.height, JSON.stringify({ previous, current })).toBe(true)
    }
    await summary.click()
    const notice = page.getByText('数据保存在当前浏览器', { exact: true }).locator('..')
    await expect(notice).toBeVisible()
    const bounds = await notice.boundingBox()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await summary.click()
    await backup.click()
    const dialog = page.getByRole('dialog', { name: '本地项目', exact: true })
    await expect(dialog).toBeVisible()
    await dialog.getByText('项目 JSON 备份与恢复', { exact: true }).click()
    await expect(dialog.getByRole('button', { name: '导出项目 JSON', exact: true })).toBeVisible()
  })
}

test('the backup shortcut downloads the current editable project and restores it', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('聊天标题', { exact: true }).fill('备份恢复验证')
  await expect(page.getByText('已保存到此浏览器', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '项目', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: '本地项目', exact: true })
  await dialog.getByText('项目 JSON 备份与恢复', { exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await dialog.getByRole('button', { name: '导出项目 JSON', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('备份恢复验证.json')
  const path = await download.path()
  expect(path).not.toBeNull()
  const json = JSON.parse(await readFile(path!, 'utf8'))
  expect(json.fileType).toBe('chat-screenshot-project')
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByLabel('聊天标题', { exact: true }).fill('修改后的标题')
  await page.getByRole('button', { name: '项目', exact: true }).click()
  dialog = page.getByRole('dialog', { name: '本地项目', exact: true })
  await dialog.getByText('项目 JSON 备份与恢复', { exact: true }).click()
  await dialog.getByLabel('导入项目 JSON', { exact: true }).setInputFiles(path!)
  await expect(dialog.getByText('项目已导入', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(page.getByLabel('聊天标题', { exact: true })).toHaveValue('备份恢复验证')
})

test('local projects can be created, renamed, switched and reopened after reload', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '项目', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '项目', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '本地项目', exact: true })

  await dialog.getByLabel('项目名称', { exact: true }).fill('项目甲')
  await dialog.getByRole('button', { name: '保存项目名称', exact: true }).click()
  await expect(dialog.getByText('名称已保存', { exact: true })).toBeVisible()

  await dialog.getByRole('button', { name: '新建项目', exact: true }).click()
  await expect(dialog.getByText('已新建项目', { exact: true })).toBeVisible()
  await dialog.getByLabel('项目名称', { exact: true }).fill('项目乙')
  await dialog.getByRole('button', { name: '保存项目名称', exact: true }).click()
  await expect(dialog.getByRole('button', { name: '选择项目 项目甲', exact: true })).toBeVisible()

  await dialog.getByRole('button', { name: '选择项目 项目甲', exact: true }).click()
  await dialog.getByRole('button', { name: '打开选中项目', exact: true }).click()
  await expect(dialog.getByText('项目已打开', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(page.getByLabel('聊天标题', { exact: true })).toHaveValue('项目甲')

  await page.reload()
  await expect(page.getByLabel('聊天标题', { exact: true })).toHaveValue('项目甲')
  await page.getByRole('button', { name: '项目', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '本地项目', exact: true }).getByRole('button', { name: '选择项目 项目乙', exact: true })).toBeVisible()
})
