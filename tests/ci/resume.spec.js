// Resuming a puzzle built from a file the reader loaded.
//
// These three live here rather than in tests/index.html for one reason: they need a real
// top-level page reload. The in-browser suite drives the app inside an iframe, and clearing or
// reading localStorage across a frame navigation is not reliably ordered in WebKit - the same
// scenario passes about two runs in three there, while passing every time at top level in all
// three engines. Rather than assert around that, run them where the app is the page: Playwright
// gives each test a fresh context, so storage starts empty with no clearing step to race.
//
// Everything that can be tested inside a frame still belongs in tests/index.html. This file is
// for the handful of cases that genuinely cannot be.
const { test, expect } = require('@playwright/test');

const CUSTOM_LIST = {
  metadata: { title: 'Mijn Woordenlijst', language: 'nl', version: 1 },
  words: [
    { word: 'venster',  clues: ['Je kijkt er doorheen', 'Glas in een muur'] },
    { word: 'deur',     clues: ['Je loopt er doorheen', 'Heeft een klink'] },
    { word: 'straat',   clues: ['Huizen staan eraan', 'Je loopt erover'] },
    { word: 'tafel',    clues: ['Je eet eraan', 'Heeft vier poten'] },
    { word: 'stoel',    clues: ['Je zit erop', 'Staat bij de tafel'] },
    { word: 'raamwerk', clues: ['Structuur', 'Skelet van iets'] }
  ]
};

/**
 * A page in a context of its own, so it starts with empty storage. Registered for cleanup:
 * contexts left open hold pages, sockets and a share of the machine for the rest of the run,
 * which is how a suite that passes alone starts timing out when everything runs together.
 */
async function freshPage(browser, opened){
  const context = await browser.newContext();
  opened.push(context);
  return context.newPage();
}

async function closeAll(opened){
  await Promise.all(opened.map((c) => c.close()));
  opened.length = 0;
}

async function openApp(page, query){
  await page.goto('/index.html' + query, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('#grid .cell').length > 0);
}

/** Opens a link that may legitimately produce a prompt instead of a grid. */
async function openApp2(page, query){
  await page.goto('/index.html' + query, { waitUntil: 'networkidle' });
  await page.waitForFunction(() =>
    document.querySelectorAll('#grid .cell').length > 0 || !document.getElementById('listPrompt').hidden);
}

/** Feeds a word list through the real file input, exactly as choosing a file would. */
async function loadCustomList(page, list, opts = {}){
  await page.evaluate((data) => {
    const file = new File([JSON.stringify(data)], 'mine.json', { type: 'application/json' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const input = document.getElementById('fileInput');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, list);
  const expected = opts.expectTitle === undefined ? 'Mijn Woordenlijst' : opts.expectTitle;
  if(expected === false){
    await page.waitForTimeout(400);   // the file is meant to be rejected; nothing will change
  } else {
    await page.waitForFunction((t) => document.getElementById('pageTitle').textContent === t, expected);
  }
}

const answersOf = (page) => page.evaluate(() =>
  Array.from(document.querySelectorAll('#printAnswerAcross li, #printAnswerDown li'))
    .map((li) => li.textContent).join('|'));

test('a puzzle from a loaded file comes back with its own words, not a bundled list', async ({ page }) => {
  await openApp(page, '?list=german&words=10');
  await loadCustomList(page, CUSTOM_LIST);
  const before = await answersOf(page);

  // type something, so there is progress that must survive too
  await page.evaluate(() => {
    const input = document.querySelector('#grid .cell input');
    input.value = 'Z';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('#grid .cell').length > 0);

  await expect(page.locator('#pageTitle')).toHaveText('Mijn Woordenlijst');
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('nl');
  expect(await answersOf(page), 'the same puzzle should come back').toBe(before);
  expect(await page.evaluate(() => document.querySelector('#grid .cell input').value)).toBe('Z');
});

test('New crossword after resuming a loaded file keeps using that file, not German', async ({ page }) => {
  await openApp(page, '?list=german&words=10');
  await loadCustomList(page, CUSTOM_LIST);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('#grid .cell').length > 0);

  expect(await page.evaluate(() => document.getElementById('generateBtn').disabled)).toBe(false);
  await page.evaluate(() => document.getElementById('generateBtn').click());

  const answers = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#printAnswerAcross li, #printAnswerDown li'))
      .map((li) => li.textContent.replace(/^\d+\.\s*/, '')));
  const expected = CUSTOM_LIST.words.map((w) => w.word.toUpperCase());
  for(const answer of answers){
    expect(expected, `${answer} did not come from the loaded list`).toContain(answer);
  }
});

test('a link naming a bundled list still beats a resumed loaded file', async ({ page }) => {
  await openApp(page, '?list=german&words=10');
  await loadCustomList(page, CUSTOM_LIST);
  await openApp(page, '?list=english&words=8');
  await expect(page.locator('#pageTitle')).toHaveText('English');
});

// ---------- finding the list again by fingerprint ----------

const answersOfAll = (page) => page.evaluate(() =>
  Array.from(document.querySelectorAll('#printAnswerAcross li, #printAnswerDown li'))
    .map((li) => li.textContent).join('|'));
const cluesOf = (page) => page.evaluate(() =>
  Array.from(document.querySelectorAll('#acrossList li, #downList li'))
    .map((li) => li.textContent).join('|'));
const promptShown = (page) => page.evaluate(() => !document.getElementById('listPrompt').hidden);
const statusOf = (page) => page.evaluate(() => document.getElementById('status').textContent);

test('the link carries a fingerprint for a loaded list', async ({ page }) => {
  await openApp(page, '?list=german&words=8');
  await loadCustomList(page, CUSTOM_LIST);
  const search = await page.evaluate(() => location.search);
  expect(search).toContain('list=custom');
  expect(search).toMatch(/sum=[a-z0-9]+/);
  expect(search).toMatch(/seed=[a-z0-9]+/);
});

test('a link whose list this browser does not hold asks for the file', async ({ browser }) => {
  const opened = [];
  const first = await freshPage(browser, opened);
  await openApp(first, '?list=german&words=8');
  await loadCustomList(first, CUSTOM_LIST);
  const link = await first.evaluate(() => location.search);

  // A different browser: same link, none of the stored lists.
  const fresh = await freshPage(browser, opened);
  await openApp2(fresh, link);
  expect(await promptShown(fresh), 'should ask for the file').toBe(true);

  // Handing it the right file rebuilds the identical puzzle.
  await loadCustomList(fresh, CUSTOM_LIST);
  expect(await promptShown(fresh)).toBe(false);
  expect(await answersOfAll(fresh)).toBe(await answersOfAll(first));
  expect(await cluesOf(fresh)).toBe(await cluesOf(first));
  await closeAll(opened);
});

test('a different word list is refused rather than quietly accepted', async ({ browser }) => {
  const opened = [];
  const first = await freshPage(browser, opened);
  await openApp(first, '?list=german&words=8');
  await loadCustomList(first, CUSTOM_LIST);
  const link = await first.evaluate(() => location.search);

  const fresh = await freshPage(browser, opened);
  await openApp2(fresh, link);
  const wrong = JSON.parse(JSON.stringify(CUSTOM_LIST));
  wrong.words[0].word = 'raam';               // a genuinely different list of words
  await loadCustomList(fresh, wrong, { expectTitle: false });
  expect(await promptShown(fresh), 'should still be asking').toBe(true);
  expect(await statusOf(fresh)).toContain('different word list');
  await closeAll(opened);
});

test('two loaded lists can both be resumed', async ({ page }) => {
  const listTwo = JSON.parse(JSON.stringify(CUSTOM_LIST));
  listTwo.metadata.title = 'Tweede Lijst';
  listTwo.words[0].word = 'raam';

  await openApp(page, '?list=german&words=8');
  await loadCustomList(page, CUSTOM_LIST);
  const linkOne = await page.evaluate(() => location.search);
  await loadCustomList(page, listTwo, { expectTitle: 'Tweede Lijst' });
  const linkTwo = await page.evaluate(() => location.search);
  expect(linkOne).not.toBe(linkTwo);

  await openApp2(page, linkOne);
  expect(await promptShown(page)).toBe(false);
  await expect(page.locator('#pageTitle')).toHaveText('Mijn Woordenlijst');

  await openApp2(page, linkTwo);
  expect(await promptShown(page)).toBe(false);
  await expect(page.locator('#pageTitle')).toHaveText('Tweede Lijst');
});

test('the prompt offers a way out for someone who cannot find the file', async ({ browser }) => {
  const opened = [];
  const first = await freshPage(browser, opened);
  await openApp(first, '?list=german&words=8');
  await loadCustomList(first, CUSTOM_LIST);
  const link = await first.evaluate(() => location.search);

  const fresh = await freshPage(browser, opened);
  await openApp2(fresh, link);
  expect(await promptShown(fresh)).toBe(true);
  await fresh.evaluate(() => document.getElementById('listPromptFresh').click());
  await fresh.waitForFunction(() => document.querySelectorAll('#grid .cell').length > 0);
  expect(await promptShown(fresh)).toBe(false);
  await expect(fresh.locator('#pageTitle')).toHaveText('Deutsch B1');
  await closeAll(opened);
});

