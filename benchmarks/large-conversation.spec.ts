import { expect, test, type Page } from '@playwright/test'

const DRAFT_STORAGE_KEY = 'chat-screenshot-generator:draft:v1'

interface BrowserMemorySnapshot {
  jsHeapUsedBytes: number
  jsHeapTotalBytes: number
  documents: number
  nodes: number
  listeners: number
  liveNodes: number
  editorNodes: number
  compactRows: number
  mountedFullEditors: number
}

async function seedTextConversation(page: Page, count: number, exportMessageCount = 0) {
  // Keep the React workspace unmounted while seeding. Otherwise its autosave can
  // race the benchmark fixture while createProject changes the active project.
  await page.goto('/src/app/sampleDraft.ts')
  await page.evaluate(async ({ count, exportMessageCount, storageKey }) => {
    const { SAMPLE_DRAFT } = await import('/src/app/sampleDraft.ts')
    const sourceMessages = SAMPLE_DRAFT.messages
    const messages = Array.from({ length: count }, (_, index) => {
      const source = structuredClone(sourceMessages[index % sourceMessages.length])
      return {
        ...source,
        id: `benchmark-message-${index + 1}`,
        text: `性能基准消息 ${index + 1}：用于测量大量消息的编辑与预览渲染。`,
        sentAt: new Date(Date.parse('2026-09-01T08:00:00+08:00') + index * 60_000).toISOString(),
        timeVisibility: index % 20 === 0 ? 'show' : 'hide',
        quote: null,
      }
    })
    localStorage.setItem(storageKey, JSON.stringify({
      ...SAMPLE_DRAFT,
      title: `${count} 条消息性能基准`,
      messages,
      exportScale: 1,
      outputMode: exportMessageCount > 0 ? 'long' : 'screen',
      captureStartMessageId: exportMessageCount > 0 ? messages[0]?.id ?? null : null,
      captureEndMessageId: exportMessageCount > 0 ? messages[Math.min(exportMessageCount, messages.length) - 1]?.id ?? null : null,
    }))
  }, { count, exportMessageCount, storageKey: DRAFT_STORAGE_KEY })
}

async function loadSeededConversation(page: Page, count: number) {
  const startedAt = performance.now()
  await page.goto('/')
  await expect(page.getByRole('article')).toHaveCount(count, { timeout: 60_000 })
  await expect(page.getByTestId('chat-canvas')).toBeVisible()
  return performance.now() - startedAt
}

async function memorySnapshot(page: Page): Promise<BrowserMemorySnapshot> {
  const session = await page.context().newCDPSession(page)
  await session.send('HeapProfiler.collectGarbage')
  const [heap, dom] = await Promise.all([
    session.send('Runtime.getHeapUsage'),
    session.send('Memory.getDOMCounters'),
  ])
  await session.detach()
  const live = await page.evaluate(() => {
    const editor = document.querySelector('[aria-labelledby="message-editor-title"]')
    return {
      liveNodes: document.querySelectorAll('*').length,
      editorNodes: editor?.querySelectorAll('*').length ?? 0,
      compactRows: editor?.querySelectorAll('[aria-label^="展开消息 "]').length ?? 0,
      mountedFullEditors: editor?.querySelectorAll('textarea').length ?? 0,
    }
  })
  return {
    jsHeapUsedBytes: heap.usedSize,
    jsHeapTotalBytes: heap.totalSize,
    documents: dom.documents,
    nodes: dom.nodes,
    listeners: dom.jsEventListeners,
    ...live,
  }
}

test('500 条消息的编辑器与预览渲染基准', async ({ page }, testInfo) => {
  await seedTextConversation(page, 500)
  const renderMs = await loadSeededConversation(page, 500)
  const memory = await memorySnapshot(page)
  const result = { messageCount: 500, renderMs: Math.round(renderMs), memory }

  console.log(`BENCHMARK_RESULT ${JSON.stringify(result)}`)
  await testInfo.attach('500-message-benchmark.json', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  })
  expect(renderMs).toBeLessThan(15_000)
  expect(memory.jsHeapUsedBytes).toBeLessThan(256 * 1024 * 1024)
  expect(memory.compactRows).toBe(500)
  expect(memory.mountedFullEditors).toBe(0)
  expect(memory.editorNodes).toBeLessThan(15_000)
})

test('1000 条消息渲染及 40 条长图导出内存基准', async ({ page }, testInfo) => {
  await seedTextConversation(page, 1_000, 40)
  const renderMs = await loadSeededConversation(page, 1_000)
  const beforeExport = await memorySnapshot(page)

  const exportStartedAt = performance.now()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 PNG', exact: true }).click()
  const continueButton = page.getByRole('button', { name: '继续导出', exact: true })
  if (await continueButton.isVisible()) await continueButton.click()
  const download = await downloadPromise
  const exportPath = testInfo.outputPath('benchmark-export.png')
  await download.saveAs(exportPath)
  const exportMs = performance.now() - exportStartedAt
  const afterExport = await memorySnapshot(page)
  const result = {
    messageCount: 1_000,
    exportedMessageCount: 40,
    renderMs: Math.round(renderMs),
    exportMs: Math.round(exportMs),
    beforeExport,
    afterExport,
    retainedHeapDeltaBytes: afterExport.jsHeapUsedBytes - beforeExport.jsHeapUsedBytes,
  }

  console.log(`BENCHMARK_RESULT ${JSON.stringify(result)}`)
  await testInfo.attach('1000-message-export-benchmark.json', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  })
  await testInfo.attach('benchmark-export.png', { path: exportPath, contentType: 'image/png' })
  expect(renderMs).toBeLessThan(30_000)
  expect(exportMs).toBeLessThan(30_000)
  expect(afterExport.jsHeapUsedBytes).toBeLessThan(512 * 1024 * 1024)
  expect(result.retainedHeapDeltaBytes).toBeLessThan(128 * 1024 * 1024)
})

test('1000 条消息在多项目和 10 个恢复点下的定位、编辑与自动保存基准', async ({ page }, testInfo) => {
  await seedTextConversation(page, 1_000)
  await page.evaluate(async storageKey => {
    const draft = JSON.parse(localStorage.getItem(storageKey)!)
    const { createCheckpoint, createProject, switchProject } = await import('/src/services/localProjectStore.ts')
    const large = await createProject(draft)
    let currentDraft = draft
    for (let index = 0; index < 4; index += 1) {
      const small = { ...draft, title: `辅助项目 ${index + 1}`, messages: draft.messages.slice(0, 20) }
      await createProject(small)
      currentDraft = small
    }
    await switchProject(large.id, currentDraft)
    for (let index = 0; index < 10; index += 1) {
      await createCheckpoint(large.id, { ...draft, title: `恢复点 ${index + 1}` }, 'destructive', Date.now() + index)
    }
  }, DRAFT_STORAGE_KEY)
  const renderMs = await loadSeededConversation(page, 1_000)

  await page.getByRole('searchbox', { name: '搜索消息' }).fill('性能基准消息 900：')
  await expect(page.getByLabel('消息匹配结果')).toContainText('1 / 1')
  const nextMatch = page.getByRole('button', { name: '下一个匹配消息' })
  await nextMatch.click()
  const editor = page.getByLabel('消息 900 内容')
  await expect(editor).toBeVisible()
  const saveStartedAt = performance.now()
  await editor.fill('性能基准消息 900：已完成定位、编辑与增量自动保存。')
  const saveStatus = page.locator('[data-save-state]')
  await expect(saveStatus).toHaveAttribute('data-save-state', 'saving', { timeout: 5_000 })
  await expect(saveStatus).toHaveAttribute('data-save-state', 'saved', { timeout: 10_000 })
  const editAndSaveMs = performance.now() - saveStartedAt
  const memory = await memorySnapshot(page)
  const result = { messageCount: 1_000, projectCount: 5, checkpointCount: 10, renderMs: Math.round(renderMs), editAndSaveMs: Math.round(editAndSaveMs), memory }
  console.log(`BENCHMARK_RESULT ${JSON.stringify(result)}`)
  await testInfo.attach('1000-message-project-autosave-benchmark.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' })
  expect(editAndSaveMs).toBeLessThan(10_000)
  expect(memory.jsHeapUsedBytes).toBeLessThan(512 * 1024 * 1024)
})
