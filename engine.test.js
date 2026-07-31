/**
 * engine.test.js — unit tests for crossword-engine.js (the pure generation logic).
 * No DOM/browser needed here; this is plain Node, so it's fast and has no dependencies.
 *
 * Run directly: node tests/engine.test.js
 * Or via the full suite: node tests/run-tests.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test, run } = require('./mini-test')();
const engine = require('../crossword-engine.js');

const ROOT = path.join(__dirname, '..');

function loadBank(filename){
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, filename), 'utf8'));
  return data.words.map(w => ({
    answer: engine.toUpperGrapheme(w.word),
    clue: w.clues[0]
  }));
}

function wordsOf(bank, n){
  return bank.slice(0, n);
}

// ---------- grapheme / case handling ----------

test('graphemes() splits astral/surrogate-pair characters as single units', () => {
  const result = engine.graphemes('a𝔘b'); // 𝔘 is outside the BMP (surrogate pair in UTF-16)
  assert.strictEqual(result.length, 3, `expected 3 graphemes, got ${result.length}: ${JSON.stringify(result)}`);
});

test('graphemes() handles plain ASCII correctly', () => {
  assert.deepStrictEqual(engine.graphemes('cat'), ['c', 'a', 't']);
});

test('toUpperGrapheme() uppercases German umlauts correctly', () => {
  assert.strictEqual(engine.toUpperGrapheme('küche'), 'KÜCHE');
});

test('toUpperGrapheme() uppercases Greek letters correctly', () => {
  assert.strictEqual(engine.toUpperGrapheme('π'), 'Π');
});

// ---------- attemptPlacement() ----------

test('attemptPlacement() places the first word across at the origin', () => {
  const bank = [{ answer: 'HOUSE', clue: '' }];
  const result = engine.attemptPlacement(bank, 1);
  assert.strictEqual(result.placements.length, 1);
  const p = result.placements[0];
  assert.strictEqual(p.row, 0);
  assert.strictEqual(p.col, 0);
  assert.strictEqual(p.dir, 'across');
});

test('attemptPlacement() only crosses words that actually share a letter at that position', () => {
  const bank = [{ answer: 'HOUSE', clue: '' }, { answer: 'OCEAN', clue: '' }];
  const result = engine.attemptPlacement(bank, 2);
  for(let i = 1; i < result.placements.length; i++){
    const p = result.placements[i];
    let sharesLetter = false;
    for(let j = 0; j < p.letters.length; j++){
      const r = p.dir === 'across' ? p.row : p.row + j;
      const c = p.dir === 'across' ? p.col + j : p.col;
      const first = result.placements[0];
      for(let k = 0; k < first.letters.length; k++){
        const fr = first.dir === 'across' ? first.row : first.row + k;
        const fc = first.dir === 'across' ? first.col + k : first.col;
        if(fr === r && fc === c && first.letters[k] === p.letters[j]) sharesLetter = true;
      }
    }
    assert.ok(sharesLetter, `placement ${p.word.answer} does not share a validating letter with the first word`);
  }
});

test('attemptPlacement() never places two different letters in the same cell', () => {
  const bank = [
    { answer: 'HOUSE', clue: '' }, { answer: 'OCEAN', clue: '' }, { answer: 'RIVER', clue: '' },
    { answer: 'FOREST', clue: '' }, { answer: 'MOUNTAIN', clue: '' }
  ];
  const result = engine.attemptPlacement(bank, bank.length);
  const grid = new Map();
  for(const p of result.placements){
    for(let i = 0; i < p.letters.length; i++){
      const r = p.dir === 'across' ? p.row : p.row + i;
      const c = p.dir === 'across' ? p.col + i : p.col;
      const k = r + ',' + c;
      if(grid.has(k)){
        assert.strictEqual(grid.get(k), p.letters[i], `conflicting letters at cell ${k}`);
      } else {
        grid.set(k, p.letters[i]);
      }
    }
  }
});

// ---------- computeBounds() ----------

test('computeBounds() computes a correct bounding box for a single across word', () => {
  const placements = [{ row: 0, col: 0, dir: 'across', letters: ['A','B','C'] }];
  const bounds = engine.computeBounds(placements);
  assert.strictEqual(bounds.rows, 1);
  assert.strictEqual(bounds.cols, 3);
});

test('computeBounds() computes a correct bounding box across mixed directions', () => {
  const placements = [
    { row: 0, col: 0, dir: 'across', letters: ['A','B','C'] },
    { row: -2, col: 1, dir: 'down', letters: ['X','B','Y','Z'] } // extends above row 0
  ];
  const bounds = engine.computeBounds(placements);
  assert.strictEqual(bounds.minR, -2);
  assert.strictEqual(bounds.rows, 4); // rows -2..1 inclusive
});

// ---------- buildCrossword(): the main integration surface ----------

test('buildCrossword() places every requested word when the bank comfortably allows it', () => {
  const bank = loadBank('example.json');
  for(const n of [5, 10, 20]){
    const result = engine.buildCrossword(bank, n);
    assert.strictEqual(result.placements.length, n, `target=${n} only placed ${result.placements.length}`);
  }
});

test('buildCrossword() clamps to bank size when more words are requested than exist', () => {
  const bank = wordsOf(loadBank('example.json'), 8);
  const result = engine.buildCrossword(bank, 999);
  assert.ok(result.placements.length <= bank.length);
});

test('buildCrossword() never places the same word object twice', () => {
  const bank = loadBank('german.json');
  const result = engine.buildCrossword(bank, 30);
  const seen = new Set();
  for(const p of result.placements){
    assert.ok(!seen.has(p.word), 'a word object was placed more than once');
    seen.add(p.word);
  }
});

test('buildCrossword() keeps long compound words from dominating the grid (German B1 list)', () => {
  const bank = loadBank('german.json');
  const result = engine.buildCrossword(bank, 20);
  const lens = result.placements.map(p => p.letters.length);
  const avg = lens.reduce((a,b) => a+b, 0) / lens.length;
  assert.ok(avg < 10, `average placed-word length was ${avg.toFixed(2)}, expected well under 10`);
});

test('buildCrossword() reliably reaches the full requested count at various scales (all real lists)', () => {
  for(const file of ['german.json', 'example.json', 'deutsch-fragen-english.json']){
    const bank = loadBank(file);
    for(const n of [10, 30, Math.min(100, bank.length)]){
      const result = engine.buildCrossword(bank, n);
      assert.strictEqual(result.placements.length, n, `${file} target=${n} only placed ${result.placements.length}`);
    }
  }
});

test('buildCrossword() escapes a pathological length-imbalanced bank via its fallback phase', () => {
  const fillerLetters = 'JQXYZ'.split('');
  const fillers = [];
  for(let i = 0; i < 50; i++){
    fillers.push({ answer: fillerLetters[i % fillerLetters.length].repeat(3 + (i % 3)), clue: 'f' });
  }
  const realNetwork = [
    'HOUSERIVER','RIVERMOUTH','MOUNTAINOUS','FORESTLAND','LANDSCAPED',
    'GARDENPATH','PATHWAYSIDE','BRIDGEWORK','WORKBENCHES','BENCHMARKED',
    'PALACEGATE','GATEKEEPER','KEEPERHOOD','WINDOWSILL','SILLYPUTTY'
  ].map(w => ({ answer: w, clue: w }));
  const bank = fillers.concat(realNetwork);
  const result = engine.buildCrossword(bank, realNetwork.length);
  assert.strictEqual(result.placements.length, realNetwork.length);
});

// ---------- trimAndIndex() / numberGrid() ----------

test('trimAndIndex() preserves the placement count and produces a non-negative grid', () => {
  const bank = loadBank('example.json');
  const result = engine.buildCrossword(bank, 12);
  const built = engine.trimAndIndex(result);
  assert.strictEqual(built.placements.length, result.placements.length);
  for(const p of built.placements){
    assert.ok(p.row >= 0 && p.row < built.rows);
    assert.ok(p.col >= 0 && p.col < built.cols);
  }
});

test('numberGrid() assigns a number to every placement, and shared start cells share one number', () => {
  const bank = loadBank('example.json');
  const result = engine.buildCrossword(bank, 15);
  const built = engine.trimAndIndex(result);
  const numbering = engine.numberGrid(built);
  assert.strictEqual(numbering.placements.length, built.placements.length);
  for(const p of numbering.placements){
    assert.ok(Number.isInteger(p.number) && p.number > 0, `placement ${p.answer} has an invalid number: ${p.number}`);
  }
  const byPos = new Map();
  for(const p of numbering.placements){
    const k = p.row + ',' + p.col;
    if(byPos.has(k)) assert.strictEqual(byPos.get(k), p.number, `cell ${k} has two different numbers`);
    else byPos.set(k, p.number);
  }
});

test('numberGrid() numbers are unique per starting cell and increase in row-major order', () => {
  const bank = loadBank('example.json');
  const result = engine.buildCrossword(bank, 15);
  const built = engine.trimAndIndex(result);
  const numbering = engine.numberGrid(built);
  const cells = Object.keys(numbering.numAt).map(k => {
    const [r, c] = k.split(',').map(Number);
    return { r, c, n: numbering.numAt[k] };
  }).sort((a,b) => a.n - b.n);
  for(let i = 1; i < cells.length; i++){
    const prev = cells[i-1], cur = cells[i];
    const prevOrder = prev.r * 100000 + prev.c;
    const curOrder = cur.r * 100000 + cur.c;
    assert.ok(curOrder > prevOrder, 'numbers are not in row-major order');
  }
});

if(require.main === module){
  run();
}

module.exports = { run };
