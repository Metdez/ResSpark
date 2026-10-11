import { defineConfig } from '@playwright/test'

// D-14 / SIGN-04: one phone-sized Chromium project (06-RESEARCH contradiction 8: a plain 390×844
// viewport, not the WebKit iPhone descriptor). Every /api/c/* call is mocked inside the spec.
export default defineConfig({
  testDir: 'e2e',
  reporter: 'list',
  use: { baseURL: 'http://localhost:5179' },
  projects: [
    {
      name: 'chromium-390x844',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
  ],
  webServer: {
    command: 'pnpm exec vite --port 5179 --strictPort',
    url: 'http://localhost:5179/c/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
