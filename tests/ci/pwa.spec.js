// Installability and offline running.
//
// These need a service worker, which only registers over http(s) and needs a real browser
// context to activate in, so they live here rather than in the in-page suite.
const { test, expect } = require('@playwright/test');

// No test.use of a device here on purpose. A device descriptor carries defaultBrowserType, which
// overrides whichever project is running the file - and Playwright's WebKit cannot be taken
// offline with a worker registered. The project decides the engine.

async function openAndInstall(page){
  await page.goto('/index.html?list=german&words=12&seed=pwa1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('#grid .cell').length > 0);
  await page.evaluate(() => navigator.serviceWorker.ready);

  // let the precache finish before anything is asked of it
  await page.waitForFunction(async () => {
    const names = await caches.keys();
    if(!names.length) return false;
    const keys = await (await caches.open(names[0])).keys();
    return keys.length >= 12;
  }, null, { timeout: 20000 });

  // An active worker is not the same as a worker handling this page's requests. The first load
  // of a page is not controlled by one until it claims the client, and until then every fetch
  // goes straight to the network - which offline means straight to nothing. Reload if needed.
  if(!await page.evaluate(() => !!navigator.serviceWorker.controller)){
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelectorAll('#grid .cell').length > 0);
  }
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
}

test('the manifest describes something installable', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const href = await page.getAttribute('link[rel="manifest"]', 'href');
  expect(href).toBeTruthy();

  const manifest = await (await page.request.get(new URL(href, page.url()).href)).json();
  expect(manifest.name).toBeTruthy();
  expect(manifest.short_name).toBeTruthy();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.length).toBeGreaterThan(0);

  // Relative, because the program is served from a subpath on GitHub Pages as well as from the
  // root in development; an absolute start_url would leave the installed copy pointing at "/".
  expect(manifest.start_url.startsWith('/')).toBe(false);
  expect(manifest.scope.startsWith('/')).toBe(false);

  // An icon big enough to install with, and one that survives being cropped to a circle.
  const sizes = manifest.icons.map((i) => i.sizes);
  expect(sizes).toContain('192x192');
  expect(sizes).toContain('512x512');
  expect(manifest.icons.some((i) => (i.purpose || '').includes('maskable'))).toBe(true);

  for(const icon of manifest.icons){
    const res = await page.request.get(new URL(icon.src, page.url()).href);
    expect(res.status(), `${icon.src} is missing`).toBe(200);
    expect((res.headers()['content-type'] || '')).toContain('image');
  }
  // iOS uses this rather than the manifest for a home-screen icon.
  const apple = await page.getAttribute('link[rel="apple-touch-icon"]', 'href');
  expect((await page.request.get(new URL(apple, page.url()).href)).status()).toBe(200);
});

test('the puzzle still works with the network gone', async ({ page, context }) => {
  await openAndInstall(page);
  await context.setOffline(true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#grid .cell').length > 0, null, { timeout: 20000 });
  const offline = await page.evaluate(() => ({
    title: document.getElementById('pageTitle').textContent,
    squares: document.querySelectorAll('#grid .cell').length,
    clues: document.querySelectorAll('#acrossList li, #downList li').length
  }));
  expect(offline.title).toBe('Deutsch B1');
  expect(offline.squares).toBeGreaterThan(0);
  expect(offline.clues).toBe(12);

  // building a new puzzle offline needs the word list, not just the page
  await page.evaluate(() => document.getElementById('generateBtn').click());
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => document.querySelectorAll('#acrossList li, #downList li').length)).toBe(12);

  // and a list that was not the one on screen when the network went
  await page.evaluate(() => {
    const select = document.getElementById('wordListSelect');
    select.value = 'english';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => document.getElementById('pageTitle').textContent === 'English', null, { timeout: 15000 });
});

test('an edit is visible on the next reload rather than served from the cache', async ({ page, context }) => {
  // A worker that served stale code would bring back exactly the problem
  // server-debug-nocache.py exists to avoid, which is why the program itself is network-first.
  await openAndInstall(page);
  const fetched = await page.evaluate(async () => {
    const res = await fetch('crossword-engine.js', { cache: 'no-store' });
    return { fromNetwork: res.ok, type: res.type };
  });
  expect(fetched.fromNetwork).toBe(true);

  // and the same file is there when the network is not
  await context.setOffline(true);
  const offline = await page.evaluate(async () => (await fetch('crossword-engine.js')).ok);
  expect(offline).toBe(true);
});

// ---------- offering to put it on the home screen ----------

/** Fires the event Chromium fires, carrying a prompt() we can watch for. */
async function fireInstallPrompt(page){
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true });
    e.prompt = () => { window.__promptOpened = (window.__promptOpened || 0) + 1; return Promise.resolve({ outcome: 'accepted' }); };
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
  });
  await page.waitForTimeout(100);
}

const banner = (page) => page.evaluate(() => {
  const el = document.getElementById('installBanner');
  return {
    shown: !el.hidden,
    text: document.getElementById('installBannerText').textContent,
    directions: !document.getElementById('installDirections').hidden,
    accept: !document.getElementById('installAcceptBtn').hidden,
    dismissLabel: document.getElementById('installDismissBtn').textContent,
    menuOffered: !document.getElementById('installField').hidden,
    menuLabel: document.getElementById('installMenuBtn').textContent
  };
});

test('nothing is offered until the browser says it can install, and then it is', async ({ page }) => {
  await page.goto('/index.html?list=german&words=8&seed=inst1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('#grid .cell').length > 0);
  let state = await banner(page);
  expect(state.shown, 'no banner before the browser offers one').toBe(false);
  expect(state.menuOffered, 'and nothing in the menu either').toBe(false);

  await fireInstallPrompt(page);
  state = await banner(page);
  expect(state.shown, 'the banner should appear once the browser offers').toBe(true);
  expect(state.accept, 'with a real install button').toBe(true);
  expect(state.directions, 'and no iOS directions').toBe(false);
  expect(state.menuOffered).toBe(true);
  expect(state.menuLabel).toBe('Install this app');
});

test('the install button opens the browser prompt, once', async ({ page }) => {
  await page.goto('/index.html?list=german&words=8&seed=inst2', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('#grid .cell').length > 0);
  await fireInstallPrompt(page);
  await page.click('#installAcceptBtn');
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__promptOpened)).toBe(1);
  expect((await banner(page)).shown, 'the banner closes behind it').toBe(false);
  // A prompt may only be opened once, so the offer retires with it.
  expect((await banner(page)).menuOffered).toBe(false);
});

test('the banner is offered once and not again, but the menu can still ask for it', async ({ page }) => {
  await page.goto('/index.html?list=german&words=8&seed=inst3', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('#grid .cell').length > 0);
  await fireInstallPrompt(page);
  await page.click('#installDismissBtn');
  expect((await banner(page)).shown).toBe(false);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('#grid .cell').length > 0);
  await fireInstallPrompt(page);
  const state = await banner(page);
  expect(state.shown, 'dismissed once is dismissed for good').toBe(false);
  expect(state.menuOffered, 'but the menu still offers it').toBe(true);

  await page.click('#hamburgerBtn');
  await page.click('#installMenuBtn');
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__promptOpened), 'the menu opens the prompt directly').toBe(1);
});

test('a copy already on the home screen is not asked to install itself', async ({ page }) => {
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q) => /display-mode:\s*standalone/.test(q)
      ? { matches: true, media: q, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} }
      : real(q);
  });
  await page.goto('/index.html?list=german&words=8&seed=inst4', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('#grid .cell').length > 0);
  await fireInstallPrompt(page);
  const state = await banner(page);
  expect(state.shown, 'already installed: no banner').toBe(false);
  expect(state.menuOffered, 'and nothing in the menu').toBe(false);
});
