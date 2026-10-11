import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Two inline projects: `web` runs SPA tests in jsdom, `worker-node` runs pure Worker
// logic under node. Plan 03 adds the `workerd` project (@cloudflare/vitest-plugin) as a
// file-referenced project so its pool never sees the jsdom environment.
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
          include: ['src/**/*.test.{ts,tsx}'],
          setupFiles: ['./src/test-setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'worker-node',
          environment: 'node',
          include: ['worker/**/*.test.ts'],
        },
      },
    ],
  },
})
