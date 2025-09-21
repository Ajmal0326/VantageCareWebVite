// playwright.config.cjs
require('dotenv').config();

/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    channel: 'msedge', // or 'chrome' if they have Chrome installed
    headless: true, // change to false if you want to see the browser by default
  },
  // auto-start your Vite dev server (comment out if you already run it yourself)
  webServer: {
    command: 'npm run dev -- --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
};
