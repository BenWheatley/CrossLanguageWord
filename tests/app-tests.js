/**
 * app-tests.js - end-to-end tests that drive the real ../index.html inside a hidden iframe,
 * using the helpers in app-helpers.js.
 *
 * Registered onto the shared runner created in tests/index.html.
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

  test('dead-key composition (¨+u\u2192ü) resolves correctly and then advances', async () => {
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

  test('typed progress survives a reload (same puzzle restored, not a new random one)', async () => {
  const app = await bootApp('?list=german&words=10');
  const { document: appDoc, window: appWin } = app;

  const firstInput = appDoc.activeElement;
  const r = firstInput.dataset.r, c = firstInput.dataset.c;
  firstInput.dispatchEvent(new appWin.KeyboardEvent('keydown', { key: 'X', bubbles: true }));
  firstInput.value = 'X';
  firstInput.dispatchEvent(new appWin.Event('input', { bubbles: true }));

  const originalFirstClue = appDoc.querySelector('#acrossList li, #downList li').textContent;
  const originalCellCount = appDoc.querySelectorAll('#grid .cell').length;

  // Wait past the debounced save, then navigate the iframe back to the exact same URL - a
  // real reload - without clearing localStorage first (bootApp() normally clears it for
  // test isolation; here we want the opposite, to prove state actually survives). #appFrame
  // lives in this outer test page's own document, not the app's (appDoc) - using the plain
  // top-level `document` here on purpose.
  await new Promise((resolve) => setTimeout(resolve, 500));
  const iframe = document.getElementById('appFrame');
  await new Promise((resolve) => {
    function onLoad(){
      iframe.removeEventListener('load', onLoad);
      waitFor(() => iframe.contentWindow.document.querySelectorAll('#grid .cell').length > 0).then(resolve);
    }
    iframe.addEventListener('load', onLoad);
    iframe.src = 'about:blank';
    iframe.src = '../index.html?list=german&words=10';
  });

  const doc2 = iframe.contentWindow.document;
  assertEqual(doc2.querySelectorAll('#grid .cell').length, originalCellCount, 'restored grid should be the same size, not a fresh random one');
  assertEqual(doc2.querySelector('#acrossList li, #downList li').textContent, originalFirstClue, 'restored puzzle should have the exact same clues, not a new random puzzle');
  const restoredCell = doc2.querySelector(`#grid .cell input[data-r="${r}"][data-c="${c}"]`);
  assertEqual(restoredCell.value, 'X', 'the letter typed before reload should still be filled in');
});

test('solving the puzzle correctly triggers the celebration overlay', async () => {
    const app = await bootApp('?list=english&words=2');
    const { document, window } = app;
    const acrossKey = Array.from(document.querySelectorAll('#printAnswerAcross li')).map((li) => li.textContent);
    const downKey = Array.from(document.querySelectorAll('#printAnswerDown li')).map((li) => li.textContent);
    if(acrossKey.length !== 1 || downKey.length !== 1) return;

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

  // A puzzle you were part-way through and a puzzle someone linked you to both arrive as a URL
  // with parameters, because the app writes its own into the address bar after every generate.
  // These pin down which one wins, and that following a link doesn't destroy it.

  test('a link naming a different puzzle beats the saved session', async () => {
    await bootApp('?list=german&words=20');           // start a session, let it save
    const app = await bootApp('?list=english&words=8', { keepSavedState: true });
    assertEqual(app.document.getElementById('pageTitle').textContent, 'English');
    assertEqual(app.document.getElementById('wordCount').value, '8');
  });

  test('following a link does not rewrite it to a different puzzle', async () => {
    await bootApp('?list=german&words=20');
    const app = await bootApp('?list=english&words=8', { keepSavedState: true });
    const search = app.window.location.search;
    assertTrue(search.includes('list=english'), `address bar became ${search}`);
    assertTrue(search.includes('words=8'), `address bar became ${search}`);
  });

  test('reopening the same URL resumes the saved puzzle rather than generating a new one', async () => {
    const first = await bootApp('?list=german&words=12');
    const answersBefore = Array.from(first.document.querySelectorAll('#printAnswerAcross li, #printAnswerDown li'))
      .map((li) => li.textContent).sort().join('|');
    const again = await bootApp('?list=german&words=12', { keepSavedState: true });
    const answersAfter = Array.from(again.document.querySelectorAll('#printAnswerAcross li, #printAnswerDown li'))
      .map((li) => li.textContent).sort().join('|');
    assertEqual(answersAfter, answersBefore, 'the same puzzle should come back, not a fresh one');
  });

  test('regenerating can show a different clue for a word, not the one it was stuck with on load', async () => {
    // Deutsch A2 is the smallest bundled list, so words recur quickly across regenerations.
    const app = await bootApp('?list=german_a2&words=30');
    const doc = app.document;
    const seen = new Map();

    for(let i = 0; i < 25; i++){
      doc.getElementById('generateBtn').click();
      const pairs = [['#printAnswerAcross', '#acrossList'], ['#printAnswerDown', '#downList']];
      for(const [answerSel, clueSel] of pairs){
        const answers = Array.from(doc.querySelectorAll(answerSel + ' li'))
          .map((li) => li.textContent.replace(/^\d+\.\s*/, ''));
        const clues = Array.from(doc.querySelectorAll(clueSel + ' li'))
          .map((li) => li.textContent.replace(/^\d+/, ''));
        answers.forEach((answer, ix) => {
          if(!seen.has(answer)) seen.set(answer, new Set());
          seen.get(answer).add(clues[ix]);
        });
      }
      for(const clueSet of seen.values()){
        if(clueSet.size > 1) return; // a word has been shown with two different clues - done
      }
    }
    throw new Error('no word ever showed a second clue across 25 regenerations - clues look frozen');
  });

  test('no puzzle contains the same answer twice, even from a list with duplicate entries', async () => {
    // Deutsch A2 lists kaufen, brauchen and morgen twice each.
    const app = await bootApp('?list=german_a2&words=60');
    const doc = app.document;
    for(let i = 0; i < 20; i++){
      doc.getElementById('generateBtn').click();
      const answers = Array.from(doc.querySelectorAll('#printAnswerAcross li, #printAnswerDown li'))
        .map((li) => li.textContent.replace(/^\d+\.\s*/, ''));
      const seen = new Set();
      for(const answer of answers){
        assertTrue(!seen.has(answer), `${answer} appeared twice in one puzzle`);
        seen.add(answer);
      }
    }
  });

  test('duplicate list entries merge their clues rather than competing as two words', async () => {
    const app = await bootApp('?list=german_a2&words=60');
    const doc = app.document;
    const cluesForKaufen = new Set();
    for(let i = 0; i < 60 && cluesForKaufen.size < 4; i++){
      doc.getElementById('generateBtn').click();
      const pairs = [['#printAnswerAcross', '#acrossList'], ['#printAnswerDown', '#downList']];
      for(const [answerSel, clueSel] of pairs){
        const answers = Array.from(doc.querySelectorAll(answerSel + ' li'))
          .map((li) => li.textContent.replace(/^\d+\.\s*/, ''));
        const clues = Array.from(doc.querySelectorAll(clueSel + ' li'))
          .map((li) => li.textContent.replace(/^\d+/, '').trim());
        answers.forEach((answer, ix) => { if(answer === 'KAUFEN') cluesForKaufen.add(clues[ix]); });
      }
    }
    // Both source entries carry two clues; all four should be reachable from the single merged word.
    assertEqual(cluesForKaufen.size, 4, `only saw ${cluesForKaufen.size} distinct clues for KAUFEN`);
  });
}
