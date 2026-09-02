import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { unzipSync } from 'fflate'
import { PNG } from 'pngjs'

const draftKey = 'chat-screenshot-generator:draft:v1'

test('automatically exports an oversized long conversation as an ordered PNG ZIP', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.evaluate(async storageKey => {
    const { SAMPLE_DRAFT } = await import('/src/app/sampleDraft.ts')
    const messages = Array.from({ length: 130 }, (_, index) => ({
      ...structuredClone(SAMPLE_DRAFT.messages[index % SAMPLE_DRAFT.messages.length]),
      id: `segment-message-${index + 1}`,
      kind: 'text' as const,
      text: `分段导出消息 ${index + 1}：这是一段用于验证长图自动拆分的固定测试内容。`,
      quote: null,
      media: null,
      sentAt: new Date(Date.parse('2026-09-01T08:00:00+08:00') + index * 60_000).toISOString(),
      timeVisibility: 'hide' as const,
    }))
    localStorage.setItem(storageKey, JSON.stringify({
      ...SAMPLE_DRAFT,
      title: '超长会话验证',
      outputMode: 'long',
      exportScale: 2,
      outputWidth: 430,
      messages,
      captureStartMessageId: messages[0].id,
      captureEndMessageId: messages.at(-1)!.id,
    }))
  }, draftKey)
  await page.reload()

  await page.getByRole('button', { name: '导出 PNG', exact: true }).click()
  const segmented = page.getByRole('button', { name: '自动分段导出 ZIP' })
  await expect(segmented).toBeEnabled({ timeout: 30_000 })
  const downloadPromise = page.waitForEvent('download')
  await segmented.click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('超长会话验证-分段.zip')
  const archivePath = testInfo.outputPath('segmented-export.zip')
  await download.saveAs(archivePath)

  const files = unzipSync(new Uint8Array(readFileSync(archivePath)))
  const names = Object.keys(files).sort()
  expect(names.length).toBeGreaterThan(1)
  expect(names[0]).toBe('超长会话验证-分段-01.png')
  expect(names.at(-1)).toBe(`超长会话验证-分段-${String(names.length).padStart(2, '0')}.png`)
  for (const name of names) {
    const png = PNG.sync.read(Buffer.from(files[name]))
    expect(png.width).toBe(860)
    expect(png.height).toBeLessThanOrEqual(16384)
  }
  await expect(page.getByText(`已导出 ${names.length} 张分段 PNG`)).toBeVisible()
})
