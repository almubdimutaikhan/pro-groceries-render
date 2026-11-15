import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: 2,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:5185',
    reducedMotion: 'reduce',
    launchOptions: process.env.PW_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PW_CHROMIUM_EXECUTABLE } : {},
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5185 --strictPort',
    url: 'http://127.0.0.1:5185',
    reuseExistingServer: false,
    // Empty values beat anything in .env.local: the tests never use real keys or the dev-server Kroger proxy.
    env: { VITE_MANGISOZ_KEY: '', VITE_OPENROUTER_KEY: '', VITE_STRIPE_PAYMENT_LINK: '', VITE_STRIPE_PAYMENT_LINK_MONTHLY: '', VITE_KROGER_PROXY_BASE: '', KROGER_CLIENT_ID: '', KROGER_CLIENT_SECRET: '' },
  },
});
