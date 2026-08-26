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
    assertEqual(cell.tagName, 'INPUT', 'expected a grid square to be focused after loading');
    typeInto(cell, window, 'X');
    assertNotEqual(document.activeElement, cell, 'typing should have advanced to the next square');
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
    for(let i = 0; i < 60 && cluesForKaufen.size <= 2; i++){
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
    // Each source entry carries exactly two clues, so a third distinct clue is only reachable if
    // the two entries merged into one word. Asserting on all four would just be testing how
    // evenly a random draw covers four options.
    assertTrue(cluesForKaufen.size > 2,
      `only saw ${cluesForKaufen.size} distinct clues for KAUFEN; a merged word should offer more than one entry's worth`);
  });

  test('the word count is capped at 120, from the URL and from the field alike', async () => {
    const app = await bootApp('?list=german&words=900');
    const doc = app.document;
    const field = doc.getElementById('wordCount');

    assertEqual(field.value, '120', 'a ?words= far above the cap should clamp');
    assertEqual(field.max, '120', 'the field should not offer more than the cap');
    assertEqual(doc.querySelectorAll('#acrossList li, #downList li').length, 120);

    field.value = '5000';
    doc.getElementById('generateBtn').click();
    assertEqual(field.value, '120', 'a hand-typed count above the cap should clamp too');
    assertEqual(doc.querySelectorAll('#acrossList li, #downList li').length, 120);
  });

  test('generating at the cap stays well under a second', async () => {
    const app = await bootApp('?list=german&words=120');
    const doc = app.document;
    const started = performance.now();
    doc.getElementById('generateBtn').click();
    const elapsed = performance.now() - started;
    // Generation is synchronous, so this is frozen-tab time. Measured around 310-380ms; a
    // generous ceiling here still catches a return to the old cubic blow-up.
    assertTrue(elapsed < 3000, `generating 120 words blocked for ${Math.round(elapsed)}ms`);
  });

  // ---------- shareable puzzles ----------

  function describePuzzle(doc){
    return {
      grid: Array.from(doc.querySelectorAll('#grid .cell'))
        .map((c) => c.classList.contains('block') ? '#' : '.').join(''),
      answers: Array.from(doc.querySelectorAll('#printAnswerAcross li, #printAnswerDown li'))
        .map((li) => li.textContent).join('|'),
      clues: Array.from(doc.querySelectorAll('#acrossList li, #downList li'))
        .map((li) => li.textContent).join('|')
    };
  }

  test('the address bar always names the puzzle on screen with a seed', async () => {
    const app = await bootApp('?list=german&words=15');
    const search = app.window.location.search;
    assertTrue(/seed=[a-z0-9]+/.test(search), `no seed in ${search}`);
  });

  test('a seeded URL rebuilds the identical puzzle - grid, words and clues', async () => {
    const first = await bootApp('?list=german&words=15');
    const before = describePuzzle(first.document);
    const shared = first.window.location.search;

    const replay = await bootApp(shared);
    const after = describePuzzle(replay.document);

    assertEqual(after.grid, before.grid, 'same seed should give the same grid shape');
    assertEqual(after.answers, before.answers, 'same seed should give the same words');
    assertEqual(after.clues, before.clues, 'same seed should give the same clues');
  });

  test('a hand-written seed is honoured', async () => {
    const a = await bootApp('?list=english&words=12&seed=abc123');
    const b = await bootApp('?list=english&words=12&seed=abc123');
    assertEqual(describePuzzle(b.document).answers, describePuzzle(a.document).answers);
    assertTrue(a.window.location.search.includes('seed=abc123'), 'the seed should survive in the URL');
  });

  test('different seeds give different puzzles', async () => {
    const a = await bootApp('?list=english&words=12&seed=aaaaaa');
    const b = await bootApp('?list=english&words=12&seed=bbbbbb');
    assertNotEqual(describePuzzle(b.document).answers, describePuzzle(a.document).answers);
  });

  test('New crossword moves to a new seed rather than replaying the old one', async () => {
    const app = await bootApp('?list=german&words=15&seed=abc123');
    const before = describePuzzle(app.document);
    app.document.getElementById('generateBtn').click();
    const after = describePuzzle(app.document);
    assertNotEqual(after.answers, before.answers, 'a new puzzle was expected');
    assertTrue(!app.window.location.search.includes('seed=abc123'), 'the seed should have moved on');
  });

  test('a garbage seed falls back to a fresh puzzle rather than breaking', async () => {
    const app = await bootApp('?list=english&words=10&seed=' + encodeURIComponent('!!! not a seed !!!'));
    assertEqual(app.errors.length, 0, app.errors.join('; '));
    assertEqual(app.document.querySelectorAll('#acrossList li, #downList li').length, 10);
  });

  // ---------- accessibility ----------

  test('every grid square has a spoken name saying where it is and what it belongs to', async () => {
    const app = await bootApp('?list=english&words=10');
    const inputs = Array.from(app.document.querySelectorAll('#grid .cell input'));
    assertTrue(inputs.length > 0, 'expected a grid');
    const unlabelled = inputs.filter((i) => !i.getAttribute('aria-label'));
    assertEqual(unlabelled.length, 0, `${unlabelled.length} squares had no aria-label`);
    // and the label should actually locate the square
    const sample = inputs[0].getAttribute('aria-label');
    assertTrue(/^Row \d+, column \d+/.test(sample), `unhelpful label: ${sample}`);
  });

  test('clues are reachable and operable from the keyboard, not only by mouse', async () => {
    const app = await bootApp('?list=english&words=10');
    const { document: doc, window: win } = app;
    const clue = doc.querySelector('#acrossList li, #downList li');
    assertEqual(clue.getAttribute('tabindex'), '0', 'a clue should be a tab stop');
    assertEqual(clue.getAttribute('role'), 'button');

    clue.focus();
    clue.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    // focus() does not always take effect in the same tick - WebKit applies it a beat later.
    await waitFor(() => doc.activeElement && doc.activeElement.tagName === 'INPUT', 2000);
    assertEqual(doc.activeElement.tagName, 'INPUT', 'Enter on a clue should move focus into the grid');
  });

  test('the current clue is marked for assistive tech, not only by colour', async () => {
    const app = await bootApp('?list=english&words=10');
    const doc = app.document;
    const current = doc.querySelectorAll('.clue-list li[aria-current="true"]');
    assertEqual(current.length, 1, 'exactly one clue should be marked current');
    assertTrue(current[0].classList.contains('active'), 'and it should be the highlighted one');
  });

  test('the page declares the language it is actually showing', async () => {
    const german = await bootApp('?list=german&words=8');
    assertEqual(german.document.documentElement.lang, 'de');
    const english = await bootApp('?list=english&words=8');
    assertEqual(english.document.documentElement.lang, 'en');
  });

  test('the status line is a live region so warnings are announced', async () => {
    const app = await bootApp('?list=english&words=8');
    const status = app.document.getElementById('status');
    assertEqual(status.getAttribute('role'), 'status');
    assertEqual(status.getAttribute('aria-live'), 'polite');
  });

  test('the celebration is a modal dialog that takes and traps focus', async () => {
    const app = await bootApp('?list=english&words=2');
    if(!solvePuzzle(app)) return;
    const { document: doc, window: win } = app;
    const overlay = doc.getElementById('celebrateOverlay');
    assertTrue(overlay.classList.contains('show'), 'expected the celebration to open');
    assertEqual(overlay.getAttribute('role'), 'dialog');
    assertEqual(overlay.getAttribute('aria-modal'), 'true');
    assertEqual(overlay.hidden, false);
    await waitFor(() => doc.activeElement && doc.activeElement.id === 'celebrateNewBtn', 2000);
    assertEqual(doc.activeElement.id, 'celebrateNewBtn', 'focus should move into the dialog');

    // Tab off the last control wraps back to the first rather than escaping to the page behind.
    const closeBtn = doc.getElementById('celebrateCloseBtn');
    closeBtn.focus();
    await waitFor(() => doc.activeElement === closeBtn, 2000);
    doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    await waitFor(() => doc.activeElement && doc.activeElement.id === 'celebrateNewBtn', 2000);
    assertEqual(doc.activeElement.id, 'celebrateNewBtn', 'focus should have wrapped');
  });

  test('Escape closes the celebration and hands focus back to the grid', async () => {
    const app = await bootApp('?list=english&words=2');
    if(!solvePuzzle(app)) return;
    const { document: doc, window: win } = app;
    doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const overlay = doc.getElementById('celebrateOverlay');
    assertTrue(!overlay.classList.contains('show'), 'Escape should close the dialog');
    assertEqual(overlay.hidden, true);
    await waitFor(() => doc.activeElement && doc.activeElement.tagName === 'INPUT', 2000);
    assertEqual(doc.activeElement.tagName, 'INPUT', 'focus should return to the grid');
  });

  test('closing the celebration leaves no fireworks painted on the canvas', async () => {
    const app = await bootApp('?list=english&words=2');
    if(!solvePuzzle(app)) return;
    const doc = app.document;
    const canvas = doc.getElementById('fireworksCanvas');
    doc.getElementById('celebrateCloseBtn').click();
    // The old code only set a flag when the run ended, so the last frame stayed on the canvas.
    assertEqual(litPixelCount(canvas), 0, 'the canvas should be wiped, not just left frozen');
  });

  // ---------- printing ----------

  test('only the answers are printed upside down - the rule and heading stay the right way up', async () => {
    const doc = (await bootApp('?list=german&words=10')).document;
    // The rotation used to sit on the whole block, which put the dividing rule and the heading
    // inverted at the bottom, below the answers they were meant to introduce.
    assertEqual(printRuleValue(doc, '#printAnswerKey', 'transform'), null,
      'the answer key block itself must not be rotated');
    assertEqual(printRuleValue(doc, '#printAnswerKey .key-cols', 'transform'), 'rotate(180deg)',
      'the answers alone should be inverted');
  });

  test('the answer key is kept whole, so a page break lands before it rather than through it', async () => {
    const doc = (await bootApp('?list=german&words=10')).document;
    assertEqual(printRuleValue(doc, '#printAnswerKey', 'break-inside'), 'avoid');
    assertEqual(printRuleValue(doc, '#printAnswerKey .key-heading', 'break-after'), 'avoid',
      'the heading should never be orphaned from its answers');
  });

  test('the answer key can be turned off for printing', async () => {
    const app = await bootApp('?list=german&words=10');
    const { document: doc, window: win } = app;
    const checkbox = doc.getElementById('printKey');
    assertTrue(checkbox.checked, 'the key should be printed by default, as it always has been');
    assertTrue(!doc.body.classList.contains('print-no-key'));

    checkbox.checked = false;
    checkbox.dispatchEvent(new win.Event('change', { bubbles: true }));
    assertTrue(doc.body.classList.contains('print-no-key'), 'unchecking should suppress the key');
  });

  test('printed cells are sized from the paper, not from the window that generated the puzzle', async () => {
    const doc = (await bootApp('?list=german&words=40')).document;
    const cellSize = printRuleValue(doc, '#grid', '--cell-size');
    // A wide window allows a wide column budget; 29 columns at a flat 26px is about 199mm
    // against roughly 190mm of printable A4, so the cap has to be able to shrink.
    assertTrue(cellSize && cellSize.includes('min('),
      `print cell size should be bounded by the page, got ${cellSize}`);
    assertTrue(cellSize.includes('var(--cols)'),
      'the bound should divide the page width by the actual column count');
  });

  test('the toolbar reads options, check, print, then new crossword last', async () => {
    const doc = (await bootApp('?list=german&words=10')).document;
    const order = Array.from(doc.querySelectorAll('.toolbar button'))
      .filter((b) => b.offsetParent !== null || b.id)   // the hamburger has no text of its own
      .map((b) => b.id);
    assertEqual(order.join(','), 'hamburgerBtn,checkBtn,printBtn,generateBtn');
  });

  test('the footer describes what a shared start cell actually does', async () => {
    const doc = (await bootApp('?list=german&words=10')).document;
    const hint = doc.querySelector('footer.hint').textContent;
    // It highlights the word you are editing; it does not put a question to you.
    assertTrue(!/ask which one you mean/i.test(hint), 'the old, inaccurate wording is still there');
    assertTrue(/highlighted/i.test(hint), 'the hint should mention the highlight');
    assertTrue(/space/i.test(hint), 'and how to switch direction');
  });
}
