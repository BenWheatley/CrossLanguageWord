// Continuous-integration wrapper around tests/index.html.
//
// The suite itself lives in that page and runs with nothing but script tags and a static server -
// that is deliberate, and Playwright does not replace it. All this does is open the page in each
// browser and read the result out, so the same suite a person runs by visiting tests/ is the one
// CI runs, rather than a second implementation that can drift from it.
const { defineConfig, devices } = require('@playwright/test');

const PORT = 8765;

module.exports = defineConfig({
  testDir: './tests/ci',
  // The app tests boot the real index.html dozens of times and generate real puzzles; on a cold
  // CI runner that is not quick.
  timeout: 5 * 60 * 1000,
  expect: { timeout: 10 * 1000 },
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } }
  ],
  webServer: {
    // Python rather than a Node server: it is on every runner already, and adding a dependency
    // to serve static files for a project that has no build step would be silly.
    command: `python3 -m http.server ${PORT}`,
    url: `http://127.0.0.1:${PORT}/tests/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30 * 1000
  }
});
