import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export function normalizeBasePath(value: string | undefined): string {
  const path = value?.trim().replace(/^\/+|\/+$/g, '') ?? ''
  return path ? `/${path}/` : '/'
}

export default defineConfig({
  base: normalizeBasePath(process.env.VITE_BASE_PATH),
  plugins: [react()],
  server: { port: 4173 },
})
