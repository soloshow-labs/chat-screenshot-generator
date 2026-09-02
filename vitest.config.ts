import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // DOM suites and large media fixtures are memory-heavy. Bound concurrency
    // rather than multiplying jsdom instances by every available CPU core.
    maxWorkers: 4,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'vite.config.test.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**', 'benchmarks/**', 'feference_codes/**', '**/.worktrees/**'],
  },
})
