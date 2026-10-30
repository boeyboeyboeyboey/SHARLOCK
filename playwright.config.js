import { resolve } from 'node:path'
import { defineConfig } from '@playwright/test'

// the test server writes sign-up codes here; tests/e2e/fixtures/mail.js reads the same path
const mailOutbox = resolve('.local', 'e2e-mail.jsonl')

const mobileUse = {
  browserName: 'chromium',
  viewport: { width: 375, height: 667 },
  isMobile: true,
  hasTouch: true,
}
const desktopUse = { browserName: 'chromium', viewport: { width: 1440, height: 900 } }
const hubSpecs = /[\\/]hub(-auto)?\.spec\.js$/

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // hub specs run software WebGL, so they get their own projects with one worker each
  projects: [
    {
      name: 'mobile-chromium',
      testIgnore: hubSpecs,
      use: mobileUse,
    },
    {
      name: 'desktop-chromium',
      testIgnore: hubSpecs,
      use: desktopUse,
    },
    {
      name: 'hub-mobile-chromium',
      testMatch: hubSpecs,
      workers: 1,
      use: mobileUse,
    },
    {
      name: 'hub-desktop-chromium',
      testMatch: hubSpecs,
      workers: 1,
      use: desktopUse,
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @sharlock/server start',
      url: 'http://127.0.0.1:3001/api/health',
      reuseExistingServer: false,
      timeout: 30000,
      env: {
        NODE_ENV: 'test',
        PORT: '3001',
        CLIENT_ORIGIN: 'http://localhost:5174',
        TEST_MAIL_OUTBOX: mailOutbox,
        // dummy values mark the social simulator configured; specs stub every chat reply
        LLM_API_KEY: 'e2e-placeholder-not-a-real-key',
        LLM_MODEL: 'e2e-placeholder-model',
        LLM_COLLEAGUE_BASE_URL: '',
        LLM_COLLEAGUE_MODEL: '',
      },
    },
    {
      command: 'pnpm dev:client',
      url: 'http://localhost:5174',
      reuseExistingServer: false,
      timeout: 30000,
      env: {
        PORT: '3001',
        CLIENT_ORIGIN: 'http://localhost:5174',
        SHARLOCK_VITE_CACHE_DIR: resolve('.local', 'e2e-vite-cache'),
      },
    },
  ],
})
