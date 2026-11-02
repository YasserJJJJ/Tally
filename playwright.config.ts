import { defineConfig } from '@playwright/test';

// Starts the API on a throwaway SQLite database and a production build of the web app, then drives them in Chromium.
// PYTHON points at an interpreter with backend/requirements.txt installed. PLAYWRIGHT_CHANNEL=chrome uses an installed Chrome.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:3100', channel: process.env.PLAYWRIGHT_CHANNEL, trace: 'retain-on-failure' },
  webServer: [
    {
      command: `${process.env.PYTHON ?? 'backend/.venv/bin/python'} e2e/serve_api.py`,
      url: 'http://127.0.0.1:8100/health',
      reuseExistingServer: false,
    },
    {
      command: 'npx next build && npx next start -p 3100',
      url: 'http://localhost:3100',
      env: { API_BASE_URL: 'http://127.0.0.1:8100' },
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
});
