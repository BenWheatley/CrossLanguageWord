/**
 * app.test.js — integration tests for the interactive app (crossword-trainer.html), driven
 * through a real local HTTP server + jsdom (see dom-helpers.js). These cover behavior that
 * only exists once the DOM is involved: rendering, focus, typing, clicking, printing, URL sync.
 *
 * Pure generation-logic correctness is covered separately and much faster in engine.test.js;
 * these tests intentionally use small word counts to stay fast.
 *
 * Run directly: node tests/app.test.js
 * Or via the full suite: node tests/run-tests.js
 */
const assert = require('assert');
const { test, run } = require('./mini-test')();
const { bootApp, clickCell, typeInto, gridIndex } = require('./dom-helpers');

// ---------- initial load / URL params ----------

test('loads Deutsch B1 with 15 words by default when no URL params are given', async () => {
  const app = await bootApp('');
  assert.strictEqual(app.document.getElementById('wordListSelect').value, 'german');
  assert.strictEqual(app.document.getElementById('wordCount').value, '15');
  assert.ok(app.document.querySelectorAll('#grid .cell').length > 0, 'grid should be populated');
  assert.deepStrictEqual(app.errors, []);
  app.close();
});

test('respects explicit list/words URL params', async () => {
  const app = await bootApp('?list=english&words=12');
  assert.strictEqual(app.document.getElementById('wordListSelect').value, 'english');
  assert.strictEqual(app.document.getElementById('wordCount').value, '12');
  const clueCount = app.document.querySelectorAll('#acrossList li, #downList li').length;
  assert.strictEqual(clueCount, 12);
  app.close();
});

test('falls back to defaults gracefully on garbage URL params', async () => {
  const app = await bootApp('?list=not-a-real-list&words=not-a-number');
  assert.strictEqual(app.document.getElementById('wordListSelect').value, 'german');
  assert.strictEqual(app.document.getElementById('wordCount').value, '15');
  assert.deepStrictEqual(app.errors, []);
  app.close();
});

test('writes the current list/word-count back into the URL after generating', async () => {
  const app = await bootApp('?bogus=1');
  assert.ok(app.window.location.href.includes('list=german'));
  assert.ok(app.window.location.href.includes('words=15'));
  assert.ok(app.window.location.href.includes('bogus=1'), 'unrelated existing params should be preserved');
  app.close();
});

test('URL params update again when the word count is changed', async () => {
  const app = await bootApp('');
  const wc = app.document.getElementById('wordCount');
  wc.value = '22';
  wc.dispatchEvent(new app.window.Event('change', { bubbles: true }));
  assert.ok(app.window.location.href.includes('words=22'));
  app.close();
});

// ---------- typing & navigation ----------

test('typing a letter fills the cell and advances focus to the next cell in the word', async () => {
  const app = await bootApp('?list=german&words=10');
  const { document, window } = app;
  const first = document.activeElement;
  typeInto(first, window, 'X');
  assert.strictEqual(first.value, 'X');
  assert.notStrictEqual(document.activeElement, first, 'focus should have advanced');
  app.close();
});

test('fast/rollover typing (next keydown before previous keyup) does not drop letters', async () => {
  const app = await bootApp('?list=german&words=10');
  const { document, window } = app;
  const { byPos, startOf } = gridIndex(document);
  const acrossKey = Array.from(document.querySelectorAll('#printAnswerAcross li')).map(li => li.textContent);
  const [numStr, ans] = acrossKey[0].split('. ');
  const start = startOf(numStr);
  // Click the clue itself (unambiguously selects this exact word+direction) rather than the
  // cell — clicking a crossing cell that's already focused toggles direction instead of
  // confirming it, which is a real (if easy to miss) footgun for a test, not app behavior.
  document.querySelector(`.clue-list li[data-wid="across-${numStr}"]`)
    .dispatchEvent(new window.Event('click', { bubbles: true }));

  let prevInput = null;
  for(let i = 0; i < ans.length; i++){
    const active = document.activeElement;
    active.dispatchEvent(new window.KeyboardEvent('keydown', { key: ans[i], bubbles: true }));
    active.value = ans[i];
    active.dispatchEvent(new window.Event('input', { bubbles: true }));
    if(prevInput) prevInput.dispatchEvent(new window.KeyboardEvent('keyup', { key: 'x', bubbles: true }));
    prevInput = active;
  }
  if(prevInput) prevInput.dispatchEvent(new window.KeyboardEvent('keyup', { key: 'x', bubbles: true }));

  let landed = '';
  for(let i = 0; i < ans.length; i++) landed += byPos[start.r + ',' + (start.c + i)].value;
  assert.strictEqual(landed, ans);
  app.close();
});

test('backspace on a filled cell clears it without moving focus', async () => {
  const app = await bootApp('?list=german&words=10');
  const { document, window } = app;
  const cell = document.activeElement;
  typeInto(cell, window, 'X');
  const afterType = document.activeElement;
  afterType.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
  assert.strictEqual(cell.value, '', 'original cell should be clear after backing up into it');
  app.close();
});

test('arrow keys move focus across the grid', async () => {
  const app = await bootApp('?list=german&words=10');
  const { document, window } = app;
  const start = document.activeElement;
  // Use whichever direction the currently-focused word actually runs in — every placed word is
  // at least 2 letters, so this direction is guaranteed to have a valid next cell. (The other
  // direction isn't guaranteed — e.g. an across-only cell may have a block directly below it.)
  const acrossLi = document.querySelector('.clue-list li.active');
  const isDown = acrossLi && acrossLi.closest('#downList') !== null;
  const key = isDown ? 'ArrowDown' : 'ArrowRight';
  start.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
  assert.notStrictEqual(document.activeElement, start);
  app.close();
});

// ---------- composition (dead-key accents) ----------

test('dead-key composition (¨+u→ü) resolves correctly and then advances', async () => {
  const app = await bootApp('?list=german&words=10');
  const { document, window } = app;
  const cell = document.activeElement;

  cell.dispatchEvent(new window.CompositionEvent('compositionstart', { data: '' }));
  cell.value = '¨';
  cell.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.strictEqual(document.activeElement, cell, 'focus must not move during composition');

  cell.value = 'ü';
  cell.dispatchEvent(new window.CompositionEvent('compositionend', { data: 'ü' }));
  assert.strictEqual(cell.value, 'Ü');
  assert.notStrictEqual(document.activeElement, cell, 'focus should advance once composition ends');
  app.close();
});

// ---------- click-to-select ----------

test('clicking a filled cell selects its full text (so typing replaces it)', async () => {
  const app = await bootApp('?list=german&words=10');
  const { document, window } = app;
  const inputs = Array.from(document.querySelectorAll('#grid .cell input'));
  const cellA = inputs[0], cellB = inputs[1];
  cellA.value = 'X';
  clickCell(cellB, window);
  clickCell(cellA, window);
  assert.strictEqual(document.activeElement, cellA);
  assert.strictEqual(cellA.selectionStart, 0);
  assert.strictEqual(cellA.selectionEnd, cellA.value.length);
  app.close();
});

// ---------- check answers ----------

test('Check answers marks correct/incorrect cells and leaves untouched cells alone', async () => {
  const app = await bootApp('?list=german&words=10');
  const { document, window } = app;
  const { byPos, startOf } = gridIndex(document);
  const acrossKey = Array.from(document.querySelectorAll('#printAnswerAcross li')).map(li => li.textContent);
  const [numStr, ans] = acrossKey[0].split('. ');
  const start = startOf(numStr);

  const wrongLetter = ans[0] === 'X' ? 'Y' : 'X';
  byPos[start.r + ',' + start.c].value = wrongLetter;
  byPos[start.r + ',' + start.c].dispatchEvent(new window.Event('input', { bubbles: true }));
  for(let i = 1; i < ans.length; i++){
    byPos[start.r + ',' + (start.c + i)].value = ans[i];
    byPos[start.r + ',' + (start.c + i)].dispatchEvent(new window.Event('input', { bubbles: true }));
  }

  document.getElementById('checkBtn').dispatchEvent(new window.Event('click', { bubbles: true }));

  const wrapAt = (r,c) => byPos[r + ',' + c].closest('.cell');
  assert.ok(wrapAt(start.r, start.c).classList.contains('check-incorrect'));
  assert.ok(!wrapAt(start.r, start.c).classList.contains('check-correct'));
  assert.ok(wrapAt(start.r, start.c + 1).classList.contains('check-correct'));

  const untouched = Array.from(document.querySelectorAll('#grid .cell:not(.block)'))
    .find(w => !w.querySelector('input').value);
  if(untouched){
    assert.ok(!untouched.classList.contains('check-correct') && !untouched.classList.contains('check-incorrect'));
  }

  byPos[start.r + ',' + start.c].value = ans[0];
  byPos[start.r + ',' + start.c].dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.ok(!wrapAt(start.r, start.c).classList.contains('check-incorrect'));
  app.close();
});

// ---------- solve / celebration ----------

test('solving the puzzle correctly triggers the celebration overlay', async () => {
  const app = await bootApp('?list=english&words=2');
  const { document, window } = app;
  const acrossKey = Array.from(document.querySelectorAll('#printAnswerAcross li')).map(li => li.textContent);
  const downKey = Array.from(document.querySelectorAll('#printAnswerDown li')).map(li => li.textContent);
  if(acrossKey.length !== 1 || downKey.length !== 1){
    app.close();
    return;
  }
  const [acrossNum, acrossAns] = acrossKey[0].split('. ');
  const [downNum, downAns] = downKey[0].split('. ');
  const { byPos, startOf } = gridIndex(document);
  const acrossStart = startOf(acrossNum);
  const downStart = startOf(downNum);

  function setCell(r, c, letter){
    const inp = byPos[r + ',' + c];
    inp.value = letter;
    inp.dispatchEvent(new window.Event('input', { bubbles: true }));
  }
  for(let i = 0; i < acrossAns.length; i++) setCell(acrossStart.r, acrossStart.c + i, acrossAns[i]);
  for(let i = 0; i < downAns.length; i++) setCell(downStart.r + i, downStart.c, downAns[i]);

  assert.ok(document.getElementById('celebrateOverlay').classList.contains('show'));
  app.close();
});

// ---------- hamburger menu & focus restoration ----------

test('the options menu opens and closes, and clicking outside closes it', async () => {
  const app = await bootApp('?list=german&words=10');
  const { document, window } = app;
  const menu = document.getElementById('optionsMenu');
  assert.strictEqual(menu.hidden, true);
  document.getElementById('hamburgerBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.strictEqual(menu.hidden, false);
  document.body.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.strictEqual(menu.hidden, true);
  app.close();
});

test('Check answers and Print return focus to a grid cell afterward', async () => {
  const app = await bootApp('?list=german&words=10');
  const { document, window } = app;
  document.getElementById('checkBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.strictEqual(document.activeElement.tagName, 'INPUT');

  window.print = () => {};
  document.getElementById('printBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.strictEqual(document.activeElement.tagName, 'INPUT');
  app.close();
});

// ---------- status messages ----------

test('status is empty on a fully successful generation (no noisy success message)', async () => {
  const app = await bootApp('?list=german&words=10');
  assert.strictEqual(app.document.getElementById('status').textContent, '');
  app.close();
});

test('subtitle no longer instructs users to "choose how many to include"', async () => {
  const app = await bootApp('?list=german&words=10');
  const tagline = app.document.getElementById('pageTagline').textContent.toLowerCase();
  assert.ok(!tagline.includes('choose'));
  app.close();
});

// ---------- print answer key ----------

test('the print answer key lists every placed word exactly once, split by direction', async () => {
  const app = await bootApp('?list=german&words=12');
  const { document } = app;
  const across = document.querySelectorAll('#printAnswerAcross li').length;
  const down = document.querySelectorAll('#printAnswerDown li').length;
  assert.strictEqual(across + down, 12);
  app.close();
});

if(require.main === module){
  run();
}

module.exports = { run };
