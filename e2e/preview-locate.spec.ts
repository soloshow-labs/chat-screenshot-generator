import { expect, test } from '@playwright/test'
import { PNG } from 'pngjs'

test('preview locating focuses the editor and its overlay never appears in PNG', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  const canvas = page.getByTestId('chat-canvas')
  const render = () => canvas.evaluate(async element => {
    const modulePath = '/src/services/exportChatImage.ts'
    const { exportChatImage } = await import(modulePath)
    return (await exportChatImage(element, '定位检查', { outputMode: 'screen', outputWidth: 430, outputHeight: 932, exportScale: 1 })).dataUrl
  })
  const before = await render()
  await page.getByRole('button', { name: '定位编辑', exact: true }).click()
  const pick = page.getByRole('button', { name: '定位消息 2 到编辑器', exact: true })
  await pick.focus()
  expect(await render()).toBe(before)
  await pick.click()
  const row = page.getByRole('article', { name: '消息 2', exact: true })
  await expect(row).toBeFocused()
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '定位编辑', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(canvas.locator('[data-preview-only]')).toHaveCount(0)
})

test('preview locating works on a narrow screen and can be repeated with a keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByRole('tab', { name: '预览', exact: true }).click()
    await page.getByRole('button', { name: '定位编辑', exact: true }).click()
    const pageScroll = await page.evaluate(() => window.scrollY)
    await page.getByRole('button', { name: '定位消息 3 到编辑器', exact: true }).press('Enter')
    await expect(page.getByRole('tab', { name: '消息', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('article', { name: '消息 3', exact: true })).toBeFocused()
    expect(await page.evaluate(() => window.scrollY)).toBe(pageScroll)
  }
  const row = page.getByRole('article', { name: '消息 3', exact: true })
  await expect(row.getByLabel('消息 3 内容', { exact: true })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflow).toBe(false)
})

test('locator wrappers preserve ordinary-message geometry and PNG in every theme and output mode', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  for (const theme of ['浅色', '深色']) {
    await page.getByRole('button', { name: theme, exact: true }).click()
    for (const mode of ['手机屏幕', '聊天长图']) {
      await page.getByRole('button', { name: mode, exact: true }).click()
      const result = await page.getByTestId('chat-canvas').evaluate(async element => {
        const modulePath = '/src/services/exportChatImage.ts'
        const { exportChatImage } = await import(modulePath)
        const clone = element.cloneNode(true) as HTMLElement
        clone.style.position = 'absolute'
        clone.style.left = '-5000px'
        document.body.append(clone)
        const options = { outputMode: element.getAttribute('data-output-mode'), outputWidth: 430, outputHeight: 932, exportScale: 1 }
        const measure = () => {
          const origin = clone.getBoundingClientRect()
          return Array.from(clone.querySelectorAll('[data-message-bubble]')).map(bubble => {
            const box = bubble.getBoundingClientRect()
            return { x: box.x - origin.x, y: box.y - origin.y, width: box.width, height: box.height }
          })
        }
        try {
          const wrapped = measure()
          const wrappedPng = (await exportChatImage(clone, 'wrapped', options)).dataUrl
          for (const wrapper of clone.querySelectorAll('[data-preview-message]')) {
            const content = wrapper.firstElementChild!
            wrapper.replaceWith(...Array.from(content.childNodes))
          }
          const unwrapped = measure()
          const unwrappedPng = (await exportChatImage(clone, 'unwrapped', options)).dataUrl
          return { wrapped, unwrapped, equalPng: wrappedPng === unwrappedPng }
        } finally { clone.remove() }
      })
      expect(result.wrapped).toEqual(result.unwrapped)
      expect(result.equalPng).toBe(true)
    }
  }
})

test('leaving locate mode restores normal image-viewer interaction', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('消息 1 类型', { exact: true }).selectOption('image')
  await page.getByLabel('消息 1 上传图片', { exact: true }).setInputFiles({
    name: 'locator-image.png', mimeType: 'image/png',
    buffer: PNG.sync.write({ width: 2, height: 2, data: Buffer.alloc(16, 255) }),
  })
  await expect(page.getByRole('button', { name: '查看原图' })).toBeVisible()
  await page.getByRole('button', { name: '定位编辑', exact: true }).click()
  await page.getByRole('button', { name: '定位消息 1 到编辑器', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '原图预览' })).toHaveCount(0)
  await page.getByRole('button', { name: '查看原图' }).click()
  await expect(page.getByRole('dialog', { name: '原图预览' })).toBeVisible()
  await page.getByRole('button', { name: '关闭原图', exact: true }).click()
  await page.getByRole('button', { name: '定位编辑', exact: true }).click()
  await page.getByRole('button', { name: '取消定位', exact: true }).click()
  await page.getByRole('button', { name: '查看原图' }).click()
  await expect(page.getByRole('dialog', { name: '原图预览' })).toBeVisible()
})

test.describe('touch preview locating', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })
  test('tapping a preview message activates its editor row', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('tab', { name: '预览', exact: true }).tap()
    await page.getByRole('button', { name: '定位编辑', exact: true }).tap()
    await page.getByRole('button', { name: '定位消息 2 到编辑器', exact: true }).tap()
    await expect(page.getByRole('tab', { name: '消息', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('article', { name: '消息 2', exact: true })).toBeFocused()
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
  })
})
