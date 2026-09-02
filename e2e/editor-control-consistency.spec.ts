import { expect, test, type Locator, type Page } from '@playwright/test'

async function controlStyle(locator: Locator) {
  return locator.evaluate(element => {
    const style = getComputedStyle(element), rect = element.getBoundingClientRect()
    return { fontSize: style.fontSize, height: rect.height, width: rect.width, color: style.color, direction: style.flexDirection }
  })
}

async function clickSecondaryTopAction(page: Page, name: string) {
  const action = page.getByRole('button', { name, exact: true })
  if (!await action.isVisible()) await page.getByText('更多操作', { exact: true }).click()
  await action.click()
}

for (const width of [1440, 390]) {
  test(`rich attachment controls match adjacent editor fields at ${width}px`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize({ width, height: 950 })
    await page.goto('/')
    if (await page.getByRole('tab', { name: '消息', exact: true }).isVisible()) await page.getByRole('tab', { name: '消息', exact: true }).click()
    const row = page.getByRole('article', { name: '消息 1', exact: true })
    await row.getByLabel('消息 1 类型', { exact: true }).selectOption('file')
    const upload = row.getByLabel('消息 1 上传文件', { exact: true })
    await upload.setInputFiles({ name: 'layout-check.txt', mimeType: 'text/plain', buffer: Buffer.from('synthetic layout fixture') })
    const remove = row.getByRole('button', { name: '移除附件', exact: true })
    await expect(remove).toBeVisible()
    const filename = row.getByLabel('消息 1 文件名称', { exact: true })
    const expired = row.getByLabel('消息 1 文件已过期', { exact: true })
    await upload.focus()
    expect.soft(await upload.locator('..').evaluate(element => getComputedStyle(element).outlineWidth)).toBe('3px')
    const styles = {
      remove: await controlStyle(remove), filename: await controlStyle(filename),
      fieldLabel: await controlStyle(filename.locator('..').locator('span')),
      upload: await controlStyle(upload.locator('..')),
      checkbox: await controlStyle(expired.locator('..')),
    }
    await info.attach('rich-control-metrics', { body: JSON.stringify(styles, null, 2), contentType: 'application/json' })
    await page.screenshot({ path: info.outputPath(`rich-controls-${width}.png`) })
    expect.soft(styles.remove.fontSize).toBe('12px')
    expect.soft(styles.remove.height).toBe(width === 390 ? 40 : 32)
    expect.soft(styles.remove.width).toBeLessThan(120)
    expect.soft(styles.remove.color).toBe('rgb(214, 69, 69)')
    expect.soft(styles.filename.fontSize).toBe('12px')
    expect.soft(styles.filename.height).toBe(width === 390 ? 40 : 32)
    expect.soft(styles.fieldLabel.fontSize).toBe('10px')
    expect.soft(styles.upload.height).toBe(width === 390 ? 40 : 32)
    expect.soft(styles.checkbox.direction).toBe('row')
    await expired.check()
    await expect(expired).toBeChecked()
    await remove.click()
    await expect(remove).toHaveCount(0)
    await clickSecondaryTopAction(page, '撤销')
    await expect(filename).toHaveValue('layout-check.txt')
    await expect(expired).toBeChecked()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    expect(errors).toEqual([])
  })

  test(`productivity tabs use the editor typography and compact controls at ${width}px`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize({ width, height: 950 })
    await page.goto('/')
    await clickSecondaryTopAction(page, '效率工具')
    const dialog = page.getByRole('dialog', { name: '效率工具', exact: true })
    await expect(dialog).toBeVisible()
    expect.soft((await controlStyle(dialog)).fontSize).toBe('13px')
    expect.soft((await controlStyle(dialog.getByRole('heading', { level: 2 }))).fontSize).toBe('16px')
    for (const tab of ['批量脚本', '场景模板', '质量检查']) {
      await dialog.getByRole('tab', { name: tab, exact: true }).click()
      await expect(dialog.getByRole('tab', { name: tab, exact: true })).toHaveAttribute('aria-selected', 'true')
      const metrics = await dialog.locator('button, input, select, textarea, label, h3, p').evaluateAll(elements => elements.map(element => ({
        tag: element.tagName, type: element.getAttribute('type'), text: element.textContent?.slice(0, 30),
        fontSize: getComputedStyle(element).fontSize, height: element.getBoundingClientRect().height,
      })))
      await info.attach(`${tab}-metrics-${width}`, { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' })
      for (const metric of metrics) {
        expect.soft(metric.fontSize, `${tab} ${metric.tag} ${metric.text}`).toBe(['P', 'H3'].includes(metric.tag) ? '13px' : '12px')
        if (['BUTTON', 'INPUT', 'SELECT'].includes(metric.tag)) expect.soft(metric.height, `${tab} ${metric.tag} ${metric.text}`).toBe(width === 390 ? 40 : 32)
        if (metric.tag === 'TEXTAREA') expect.soft(metric.height).toBeGreaterThan(96)
      }
      if (tab === '批量脚本') {
        await dialog.getByLabel('聊天脚本', { exact: true }).fill('小美：统一控件检查')
        await expect(dialog.getByRole('button', { name: '应用脚本', exact: true })).toBeEnabled()
      }
      if (tab === '场景模板') {
        await dialog.getByRole('button', { name: '应用两人日常单聊', exact: true }).click()
        await expect(dialog.getByRole('button', { name: '确认应用模板', exact: true })).toBeVisible()
        await dialog.getByRole('button', { name: '取消应用模板', exact: true }).click()
      }
      if (tab === '质量检查') {
        await dialog.getByRole('button', { name: '运行质量检查', exact: true }).click()
        await expect(dialog.getByRole('list')).toBeVisible()
      }
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      await page.screenshot({ path: info.outputPath(`productivity-${tab}-${width}.png`) })
    }
    await dialog.getByRole('button', { name: '关闭效率工具', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    expect(errors).toEqual([])
  })

  test(`workspace titles and export checks keep one visual hierarchy at ${width}px`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize({ width, height: 950 })
    await page.goto('/')

    const workspaceTitles = await page.locator('main h2').evaluateAll(headings => headings.map(heading => ({
      text: heading.textContent,
      fontSize: getComputedStyle(heading).fontSize,
      fontWeight: getComputedStyle(heading).fontWeight,
    })))
    expect(workspaceTitles.length).toBeGreaterThan(2)
    for (const title of workspaceTitles) {
      expect.soft(title.fontSize, title.text ?? 'workspace title').toBe('15px')
      expect.soft(Number(title.fontWeight), title.text ?? 'workspace title').toBeGreaterThanOrEqual(600)
    }

    await page.getByRole('button', { name: '复制 PNG', exact: true }).click()
    const exportDialog = page.getByRole('dialog', { name: '复制前检查', exact: true })
    await expect(exportDialog).toBeVisible()
    await expect(exportDialog.getByRole('tablist', { name: '效率工具分类' })).toHaveCount(0)
    expect.soft((await controlStyle(exportDialog.getByRole('heading', { level: 2 }))).fontSize).toBe('16px')
    for (const button of await exportDialog.getByRole('button').all()) {
      expect.soft((await controlStyle(button)).height).toBe(width === 390 ? 40 : 32)
    }
    await page.screenshot({ path: info.outputPath(`export-check-${width}.png`) })
    await exportDialog.getByRole('button', { name: '关闭复制前检查', exact: true }).click()

    await clickSecondaryTopAction(page, '效率工具')
    const productivityDialog = page.getByRole('dialog', { name: '效率工具', exact: true })
    await expect(productivityDialog.getByRole('tablist', { name: '效率工具分类' })).toBeVisible()
    expect.soft((await controlStyle(productivityDialog.getByRole('heading', { level: 2 }))).fontSize).toBe('16px')
    await productivityDialog.getByRole('button', { name: '关闭效率工具', exact: true }).click()
    expect(errors).toEqual([])
  })
}
