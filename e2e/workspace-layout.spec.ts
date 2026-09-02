import { expect, test } from '@playwright/test'

test('desktop workspace owns the viewport without a second page scrollbar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 })
  await page.goto('/')

  // The top bar can become taller when Chrome text scaling or translations
  // make its actions wrap. The workspace must use the actual remaining space.
  await page.addStyleTag({ content: '[class*="_topbar_"] { min-height: 96px !important; }' })

  const layout = await page.evaluate(() => {
    const workspace = document.querySelector('main')!.getBoundingClientRect()
    return {
      viewportHeight: window.innerHeight,
      pageHeight: document.documentElement.scrollHeight,
      workspaceBottom: workspace.bottom,
    }
  })

  expect(layout.pageHeight).toBe(layout.viewportHeight)
  expect(layout.workspaceBottom).toBeCloseTo(layout.viewportHeight, 1)
})

test('hidden media inputs in a long editor do not enlarge the document', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 })
  await page.goto('/')

  const addMessage = page.getByRole('button', { name: '添加消息', exact: true })
  for (let index = 0; index < 10; index += 1) {
    await addMessage.click()
    const row = page.getByRole('article').last()
    await row.getByLabel(/类型/).selectOption('image')
  }

  const lastRow = page.getByRole('article').last()
  await lastRow.getByLabel(/上传图片/).focus()

  const layout = await page.evaluate(() => ({
    viewportHeight: window.innerHeight,
    pageHeight: document.documentElement.scrollHeight,
    pageScrollTop: document.documentElement.scrollTop,
  }))

  expect(layout.pageHeight).toBe(layout.viewportHeight)
  expect(layout.pageScrollTop).toBe(0)
})

test('narrow workspace stays inside the viewport and keeps secondary actions in More', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  const layout = await page.evaluate(() => ({
    viewportHeight: window.innerHeight,
    pageHeight: document.documentElement.scrollHeight,
    bodyHeight: document.body.scrollHeight,
    pageOverflowY: getComputedStyle(document.documentElement).overflowY,
  }))
  expect(layout.pageHeight).toBe(layout.viewportHeight)
  expect(layout.bodyHeight).toBe(layout.viewportHeight)
  expect(layout.pageOverflowY).not.toBe('scroll')

  await expect(page.getByRole('button', { name: '复制 PNG', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '导出 PNG', exact: true })).toBeVisible()
  await expect(page.getByText('更多操作', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '效率工具', exact: true })).toBeHidden()
  await page.getByText('更多操作', { exact: true }).click()
  await expect(page.getByRole('button', { name: '效率工具', exact: true })).toBeVisible()
  await page.getByText('更多操作', { exact: true }).click()

  await page.getByRole('tab', { name: '消息', exact: true }).click()
  const scroller = page.locator('[class*="_scroller_"]')
  expect(await scroller.evaluate(element => getComputedStyle(element).overflowY)).toBe('auto')
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(844)
})
