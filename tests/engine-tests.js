/**
 * engine-tests.js - unit tests for crossword-engine.js (the pure generation logic), run in the
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

  test('graphemes() splits astral/surrogate-pair characters as single units', () => {
    const result = engine.graphemes('a\uD835\uDD18b');
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

  test('buildCrossword() selects words roughly uniformly at random across repeated generations (no bias toward easy-to-cross words)', async () => {
    const bank = await loadBank('german.json');
    const counts = new Map();
    for(const w of bank) counts.set(w.answer, 0);
    const trials = 40, target = 15;
    for(let i = 0; i < trials; i++){
      const result = engine.buildCrossword(bank, target, 20); // small time budget keeps this test fast
      for(const p of result.placements) counts.set(p.word.answer, counts.get(p.word.answer) + 1);
    }
    const freqs = Array.from(counts.values());
    const expected = (trials * target) / bank.length;
    const mean = freqs.reduce((a,b) => a+b, 0) / freqs.length;
    // Loose statistical check: shouldn't be wildly off from the theoretical expectation for
    // uniform sampling. A tight check would make this test flaky by nature; this just guards
    // against a gross, systematic bias reappearing (e.g. some words never getting picked).
    assertTrue(Math.abs(mean - expected) < expected * 0.25, `mean selections ${mean.toFixed(2)} too far from expected ${expected.toFixed(2)}`);
    const neverSelected = freqs.filter((f) => f === 0).length;
    // For each word, P(never picked in one trial) = 1 - target/bank.length, so the expected
    // count of never-selected words over `trials` independent draws is bank.length times that,
    // raised to the trials power. The previous fixed-fraction threshold sat almost exactly on
    // this expected value with no margin, so it flaked by design - give real headroom around it.
    const expectedNeverSelected = bank.length * Math.pow(1 - target / bank.length, trials);
    assertTrue(neverSelected < expectedNeverSelected * 1.3, `${neverSelected} of ${bank.length} words were never selected across ${trials} trials (expected around ${expectedNeverSelected.toFixed(0)})`);
  });

  test('pickRandomSubset() returns the requested number of unique words', async () => {
    const bank = await loadBank('german.json');
    const subset = engine.pickRandomSubset(bank, 25, Infinity);
    assertEqual(subset.length, 25);
    assertEqual(new Set(subset.map((w) => w.answer)).size, 25);
  });

  test('pickRandomSubset() ensures at least one word fits within a tight maxCols', async () => {
    const bank = await loadBank('german.json');
    for(let trial = 0; trial < 20; trial++){
      const subset = engine.pickRandomSubset(bank, 15, 6);
      assertTrue(subset.some((w) => engine.graphemes(w.answer).length <= 6), 'no word in the subset fits within maxCols=6');
    }
  });

  test('buildCrossword() respects its time budget (does not run drastically longer than requested)', async () => {
    const bank = await loadBank('german.json');
    const budgetMs = 50;
    const t0 = performance.now();
    engine.buildCrossword(bank, 20, budgetMs);
    const elapsed = performance.now() - t0;
    // Generous slack (a single in-flight attempt can finish after the deadline passes) - this
    // is a sanity check against runaway behavior, not a tight timing guarantee.
    assertTrue(elapsed < budgetMs * 5, `took ${elapsed.toFixed(0)}ms for a ${budgetMs}ms budget`);
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

  test('buildCrossword() places every word even in a pathological, poorly-connected bank (via disjoint regions)', () => {
    const fillerLetters = 'JQXYZ'.split('');
    const fillers = [];
    for(let i = 0; i < 20; i++){
      fillers.push({ answer: fillerLetters[i % fillerLetters.length].repeat(3 + (i % 3)), clue: 'f' });
    }
    const realNetwork = ['HOUSERIVER','RIVERMOUTH','MOUNTAINOUS','FORESTLAND','LANDSCAPED']
      .map((w) => ({ answer: w, clue: w }));
    const bank = fillers.concat(realNetwork);
    // target = the whole bank, so nothing gets left out of the random subset - this specifically
    // exercises the disjoint-region fallback on a set that can't all interlock into one cluster.
    const result = engine.buildCrossword(bank, bank.length);
    assertEqual(result.placements.length, bank.length);
  });

  test('buildCrossword() never exceeds a given maxCols, even when the longest word (the usual anchor) is itself wider than the budget', async () => {
    const bank = await loadBank('german.json');
    for(const maxCols of [7, 10, 15, 20]){
      for(let trial = 0; trial < 5; trial++){
        const result = engine.buildCrossword(bank, 20, undefined, maxCols);
        const bounds = engine.computeBounds(result.placements);
        assertTrue(bounds.cols <= maxCols, `maxCols=${maxCols} but grid came out ${bounds.cols} columns wide`);
      }
    }
  });

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

  test('attemptPlacement() never lets one word run straight through another in the same direction (e.g. RENT over the tail of PARENT)', async () => {
    const bank = await loadBank('example.json');
    for(let trial = 0; trial < 30; trial++){
      const result = engine.buildCrossword(bank, 15);
      const dirsAt = new Map();
      for(const p of result.placements){
        for(let i = 0; i < p.letters.length; i++){
          const r = p.dir === 'across' ? p.row : p.row + i;
          const c = p.dir === 'across' ? p.col + i : p.col;
          const k = r + ',' + c;
          const existing = dirsAt.get(k) || { across: false, down: false };
          assertTrue(!existing[p.dir], `${p.answer} (${p.dir}) overlaps another word in the same direction at ${k}`);
          existing[p.dir] = true;
          dirsAt.set(k, existing);
        }
      }
    }
  });

  // Rescued from the standalone copy of this file, which stopped running when the harness
  // was inlined into tests/index.html. Nothing else asserts either behaviour: that a bank
  // full of long compounds does not crowd out shorter words, and that a bank whose entries
  // share almost no letters still gets placed in full via the disjoint-region fallback.

  test('buildCrossword() keeps long compound words from dominating the grid (German B1 list)', async () => {
      const bank = await loadBank('german.json');
      const result = engine.buildCrossword(bank, 20);
      const lens = result.placements.map((p) => p.letters.length);
      const avg = lens.reduce((a,b) => a+b, 0) / lens.length;
      assertTrue(avg < 10, `average placed-word length was ${avg.toFixed(2)}, expected well under 10`);
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
}
