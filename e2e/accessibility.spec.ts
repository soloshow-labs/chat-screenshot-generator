import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function expectNoAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  expect(results.violations).toEqual([])
}

test('桌面工作台没有可自动检测的 WCAG A/AA 问题', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '聊天截图生成器' })).toBeVisible()

  await expectNoAccessibilityViolations(page)
})

test('效率工具弹窗没有可自动检测的 WCAG A/AA 问题', async ({ page }) => {
  await page.goto('/')
  await page.getByText('更多操作', { exact: true }).click()
  await page.getByRole('button', { name: '效率工具', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '效率工具', exact: true })).toBeVisible()

  await expectNoAccessibilityViolations(page)
})

test('本地项目弹窗没有可自动检测的 WCAG A/AA 问题', async ({ page }) => {
  await page.goto('/')
  const projects = page.getByRole('button', { name: '项目', exact: true })
  await expect(projects).toBeEnabled()
  await projects.click()
  await expect(page.getByRole('dialog', { name: '本地项目' })).toBeVisible()

  await expectNoAccessibilityViolations(page)
})

test('窄屏工作台没有可自动检测的 WCAG A/AA 问题', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '聊天截图生成器' })).toBeVisible()

  await expectNoAccessibilityViolations(page)
})
