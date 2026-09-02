import { defineConfig, devices } from '@playwright/test'

const benchmarkPort = process.env.BENCHMARK_PORT ?? '4173'
const benchmarkUrl = `http://127.0.0.1:${benchmarkPort}`

export default defineConfig({
  testDir: './benchmarks',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  reporter: 'list',
  use: {
    baseURL: benchmarkUrl,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${benchmarkPort} --strictPort`,
    url: benchmarkUrl,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chrome-benchmark', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
  ],
})
