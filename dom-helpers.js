/**
 * dom-helpers.js — shared test harness for app.test.js.
 *
 * Rather than mocking fetch()/URLs/etc., this spins up a real (localhost-only, ephemeral-port)
 * HTTP server serving the actual project directory, then points jsdom at it with JSDOM.fromURL().
 * That means:
 *   - <script src="crossword-engine.js"> resolves exactly like it does in production.
 *   - The app's own fetch('german.json') calls hit real files, not a stub.
 *   - history.replaceState() (used for URL param syncing) works normally — file:// URLs don't
 *     support it in jsdom, but http:// URLs do, matching real deployment.
 *
 * The only things stubbed are browser APIs jsdom genuinely doesn't implement at all
 * (canvas 2D context, requestAnimationFrame) — not app behavior.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

function startServer(){
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = req.url.split('?')[0];
      const rel = urlPath === '/' ? '/crossword-trainer.html' : urlPath;
      const filePath = path.join(ROOT, decodeURIComponent(rel));
      fs.readFile(filePath, (err, data) => {
        if(err){ res.writeHead(404); res.end('not found'); return; }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const fakeCanvasCtx = {
  setTransform(){}, clearRect(){}, beginPath(){}, arc(){}, fill(){},
  set fillStyle(v){}, get fillStyle(){ return '#000'; },
  set globalAlpha(v){}, get globalAlpha(){ return 1; },
};

async function waitFor(predicate, { timeout = 5000, interval = 20 } = {}){
  const start = Date.now();
  while(Date.now() - start < timeout){
    if(predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  return false;
}

/**
 * Boots the real app in jsdom, served from a real local HTTP server.
 * @param {string} query e.g. '?list=german&words=10' (defaults applied by the app if omitted)
 */
async function bootApp(query = ''){
  const server = await startServer();
  const port = server.address().port;
  const dom = await JSDOM.fromURL(`http://127.0.0.1:${port}/crossword-trainer.html${query}`, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    resources: 'usable',
    beforeParse(window){
      window.fetch = (url, opts) => fetch(new window.URL(url, window.location.href).toString(), opts);
      window.HTMLCanvasElement.prototype.getContext = function(){ return fakeCanvasCtx; };
      if(!window.requestAnimationFrame){
        window.requestAnimationFrame = (fn) => setTimeout(fn, 16);
        window.cancelAnimationFrame = (id) => clearTimeout(id);
      }
      window.performance = window.performance || { now: () => Date.now() };
    }
  });
  const { window } = dom;
  const errors = [];
  window.onerror = (msg) => errors.push(msg);

  // Wait for the app's async init (word list fetch + first generate()) to actually finish,
  // rather than guessing a fixed delay — the grid having any cells is a reliable readiness signal.
  const ready = await waitFor(() => window.document.querySelectorAll('#grid .cell').length > 0);
  if(!ready && errors.length === 0){
    errors.push('app did not finish rendering a grid within the timeout');
  }

  return {
    window,
    document: window.document,
    errors,
    close(){
      window.close();
      server.close();
    }
  };
}

/** Simulates a real mouse click on a cell (dispatches 'mousedown', matching the app's listener). */
function clickCell(el, window){
  el.dispatchEvent(new window.Event('mousedown', { bubbles: true }));
}

/** Types a single character into whichever cell input is passed, firing keydown+input like a real keystroke. */
function typeInto(input, window, char){
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: char, bubbles: true }));
  input.value = char;
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
}

/** Builds an {r,c}->input lookup for the current grid, and returns {r0,c0} for a given clue number+direction. */
function gridIndex(document){
  const inputs = Array.from(document.querySelectorAll('#grid .cell input'));
  const byPos = {};
  inputs.forEach(inp => { byPos[inp.dataset.r + ',' + inp.dataset.c] = inp; });
  function startOf(number){
    const numSpans = Array.from(document.querySelectorAll('#grid .cell .num'));
    const span = numSpans.find(s => s.textContent === String(number));
    if(!span) return null;
    const input = span.parentElement.querySelector('input');
    return { r: parseInt(input.dataset.r, 10), c: parseInt(input.dataset.c, 10) };
  }
  return { byPos, startOf };
}

module.exports = { bootApp, clickCell, typeInto, gridIndex };
