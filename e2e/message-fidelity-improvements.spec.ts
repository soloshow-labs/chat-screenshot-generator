import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'

const draftKey = 'chat-screenshot-generator:draft:v1'

async function exportPng(page: Page, info: TestInfo, filename: string) {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 PNG', exact: true }).click()
  const confirm = page.getByRole('button', { name: '继续导出', exact: true })
  // This fixture always has missing-avatar warnings; wait for preflight to render them.
  await confirm.click()
  const path = info.outputPath(filename)
  await (await download).saveAs(path)
  await info.attach(filename, { path, contentType: 'image/png' })
  return PNG.sync.read(readFileSync(path))
}

test('directional voice, call, and file internals use adjacent content and exposed tails', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.evaluate(async (key) => {
    const samplePath = '/src/app/sampleDraft.ts'
    const factoryPath = '/src/app/messageFactory.ts'
    const { SAMPLE_DRAFT } = await import(samplePath)
    const { createMessage } = await import(factoryPath)
    const sentAt = '2026-08-31T10:00:00+08:00'
    const self = SAMPLE_DRAFT.participants.find((participant) => participant.isSelf)!
    const other = SAMPLE_DRAFT.participants.find((participant) => !participant.isSelf)!
    const voice = (participantId: string, side: 'left' | 'right', voiceUnread = false) => createMessage(participantId, {
      kind: 'voice', side, sentAt, timeVisibility: 'hide', voiceUnread,
      voice: { durationMode: 'manual', durationSeconds: 10, transcript: '', showTranscript: false },
    })
    const call = (participantId: string, side: 'left' | 'right') => createMessage(participantId, {
      kind: 'call', side, sentAt, timeVisibility: 'hide',
      call: { mode: 'voice', status: 'missed', durationSeconds: 0 },
    })
    const file = (participantId: string, side: 'left' | 'right') => createMessage(participantId, {
      kind: 'file', side, sentAt, timeVisibility: 'hide',
      media: { assetId: `missing-${side}`, fileName: `${side}.pdf`, mimeType: 'application/pdf', expired: true },
    })
    localStorage.setItem(key, JSON.stringify({
      ...SAMPLE_DRAFT,
      title: '消息还原度',
      outputMode: 'long',
      messages: [voice(other.id, 'left', true), voice(self.id, 'right'), call(other.id, 'left'), call(self.id, 'right'), file(other.id, 'left'), file(self.id, 'right')],
    }))
  }, draftKey)
  await page.reload()

  const canvas = page.getByTestId('chat-canvas')
  const voiceGeometry = await canvas.locator('[data-testid="voice-glyph"]').evaluateAll((glyphs) => glyphs.map((glyph) => {
    const bubble = glyph.parentElement!
    const seconds = Array.from(bubble.querySelectorAll('span')).find((span) => span.textContent === '10″')!
    const glyphBox = glyph.getBoundingClientRect(), secondsBox = seconds.getBoundingClientRect(), bubbleBox = bubble.getBoundingClientRect()
    const unread = bubble.querySelector<HTMLElement>('[data-testid="voice-unread"]')?.getBoundingClientRect()
    return {
      glyphX: glyphBox.x,
      secondsX: secondsBox.x,
      gap: Math.max(glyphBox.x, secondsBox.x) - Math.min(glyphBox.right, secondsBox.right),
      bubbleCenterY: bubbleBox.y + bubbleBox.height / 2,
      unreadCenterY: unread ? unread.y + unread.height / 2 : null,
    }
  }))
  expect(voiceGeometry).toHaveLength(2)
  expect(voiceGeometry[0].glyphX).toBeLessThan(voiceGeometry[0].secondsX)
  expect(voiceGeometry[1].secondsX).toBeLessThan(voiceGeometry[1].glyphX)
  for (const { gap } of voiceGeometry) {
    expect(gap).toBeGreaterThanOrEqual(0)
    expect(gap).toBeLessThanOrEqual(10)
  }
  expect(Math.abs(voiceGeometry[0].unreadCenterY! - voiceGeometry[0].bubbleCenterY)).toBeLessThanOrEqual(1)

  const callGeometry = await canvas.locator('[data-testid="call-icon"]').evaluateAll((icons) => icons.map((icon) => {
    const bubble = icon.parentElement!
    const text = Array.from(bubble.querySelectorAll('span')).find((span) => span.textContent === '未接听')!
    return { iconX: icon.getBoundingClientRect().x, textX: text.getBoundingClientRect().x }
  }))
  expect(callGeometry[0].iconX).toBeLessThan(callGeometry[0].textX)
  expect(callGeometry[1].textX).toBeLessThan(callGeometry[1].iconX)

  const fileGeometry = await canvas.locator('[data-card-kind="file"]').evaluateAll((cards) => cards.map((card) => {
    const cardBox = card.getBoundingClientRect(), tailBox = card.querySelector<HTMLElement>('[data-card-tail]')!.getBoundingClientRect()
    return { side: card.getAttribute('data-side'), tailCenterX: tailBox.x + tailBox.width / 2, left: cardBox.left, right: cardBox.right, overflow: getComputedStyle(card).overflow }
  }))
  expect(fileGeometry[0]).toMatchObject({ side: 'left', overflow: 'visible' })
  expect(fileGeometry[0].tailCenterX).toBeLessThan(fileGeometry[0].left)
  expect(fileGeometry[1]).toMatchObject({ side: 'right', overflow: 'visible' })
  expect(fileGeometry[1].tailCenterX).toBeGreaterThan(fileGeometry[1].right)
})

test('manual voice durations and directional file cards export faithfully in both themes and output modes', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.evaluate(async (key) => {
    const samplePath = '/src/app/sampleDraft.ts'
    const factoryPath = '/src/app/messageFactory.ts'
    const mediaStorePath = '/src/services/mediaAssetStore.ts'
    const { SAMPLE_DRAFT } = await import(samplePath)
    const { createMessage } = await import(factoryPath)
    const { saveMediaAsset } = await import(mediaStorePath)
    const attachment = await saveMediaAsset(new File(['task 1 local attachment'], 'directional.pdf', { type: 'application/pdf' }))
    const self = SAMPLE_DRAFT.participants.find((participant) => participant.isSelf)!
    const other = SAMPLE_DRAFT.participants.find((participant) => !participant.isSelf)!
    const sentAt = '2026-08-31T10:00:00+08:00'
    const messages = [1, 10, 60].flatMap((duration) => [
      createMessage(other.id, {
        kind: 'voice', side: 'left', sentAt, timeVisibility: 'hide', voiceUnread: duration === 10,
        voice: { durationMode: 'manual', durationSeconds: duration, transcript: '', showTranscript: false },
      }),
      createMessage(self.id, {
        kind: 'voice', side: 'right', sentAt, timeVisibility: 'hide',
        voice: { durationMode: 'manual', durationSeconds: duration, transcript: '', showTranscript: false },
      }),
    ])
    messages.push(
      createMessage(other.id, { kind: 'call', side: 'left', sentAt, timeVisibility: 'hide', call: { mode: 'voice', status: 'missed', durationSeconds: 0 } }),
      createMessage(self.id, { kind: 'call', side: 'right', sentAt, timeVisibility: 'hide', call: { mode: 'voice', status: 'missed', durationSeconds: 0 } }),
      createMessage(other.id, { kind: 'file', side: 'left', sentAt, timeVisibility: 'hide', media: { assetId: attachment.id, fileName: attachment.fileName, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes } }),
      createMessage(self.id, { kind: 'file', side: 'right', sentAt, timeVisibility: 'hide', media: { assetId: attachment.id, fileName: attachment.fileName, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes } }),
    )
    localStorage.setItem(key, JSON.stringify({ ...SAMPLE_DRAFT, title: '消息还原度导出', theme: 'light', outputMode: 'screen', messages }))
  }, draftKey)
  await page.reload()

  const canvas = page.getByTestId('chat-canvas')
  const downloads = canvas.getByRole('link', { name: '下载文件', exact: true })
  await expect(downloads).toHaveCount(2)
  await expect(downloads.first()).toHaveAttribute('href', /^blob:/)
  await expect(canvas).not.toContainText('找不到媒体素材')
  const desktopVoice = await canvas.locator('[data-testid="voice-glyph"]').evaluateAll((glyphs) => glyphs.map((glyph) => {
    const bubble = glyph.parentElement!
    const seconds = Array.from(bubble.querySelectorAll('span')).find((span) => /″$/.test(span.textContent ?? ''))!
    return { iconX: glyph.getBoundingClientRect().x, secondsX: seconds.getBoundingClientRect().x, duration: seconds.textContent }
  }))
  expect(desktopVoice.map(({ duration }) => duration)).toEqual(['1″', '1″', '10″', '10″', '60″', '60″'])
  for (const [index, geometry] of desktopVoice.entries()) {
    if (index % 2 === 0) expect(geometry.iconX).toBeLessThan(geometry.secondsX)
    else expect(geometry.secondsX).toBeLessThan(geometry.iconX)
  }
  const desktopFiles = await canvas.locator('[data-card-kind="file"]').evaluateAll((cards) => cards.map((card) => {
    const cardBox = card.getBoundingClientRect(), tailBox = card.querySelector<HTMLElement>('[data-card-tail]')!.getBoundingClientRect()
    return { side: card.getAttribute('data-side'), tailCenterX: tailBox.x + tailBox.width / 2, left: cardBox.left, right: cardBox.right }
  }))
  expect(desktopFiles[0].tailCenterX).toBeLessThan(desktopFiles[0].left)
  expect(desktopFiles[1].tailCenterX).toBeGreaterThan(desktopFiles[1].right)
  const iconPoint = await canvas.locator('[data-card-kind="file"]').first().getByRole('img', { name: 'PDF 文件', exact: true }).evaluate((element) => {
    const rect = element.getBoundingClientRect(), canvas = element.closest('[data-testid="chat-canvas"]')!.getBoundingClientRect()
    return { x: (rect.left + 4 - canvas.left) / canvas.width, y: (rect.top + rect.height - 5 - canvas.top) / canvas.width }
  })

  for (const theme of ['浅色', '深色'] as const) {
    await page.getByRole('button', { name: theme, exact: true }).click()
    for (const mode of ['手机屏幕', '聊天长图'] as const) {
      await page.getByRole('button', { name: mode, exact: true }).click()
      const png = await exportPng(page, info, `message-fidelity-${theme}-${mode}.png`)
      expect(png.width).toBe(1290)
      if (mode === '手机屏幕') expect(png.height).toBe(2796)
      else expect(png.height).toBeGreaterThanOrEqual(2796)
      const point = (Math.round(iconPoint.y * png.width) * png.width + Math.round(iconPoint.x * png.width)) * 4
      const pixel = Array.from(png.data.subarray(point, point + 4))
      expect(pixel[0]).toBeGreaterThan(180)
      expect(pixel[1]).toBeGreaterThan(110)
      expect(pixel[2]).toBeLessThan(100)
      expect(pixel[3]).toBe(255)
    }
  }
  await page.screenshot({ path: info.outputPath('message-fidelity-desktop.png') })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('tab', { name: '预览', exact: true }).click()
  await expect(canvas).toHaveCSS('width', '430px')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: info.outputPath('message-fidelity-narrow.png') })
})
