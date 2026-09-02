import { defineConfig, devices } from '@playwright/test'

const e2ePort = process.env.E2E_PORT ?? '4173'
const e2eUrl = `http://127.0.0.1:${e2ePort}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  expect: {
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', threshold: 0.3, maxDiffPixelRatio: 0.05 },
  },
  use: {
    baseURL: e2eUrl,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${e2ePort} --strictPort`,
    url: e2eUrl,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
  ],
})
