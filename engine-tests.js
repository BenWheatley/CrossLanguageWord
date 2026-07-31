/**
 * engine-tests.js — unit tests for crossword-engine.js (the pure generation logic), run in the
 * browser against the same window.CrosswordEngine the app itself uses.
 *
 * Registered onto the shared runner created in tests/index.html.
 */
function registerEngineTests(test){
  const engine = window.CrosswordEngine;

  async function loadBank(filename){
    const res = await fetch('../' + filename);
    const data = await res.json();
    return data.words.map((w) => ({
      answer: engine.toUpperGrapheme(w.word),
      clue: w.clues[0]
    }));
  }

  // ---------- grapheme / case handling ----------

  test('graphemes() splits astral/surrogate-pair characters as single units', () => {
    const result = engine.graphemes('a𝔘b');
    assertEqual(result.length, 3, `expected 3 graphemes, got ${JSON.stringify(result)}`);
  });

  test('graphemes() handles plain ASCII correctly', () => {
    assertEqual(engine.graphemes('cat').join(','), 'c,a,t');
  });

  test('toUpperGrapheme() uppercases German umlauts correctly', () => {
    assertEqual(engine.toUpperGrapheme('küche'), 'KÜCHE');
  });

  test('toUpperGrapheme() uppercases Greek letters correctly', () => {
    assertEqual(engine.toUpperGrapheme('π'), 'Π');
  });

  // ---------- attemptPlacement() ----------

  test('attemptPlacement() places the first word across at the origin', () => {
    const bank = [{ answer: 'HOUSE', clue: '' }];
    const result = engine.attemptPlacement(bank, 1);
    assertEqual(result.placements.length, 1);
    const p = result.placements[0];
    assertEqual(p.row, 0);
    assertEqual(p.col, 0);
    assertEqual(p.dir, 'across');
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
        if(grid.has(k)) assertEqual(grid.get(k), p.letters[i], `conflicting letters at cell ${k}`);
        else grid.set(k, p.letters[i]);
      }
    }
  });

  // ---------- computeBounds() ----------

  test('computeBounds() computes a correct bounding box for a single across word', () => {
    const bounds = engine.computeBounds([{ row: 0, col: 0, dir: 'across', letters: ['A','B','C'] }]);
    assertEqual(bounds.rows, 1);
    assertEqual(bounds.cols, 3);
  });

  test('computeBounds() computes a correct bounding box across mixed directions', () => {
    const placements = [
      { row: 0, col: 0, dir: 'across', letters: ['A','B','C'] },
      { row: -2, col: 1, dir: 'down', letters: ['X','B','Y','Z'] }
    ];
    const bounds = engine.computeBounds(placements);
    assertEqual(bounds.minR, -2);
    assertEqual(bounds.rows, 4);
  });

  // ---------- buildCrossword() ----------

  test('buildCrossword() places every requested word when the bank comfortably allows it', async () => {
    const bank = await loadBank('example.json');
    for(const n of [5, 10, 20]){
      const result = engine.buildCrossword(bank, n);
      assertEqual(result.placements.length, n, `target=${n} only placed ${result.placements.length}`);
    }
  });

  test('buildCrossword() clamps to bank size when more words are requested than exist', async () => {
    const bank = (await loadBank('example.json')).slice(0, 8);
    const result = engine.buildCrossword(bank, 999);
    assertTrue(result.placements.length <= bank.length);
  });

  test('buildCrossword() never places the same word object twice', async () => {
    const bank = await loadBank('german.json');
    const result = engine.buildCrossword(bank, 30);
    const seen = new Set();
    for(const p of result.placements){
      assertTrue(!seen.has(p.word), 'a word object was placed more than once');
      seen.add(p.word);
    }
  });

  test('buildCrossword() keeps long compound words from dominating the grid (German B1 list)', async () => {
    const bank = await loadBank('german.json');
    const result = engine.buildCrossword(bank, 20);
    const lens = result.placements.map((p) => p.letters.length);
    const avg = lens.reduce((a,b) => a+b, 0) / lens.length;
    assertTrue(avg < 10, `average placed-word length was ${avg.toFixed(2)}, expected well under 10`);
  });

  test('buildCrossword() reliably reaches the full requested count at various scales (all real lists)', async () => {
    for(const file of ['german.json', 'example.json', 'deutsch-fragen-english.json']){
      const bank = await loadBank(file);
      for(const n of [10, 30, Math.min(100, bank.length)]){
        const result = engine.buildCrossword(bank, n);
        assertEqual(result.placements.length, n, `${file} target=${n} only placed ${result.placements.length}`);
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
    ].map((w) => ({ answer: w, clue: w }));
    const bank = fillers.concat(realNetwork);
    const result = engine.buildCrossword(bank, realNetwork.length);
    assertEqual(result.placements.length, realNetwork.length);
  });

  // ---------- trimAndIndex() / numberGrid() ----------

  test('numberGrid() assigns a number to every placement, and shared start cells share one number', async () => {
    const bank = await loadBank('example.json');
    const result = engine.buildCrossword(bank, 15);
    const built = engine.trimAndIndex(result);
    const numbering = engine.numberGrid(built);
    assertEqual(numbering.placements.length, built.placements.length);
    const byPos = new Map();
    for(const p of numbering.placements){
      assertTrue(Number.isInteger(p.number) && p.number > 0, `placement ${p.answer} has an invalid number`);
      const k = p.row + ',' + p.col;
      if(byPos.has(k)) assertEqual(byPos.get(k), p.number, `cell ${k} has two different numbers`);
      else byPos.set(k, p.number);
    }
  });
}
