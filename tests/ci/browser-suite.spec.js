// Opens tests/index.html, waits for the in-page suite to finish, and fails with the individual
// assertion messages rather than a bare "it didn't pass".
const { test, expect } = require('@playwright/test');

test('the in-browser suite passes', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  // ?perf=0 skips the generation-cost benchmark, which is a tuning aid rather than a check.
  await page.goto('/tests/?perf=0');

  const results = await page.waitForFunction(
    () => window.__TEST_RESULTS__ || null,
    null,
    { timeout: 4 * 60 * 1000, polling: 500 }
  ).then((handle) => handle.jsonValue());

  if(results.failures.length){
    const report = results.failures
      .map((f) => `  ✗ ${f.name}\n      ${f.detail}`)
      .join('\n');
    throw new Error(`${results.failed} of ${results.total} tests failed:\n${report}`);
  }

  expect(pageErrors, 'uncaught errors on the test page').toEqual([]);
  expect(results.failed).toBe(0);
  expect(results.total).toBeGreaterThan(0);
  console.log(`${results.passed} passed, 0 failed (${results.total} total)`);
});
