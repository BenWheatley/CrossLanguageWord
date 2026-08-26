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

async function openApp(page, query){
  await page.goto('/index.html' + query, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('#grid .cell').length > 0);
}

/** Feeds a word list through the real file input, exactly as choosing a file would. */
async function loadCustomList(page, list){
  await page.evaluate((data) => {
    const file = new File([JSON.stringify(data)], 'mine.json', { type: 'application/json' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const input = document.getElementById('fileInput');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, list);
  await page.waitForFunction(() => document.getElementById('pageTitle').textContent === 'Mijn Woordenlijst');
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
