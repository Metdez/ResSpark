import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineProject } from 'vitest/config'

// File-referenced project so the Workers pool never inherits the root jsdom/react plugins (D-21).
export default defineProject({
  plugins: [cloudflareTest({ wrangler: { configPath: '../wrangler.jsonc' } })],
  test: { name: 'workerd', include: ['test/workerd/**/*.test.ts'] },
})
