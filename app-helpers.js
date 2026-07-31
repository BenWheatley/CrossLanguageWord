/**
 * app-helpers.js — helpers for driving the real app (../index.html) inside an iframe, for use
 * by app-tests.js. Uses a genuine browser (whatever's running the test page), so fetch(),
 * <script src>, composition events, and focus all behave exactly as they do for a real user —
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
 * Loads (or reloads) the app in the shared #appFrame iframe and waits until it has actually
 * finished generating a puzzle, not just until the iframe's 'load' event fires.
 * @param {string} query e.g. '?list=german&words=10'
 */
function bootApp(query = ''){
  return new Promise((resolve) => {
    const iframe = document.getElementById('appFrame');
    const target = '../index.html' + query;
    function onLoad(){
      iframe.removeEventListener('load', onLoad);
      const win = iframe.contentWindow;
      const doc = win.document;
      const errors = [];
      win.onerror = (msg) => errors.push(msg);
      waitFor(() => doc.querySelectorAll('#grid .cell').length > 0).then((ready) => {
        if(!ready && errors.length === 0) errors.push('app did not finish rendering a grid within the timeout');
        resolve({ window: win, document: doc, errors });
      });
    }
    iframe.addEventListener('load', onLoad);
    // Force a real reload even if the src string is unchanged from last time.
    if(iframe.src.endsWith(target)) iframe.src = 'about:blank';
    iframe.src = target;
  });
}

function clickCell(el, win){
  el.dispatchEvent(new win.Event('mousedown', { bubbles: true }));
}

function typeInto(input, win, char){
  input.dispatchEvent(new win.KeyboardEvent('keydown', { key: char, bubbles: true }));
  input.value = char;
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
}

/** Builds an {r,c}->input lookup for the current grid, plus a lookup from clue number to its start cell. */
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
