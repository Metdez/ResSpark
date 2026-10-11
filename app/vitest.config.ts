import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Two inline projects: `web` runs SPA tests in jsdom, `worker-node` runs Worker handlers
// under node via app.request(). The `workerd` project (@cloudflare/vitest-plugin) is
// file-referenced so its pool never sees the jsdom environment; `pnpm test` skips it.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}', 'shared/**/*.test.ts'],
          setupFiles: ['./src/test-setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'worker-node',
          environment: 'node',
          include: ['worker/**/*.test.ts'],
          exclude: ['**/node_modules/**', 'worker/test/workerd/**'],
        },
      },
      './worker/vitest.config.ts',
    ],
  },
})
