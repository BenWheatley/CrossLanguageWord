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
  // The device-shaped specs are kept out of the three engine projects on purpose. A device
  // descriptor carries defaultBrowserType, which overrides whichever project is running it: left
  // in the matrix, tests/ci/mobile.spec.js ran under WebKit three times over and reported itself
  // as three engines. It gets one project of its own instead - WebKit, which is what an iPhone
  // actually runs - and the engine matrix covers the parts that are not device-specific.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: ['**/mobile.spec.js', '**/pwa.spec.js']
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testIgnore: ['**/mobile.spec.js', '**/pwa.spec.js']
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: ['**/mobile.spec.js', '**/pwa.spec.js']
    },
    {
      // The phone layout, on the engine a phone uses.
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
      testMatch: '**/mobile.spec.js'
    },
    {
      // Service workers, on a phone-sized Chromium. Playwright's WebKit cannot be taken offline
      // with a worker registered - page.reload fails with an internal error - so the offline
      // behaviour is exercised here instead. It is browser machinery rather than anything this
      // program decides, but it does mean iOS itself is checked by hand, not here.
      name: 'pwa',
      use: { ...devices['Pixel 5'] },
      testMatch: '**/pwa.spec.js'
    }
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
