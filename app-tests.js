/**
 * app-tests.js - integration tests for the interactive app, driven through a real iframe
 * (see app-helpers.js). Registered onto the shared runner created in tests/index.html.
 *
 * Requires the test page to be served over http(s) so the app's own fetch('german.json' etc.)
 * calls succeed - same requirement as the app itself.
 */
function registerAppTests(test){

  test('loads Deutsch B1 with 15 words by default when no URL params are given', async () => {
    const app = await bootApp('');
    assertEqual(app.document.getElementById('wordListSelect').value, 'german');
    assertEqual(app.document.getElementById('wordCount').value, '15');
    assertTrue(app.document.querySelectorAll('#grid .cell').length > 0, 'grid should be populated');
    assertEqual(app.errors.length, 0, 'errors: ' + JSON.stringify(app.errors));
  });

  test('respects explicit list/words URL params', async () => {
    const app = await bootApp('?list=english&words=12');
    assertEqual(app.document.getElementById('wordListSelect').value, 'english');
    assertEqual(app.document.getElementById('wordCount').value, '12');
    const clueCount = app.document.querySelectorAll('#acrossList li, #downList li').length;
    assertEqual(clueCount, 12);
  });

  test('falls back to defaults gracefully on garbage URL params', async () => {
    const app = await bootApp('?list=not-a-real-list&words=not-a-number');
    assertEqual(app.document.getElementById('wordListSelect').value, 'german');
    assertEqual(app.document.getElementById('wordCount').value, '15');
    assertEqual(app.errors.length, 0);
  });

  test('writes the current list/word-count back into the URL after generating', async () => {
    const app = await bootApp('?bogus=1');
    assertTrue(app.window.location.href.includes('list=german'));
    assertTrue(app.window.location.href.includes('words=15'));
    assertTrue(app.window.location.href.includes('bogus=1'), 'unrelated existing params should be preserved');
  });

  test('typing a letter fills the cell and advances focus to the next cell in the word', async () => {
    const app = await bootApp('?list=german&words=10');
    const { document, window } = app;
    const first = document.activeElement;
    typeInto(first, window, 'X');
    assertEqual(first.value, 'X');
    assertNotEqual(document.activeElement, first, 'focus should have advanced');
  });

  test('fast/rollover typing (next keydown before previous keyup) does not drop letters', async () => {
    const app = await bootApp('?list=german&words=10');
    const { document, window } = app;
    const { byPos, startOf } = gridIndex(document);
    const acrossKey = Array.from(document.querySelectorAll('#printAnswerAcross li')).map((li) => li.textContent);
    const [numStr, ans] = acrossKey[0].split('. ');
    const start = startOf(numStr);
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
    assertEqual(landed, ans);
  });

  test('backspace on a filled cell clears it', async () => {
    const app = await bootApp('?list=german&words=10');
    const { document, window } = app;
    const cell = document.activeElement;
    typeInto(cell, window, 'X');
    document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    assertEqual(cell.value, '', 'original cell should be clear after backing up into it');
  });

  test('arrow keys move focus across the grid', async () => {
    const app = await bootApp('?list=german&words=10');
    const { document, window } = app;
    const start = document.activeElement;
    const activeLi = document.querySelector('.clue-list li.active');
    const isDown = activeLi && activeLi.closest('#downList') !== null;
    const key = isDown ? 'ArrowDown' : 'ArrowRight';
    start.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
    assertNotEqual(document.activeElement, start);
  });

  test('dead-key composition (¨+u→ü) resolves correctly and then advances', async () => {
    const app = await bootApp('?list=german&words=10');
    const { document, window } = app;
    const cell = document.activeElement;

    cell.dispatchEvent(new window.CompositionEvent('compositionstart', { data: '' }));
    cell.value = '¨';
    cell.dispatchEvent(new window.Event('input', { bubbles: true }));
    assertEqual(document.activeElement, cell, 'focus must not move during composition');

    cell.value = 'ü';
    cell.dispatchEvent(new window.CompositionEvent('compositionend', { data: 'ü' }));
    assertEqual(cell.value, 'Ü');
    assertNotEqual(document.activeElement, cell, 'focus should advance once composition ends');
  });

  test('clicking a filled cell selects its full text (so typing replaces it)', async () => {
    const app = await bootApp('?list=german&words=10');
    const { document, window } = app;
    const inputs = Array.from(document.querySelectorAll('#grid .cell input'));
    const cellA = inputs[0], cellB = inputs[1];
    cellA.value = 'X';
    clickCell(cellB, window);
    clickCell(cellA, window);
    assertEqual(document.activeElement, cellA);
    assertEqual(cellA.selectionStart, 0);
    assertEqual(cellA.selectionEnd, cellA.value.length);
  });

  test('Check answers marks correct/incorrect cells and leaves untouched cells alone', async () => {
    const app = await bootApp('?list=german&words=10');
    const { document, window } = app;
    const { byPos, startOf } = gridIndex(document);
    const acrossKey = Array.from(document.querySelectorAll('#printAnswerAcross li')).map((li) => li.textContent);
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
    assertTrue(wrapAt(start.r, start.c).classList.contains('check-incorrect'));
    assertTrue(!wrapAt(start.r, start.c).classList.contains('check-correct'));
    assertTrue(wrapAt(start.r, start.c + 1).classList.contains('check-correct'));

    byPos[start.r + ',' + start.c].value = ans[0];
    byPos[start.r + ',' + start.c].dispatchEvent(new window.Event('input', { bubbles: true }));
    assertTrue(!wrapAt(start.r, start.c).classList.contains('check-incorrect'));
  });

  test('solving the puzzle correctly triggers the celebration overlay', async () => {
    const app = await bootApp('?list=english&words=2');
    const { document, window } = app;
    const acrossKey = Array.from(document.querySelectorAll('#printAnswerAcross li')).map((li) => li.textContent);
    const downKey = Array.from(document.querySelectorAll('#printAnswerDown li')).map((li) => li.textContent);
    if(acrossKey.length !== 1 || downKey.length !== 1) return; // rare 2-word shape, skip

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

    assertTrue(document.getElementById('celebrateOverlay').classList.contains('show'));
  });

  test('the options menu opens and closes, and clicking outside closes it', async () => {
    const app = await bootApp('?list=german&words=10');
    const { document, window } = app;
    const menu = document.getElementById('optionsMenu');
    assertEqual(menu.hidden, true);
    document.getElementById('hamburgerBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
    assertEqual(menu.hidden, false);
    document.body.dispatchEvent(new window.Event('click', { bubbles: true }));
    assertEqual(menu.hidden, true);
  });

  test('Check answers and Print return focus to a grid cell afterward', async () => {
    const app = await bootApp('?list=german&words=10');
    const { document, window } = app;
    document.getElementById('checkBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
    assertEqual(document.activeElement.tagName, 'INPUT');

    window.print = () => {};
    document.getElementById('printBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
    assertEqual(document.activeElement.tagName, 'INPUT');
  });

  test('status is empty on a fully successful generation (no noisy success message)', async () => {
    const app = await bootApp('?list=german&words=10');
    assertEqual(app.document.getElementById('status').textContent, '');
  });

  test('subtitle no longer instructs users to "choose how many to include"', async () => {
    const app = await bootApp('?list=german&words=10');
    const tagline = app.document.getElementById('pageTagline').textContent.toLowerCase();
    assertTrue(!tagline.includes('choose'));
  });

  test('the print answer key lists every placed word exactly once, split by direction', async () => {
    const app = await bootApp('?list=german&words=12');
    const { document } = app;
    const across = document.querySelectorAll('#printAnswerAcross li').length;
    const down = document.querySelectorAll('#printAnswerDown li').length;
    assertEqual(across + down, 12);
  });
}
