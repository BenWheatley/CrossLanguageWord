/**
 * app-helpers.js - helpers for driving the real app (../index.html) inside an iframe, for use
 * by app-tests.js. Uses a genuine browser (whatever's running the test page), so fetch(),
 * <script src>, composition events, and focus all behave exactly as they do for a real user -
 * nothing here is mocked.
 *
 * Requires the test page to be served over http(s) for fetch('german.json' etc.) to work,
 * same as the app itself.
 */
function waitFor(predicate, timeout = 5000, interval = 20){
  return new Promise((resolve) => {
    const start = Date.now();
    (function poll(){
      if(predicate()) return resolve(true);
      if(Date.now() - start >= timeout) return resolve(false);
      setTimeout(poll, interval);
    })();
  });
}

/**
 * Loads a URL into the shared frame and resolves once *that* document has loaded.
 *
 * Checking which document arrived is the whole point. Setting src twice in quick succession
 * (about:blank, then the app) leaves load events in flight, and a listener attached for the
 * second navigation will happily fire on the first one's event - handing back the about:blank
 * document, whose getElementById returns null for everything and whose localStorage view is not
 * the app's. That was the source of a long string of "WebKit is flaky" symptoms.
 *
 * Compared by pathname, not full href: the app rewrites its own query string during load.
 */
function loadFrame(iframe, url){
  const wanted = new URL(url, location.href).pathname;
  return new Promise((resolve) => {
    function onLoad(){
      let arrived = null;
      try{ arrived = iframe.contentWindow.location.pathname; }catch(e){ return; }
      if(arrived !== wanted) return; // a stale event from an earlier navigation
      iframe.removeEventListener('load', onLoad);
      resolve();
    }
    iframe.addEventListener('load', onLoad);
    iframe.src = url;
  });
}

/**
 * Loads (or reloads) the app in the shared #appFrame iframe and waits until it has actually
 * finished generating a puzzle, not just until the iframe's 'load' event fires.
 *
 * @param {string} query e.g. '?list=german&words=10'
 * @param {{keepSavedState?: boolean}} opts - by default each boot starts from a clean slate.
 *   Pass keepSavedState to test resume behaviour across two boots.
 */
async function bootApp(query = '', opts = {}){
  const iframe = document.getElementById('appFrame');

  // Tear the previous app down before touching storage, and do the clearing from inside the
  // frame. Two separate hazards, one step: the outgoing app may have a debounced save pending
  // that would land after the clear, and a clear issued from *this* page is not ordered against
  // the frame's own writes in WebKit, so it could wipe state a resume test had just set up.
  // blank.html is same-origin, destroys the previous document, and clears in its own timeline.
  await loadFrame(iframe, 'blank.html' + (opts.keepSavedState ? '' : '?clear=1'));

  await loadFrame(iframe, '../index.html' + query);

  const win = iframe.contentWindow;
  const doc = win.document;
  const errors = [];
  win.onerror = (msg) => errors.push(msg);

  const ready = await waitFor(() => doc.querySelectorAll('#grid .cell').length > 0);
  if(!ready && errors.length === 0) errors.push('app did not finish rendering a grid within the timeout');
  // Cells existing is not the same as the app being ready to type into. focusFirstCell() runs at
  // the end of render, but the focus does not always land in the same tick - in WebKit it lands a
  // beat later, which intermittently left document.activeElement as <body> and made every
  // focus-dependent test a coin toss. Best-effort: a test that does not care must not fail here.
  if(ready) await waitFor(() => doc.activeElement && doc.activeElement.tagName === 'INPUT', 2000);

  return { window: win, document: doc, errors };
}

function clickCell(el, win){
  el.dispatchEvent(new win.Event('mousedown', { bubbles: true }));
}

function typeInto(input, win, char){
  input.dispatchEvent(new win.KeyboardEvent('keydown', { key: char, bubbles: true }));
  input.value = char;
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
}

function gridIndex(doc){
  const inputs = Array.from(doc.querySelectorAll('#grid .cell input'));
  const byPos = {};
  inputs.forEach((inp) => { byPos[inp.dataset.r + ',' + inp.dataset.c] = inp; });
  function startOf(number){
    const numSpans = Array.from(doc.querySelectorAll('#grid .cell .num'));
    const span = numSpans.find((s) => s.textContent === String(number));
    if(!span) return null;
    const input = span.parentElement.querySelector('input');
    return { r: parseInt(input.dataset.r, 10), c: parseInt(input.dataset.c, 10) };
  }
  return { byPos, startOf };
}

/**
 * Fills in the whole grid from the printed answer key, which is how a test solves a puzzle.
 * Returns false if the key and the grid disagree, so a caller can bail rather than assert
 * against a half-filled grid.
 */
function solvePuzzle(app){
  const { document: doc, window: win } = app;
  const starts = {};
  doc.querySelectorAll('#grid .cell').forEach((cell) => {
    const num = cell.querySelector('.num');
    const input = cell.querySelector('input');
    if(num && input) starts[num.textContent] = { r: +input.dataset.r, c: +input.dataset.c };
  });

  let filled = 0;
  for(const [listSel, dir] of [['#printAnswerAcross', 'across'], ['#printAnswerDown', 'down']]){
    for(const li of doc.querySelectorAll(listSel + ' li')){
      const match = /^(\d+)\.\s*(.+)$/.exec(li.textContent);
      if(!match) return false;
      const start = starts[match[1]];
      if(!start) return false;
      const answer = Array.from(match[2]);
      for(let i = 0; i < answer.length; i++){
        const r = dir === 'across' ? start.r : start.r + i;
        const c = dir === 'across' ? start.c + i : start.c;
        const input = doc.querySelector(`#grid .cell input[data-r="${r}"][data-c="${c}"]`);
        if(!input) return false;
        input.value = answer[i];
        input.dispatchEvent(new win.Event('input', { bubbles: true }));
        filled++;
      }
    }
  }
  return filled > 0;
}

/** Counts canvas pixels with meaningful alpha - i.e. is anything actually painted there? */
function litPixelCount(canvas){
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let count = 0;
  for(let i = 3; i < data.length; i += 4){ if(data[i] > 8) count++; }
  return count;
}

/**
 * Looks up a declaration inside the stylesheet's `@media print` block. Print rules cannot be
 * exercised by rendering - the test page has no way to put the browser into print media - so the
 * rules themselves are what gets asserted on.
 * @returns {string|null} the declared value, or null if the selector isn't in a print block.
 */
function printRuleValue(doc, selector, property){
  for(const sheet of Array.from(doc.styleSheets)){
    let rules;
    try{ rules = Array.from(sheet.cssRules); }catch(e){ continue; } // cross-origin sheet
    for(const rule of rules){
      if(!(rule.media && Array.from(rule.media).join(',').includes('print'))) continue;
      for(const inner of Array.from(rule.cssRules || [])){
        if(inner.selectorText === selector){
          const value = inner.style.getPropertyValue(property);
          if(value) return value.trim();
        }
      }
    }
  }
  return null;
}
