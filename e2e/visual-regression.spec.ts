import { expect, test, type Page } from '@playwright/test'

const draftKey = 'chat-screenshot-generator:draft:v1'

async function stabilize(page: Page) {
  await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }' })
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(Array.from(document.images).map(image => image.complete ? undefined : new Promise<void>(resolve => image.addEventListener('load', () => resolve(), { once: true }))))
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })
}

test('default chat canvas remains stable in light and dark themes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await expect(page.getByText('已保存到此浏览器')).toBeVisible()
  await stabilize(page)
  const canvas = page.getByTestId('chat-canvas')
  await expect(canvas).toHaveScreenshot('default-canvas-light.png')
  await page.getByRole('button', { name: '深色', exact: true }).click()
  await stabilize(page)
  await expect(canvas).toHaveScreenshot('default-canvas-dark.png')
})

test('rich-card matrix keeps payment, contact, location, file and video geometry', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.evaluate(async storageKey => {
    const { SAMPLE_DRAFT } = await import('/src/app/sampleDraft.ts')
    const { createMessage } = await import('/src/app/messageFactory.ts')
    const { saveMediaAsset } = await import('/src/services/mediaAssetStore.ts')
    const canvas = document.createElement('canvas')
    canvas.width = 220; canvas.height = 124
    const context = canvas.getContext('2d')!
    context.fillStyle = '#4a9fd2'; context.fillRect(0, 0, 220, 124)
    context.fillStyle = '#f7ca52'; context.beginPath(); context.arc(170, 32, 18, 0, Math.PI * 2); context.fill()
    const posterDataUrl = canvas.toDataURL('image/png')
    const file = await saveMediaAsset(new File(['visual file'], '方案说明.pdf', { type: 'application/pdf' }), { mimeType: 'application/pdf', sizeBytes: 11 })
    const video = await saveMediaAsset(new File(['visual video'], '介绍视频.mp4', { type: 'video/mp4' }), { mimeType: 'video/mp4', width: 220, height: 124, durationSeconds: 65, posterDataUrl })
    const messages = [
      createMessage('self', { kind: 'payment', timeVisibility: 'show', payment: { mode: 'transfer', amount: 88.8, note: '餐费', status: 'pending' } }),
      createMessage('p2', { kind: 'payment', timeVisibility: 'hide', payment: { mode: 'red-packet', amount: 0, note: '生日快乐', status: 'received' } }),
      createMessage('p3', { kind: 'contact', timeVisibility: 'hide', contactCard: { name: '林设计师', description: '个人名片', avatarDataUrl: null } }),
      createMessage('self', { kind: 'location', timeVisibility: 'hide', location: { name: '西湖文化广场', address: '杭州市拱墅区环城北路' } }),
      createMessage('p2', { kind: 'file', timeVisibility: 'hide', media: { assetId: file.id, fileName: file.fileName, mimeType: file.mimeType, sizeBytes: 11 } }),
      createMessage('self', { kind: 'video', timeVisibility: 'hide', media: { assetId: video.id, fileName: video.fileName, mimeType: video.mimeType, width: 220, height: 124, durationSeconds: 65, posterDataUrl } }),
    ]
    localStorage.setItem(storageKey, JSON.stringify({ ...SAMPLE_DRAFT, title: '富消息视觉矩阵', outputMode: 'long', messages }))
  }, draftKey)
  await page.reload()
  await expect(page.getByText('已保存到此浏览器')).toBeVisible()
  await stabilize(page)
  const snapshotName = process.platform === 'linux' ? 'rich-card-matrix-linux.png' : 'rich-card-matrix.png'
  await expect(page.getByTestId('chat-canvas')).toHaveScreenshot(snapshotName)
})

test('opt-in iOS microstates retain a deterministic canvas baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.evaluate(async storageKey => {
    const { SAMPLE_DRAFT } = await import('/src/app/sampleDraft.ts')
    localStorage.setItem(storageKey, JSON.stringify({
      ...SAMPLE_DRAFT,
      theme: 'light',
      statusTime: '08:09',
      batteryCharging: true,
      showDoNotDisturb: true,
      earpieceMode: true,
      chatUnreadCount: 12,
    }))
  }, draftKey)
  await page.reload()
  await expect(page.getByText('已保存到此浏览器')).toBeVisible()
  await stabilize(page)
  const canvas = page.getByTestId('chat-canvas')
  await expect(canvas.getByLabel('正在充电，电量 85%')).toBeVisible()
  await expect(canvas.getByLabel('勿扰模式')).toBeVisible()
  await expect(canvas.getByText('当前为听筒播放模式')).toBeVisible()
  await expect(canvas).toHaveScreenshot('ios-microstates.png')
})

test('desktop, project dialog and narrow workspace retain their layout hierarchy', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await expect(page.getByText('已保存到此浏览器')).toBeVisible()
  await stabilize(page)
  await expect(page).toHaveScreenshot('workspace-desktop.png')

  const projects = page.getByRole('button', { name: '项目', exact: true })
  await expect(projects).toBeEnabled()
  await projects.click()
  const dialog = page.getByRole('dialog', { name: '本地项目' })
  await expect(dialog).toBeVisible()
  await stabilize(page)
  await expect(dialog).toHaveScreenshot('project-manager.png', {
    mask: [dialog.locator('[data-dynamic-project-time]'), dialog.locator('[data-dynamic-storage-usage]')],
    maskColor: '#eef1f4',
  })
  await page.getByRole('button', { name: '关闭', exact: true }).click()

  await page.setViewportSize({ width: 390, height: 844 })
  await stabilize(page)
  await expect(page).toHaveScreenshot('workspace-narrow.png')
})
