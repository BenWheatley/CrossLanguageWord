/**
 * engine-tests.js - unit tests for crossword-engine.js (the pure generation logic), run in the
 * browser against the same window.CrosswordEngine the app itself uses.
 *
 * Registered onto the shared runner created in tests/index.html.
 */
function registerEngineTests(test){
  const engine = window.CrosswordEngine;

  /** Runs pickClue with a generator that returns one fixed value. */
  const pickWith = (word, value) => engine.pickClue(word, () => value);

  const GOLDEN_FINGERPRINT = '1nkful2ldp2';
  const GOLDEN_SHAPE = 'yran4iwdvv';
  const GOLDEN_RNG_VALUES = ['0.012550512096', '0.860431064852', '0.447748388397', '0.767062008381'];

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

  test('toUpperGrapheme() writes ß as SS, the way a German crossword does', () => {
    // Deliberate, not a bug to tidy away: Duden's all-caps rule and German crossword convention
    // both give SS, and the solver can type both squares. Seven cells for a six-letter word.
    assertEqual(engine.toUpperGrapheme('straße'), 'STRASSE');
    assertEqual(engine.graphemes(engine.toUpperGrapheme('straße')).length, 7);
  });

  test('toUpperGrapheme() folds a capital eszett to SS rather than leaving an untypable cell', () => {
    // ẞ is a legal alternative in German orthography but is not on anybody's keyboard, so a list
    // written with it must not produce a square the solver cannot fill.
    assertEqual(engine.toUpperGrapheme('STRAẞE'), 'STRASSE');
    assertEqual(engine.toUpperGrapheme('ẞ'), 'SS');
  });

  test('toUpperGrapheme() does not depend on the reader\'s system locale', () => {
    // toLocaleUpperCase() would give İ under a Turkish locale, so the same word list built a
    // different grid on a Turkish machine and a shared seed stopped reproducing there.
    assertEqual(engine.toUpperGrapheme('i'), 'I');
    assertEqual(engine.toUpperGrapheme('istanbul'), 'ISTANBUL');
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
      const result = engine.buildCrossword(bank, target, { attempts: 3 }); // few attempts keeps this test fast
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

  // ---------- reproducibility ----------
  // A seed in a URL is only worth having if it names the same puzzle everywhere. These pin that
  // down; the golden-values test below is the one that would catch someone swapping the PRNG.

  test('makeRng() produces the documented stream (changing this invalidates every shared URL)', () => {
    // Captured from the mulberry32 + FNV-1a implementation in crossword-engine.js. They depend
    // only on Math.imul, xor, unsigned shifts and a division by 2^32, so every engine must agree.
    // If this fails, the PRNG changed and every seed anyone has shared now opens a different
    // puzzle - that is a breaking change, not a test to update casually.
    const rnd = engine.makeRng('abc123');
    const got = [rnd(), rnd(), rnd(), rnd()].map((v) => v.toFixed(12));
    assertEqual(got.join(','), GOLDEN_RNG_VALUES.join(','));
  });

  test('makeRng() gives uncorrelated streams for seeds differing by one character', () => {
    const a = engine.makeRng('seed1');
    const b = engine.makeRng('seed2');
    let shared = 0;
    for(let i = 0; i < 20; i++){ if(a() === b()) shared++; }
    assertEqual(shared, 0, 'neighbouring seeds should not produce overlapping streams');
  });

  test('buildCrossword() rebuilds an identical puzzle from the same seed', async () => {
    const bank = await loadBank('german.json');
    const describe = (result) => result.placements
      .map((p) => `${p.word.answer}@${p.row},${p.col},${p.dir}`).join('|');
    for(const seed of ['abc123', 'zzz999', 'q']){
      const first = engine.buildCrossword(bank, 20, { maxCols: 20, rng: engine.makeRng(seed) });
      const second = engine.buildCrossword(bank, 20, { maxCols: 20, rng: engine.makeRng(seed) });
      assertEqual(describe(second), describe(first), `seed ${seed} did not reproduce`);
    }
  });

  test('buildCrossword() gives different puzzles for different seeds', async () => {
    const bank = await loadBank('german.json');
    const describe = (seed) => engine
      .buildCrossword(bank, 20, { maxCols: 20, rng: engine.makeRng(seed) })
      .placements.map((p) => p.word.answer).join('|');
    assertNotEqual(describe('aaaaaa'), describe('bbbbbb'));
  });

  test('attemptsFor() is a pure function of the target, so speed cannot change the puzzle', () => {
    // The old wall-clock budget meant a fast machine tried more layouts and settled on a
    // different one. Attempt counts must depend on nothing but the word count.
    for(const n of [2, 10, 15, 20, 30, 40, 60, 80, 120]){
      assertEqual(engine.attemptsFor(n), engine.attemptsFor(n), `attemptsFor(${n}) is unstable`);
      assertTrue(engine.attemptsFor(n) >= 1, `attemptsFor(${n}) must run at least once`);
    }
    // and more words must never mean more work per puzzle
    let previous = Infinity;
    for(const n of [10, 15, 20, 30, 40, 60, 80, 120]){
      const attempts = engine.attemptsFor(n);
      assertTrue(attempts <= previous, `attemptsFor(${n}) rose to ${attempts}`);
      previous = attempts;
    }
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
        const result = engine.buildCrossword(bank, 20, { maxCols });
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

  // ---------- identifying a word list ----------
  // The split between these two matters, and is not arbitrary: the grid and the choice of words
  // depend on the answers alone, while which clue is shown also depends on clue counts and text.
  // Measured, not assumed - see the tests below.

  const bankA = [
    { answer: 'VENSTER', clues: ['a1', 'a2'] },
    { answer: 'DEUR',    clues: ['b1', 'b2'] },
    { answer: 'STRAAT',  clues: ['c1', 'c2'] }
  ];
  const cloneBank = (b) => b.map((w) => ({ answer: w.answer, clues: w.clues.slice() }));

  test('wordListFingerprint() changes when the clue text changes', () => {
    const edited = cloneBank(bankA);
    edited[1].clues[0] = 'different wording';
    assertNotEqual(engine.wordListFingerprint(edited), engine.wordListFingerprint(bankA));
  });

  test('wordListFingerprint() changes when a word gains a clue', () => {
    const edited = cloneBank(bankA);
    edited[2].clues.push('c3');
    assertNotEqual(engine.wordListFingerprint(edited), engine.wordListFingerprint(bankA));
  });

  test('wordListShape() ignores clues but not answers or their order', () => {
    const reworded = cloneBank(bankA).map((w) => ({ answer: w.answer, clues: ['zzz'] }));
    assertEqual(engine.wordListShape(reworded), engine.wordListShape(bankA),
      'clue edits must not look like a different list of words');

    const reordered = cloneBank(bankA);
    [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
    assertNotEqual(engine.wordListShape(reordered), engine.wordListShape(bankA),
      'order decides the grid, so it must change the shape');

    const extra = cloneBank(bankA).concat([{ answer: 'TAFEL', clues: ['d1'] }]);
    assertNotEqual(engine.wordListShape(extra), engine.wordListShape(bankA));
  });

  test('a list that keeps its shape rebuilds the same grid from the same seed', async () => {
    // This is the claim the shape hash is making, so it is worth checking against the generator
    // rather than trusting the reasoning.
    const bank = (await loadBank('example.json')).slice(0, 40).map((w) => ({ answer: w.answer, clues: [w.clue] }));
    const reworded = bank.map((w) => ({ answer: w.answer, clues: ['rewritten clue'] }));
    assertEqual(engine.wordListShape(reworded), engine.wordListShape(bank));

    const describe = (b) => engine
      .buildCrossword(b.map((w) => ({ answer: w.answer, clue: w.clues[0] })), 12,
        { maxCols: 20, rng: engine.makeRng('fixed') })
      .placements.map((p) => `${p.word.answer}@${p.row},${p.col},${p.dir}`).join('|');
    assertEqual(describe(reworded), describe(bank), 'same answers in the same order, same grid');
  });

  test('fingerprints are the documented values (changing this breaks existing links)', () => {
    // Like the PRNG golden values: a link carries a fingerprint, so changing how one is computed
    // means every link anyone has saved stops finding its list.
    assertEqual(engine.wordListFingerprint(bankA), GOLDEN_FINGERPRINT);
    assertEqual(engine.wordListShape(bankA), GOLDEN_SHAPE);
  });

  // ---------- clues that give the answer away ----------

  test('clueRevealsAnswer() catches the answer printed in its own clue', () => {
    assertTrue(engine.clueRevealsAnswer('WISSEN', "wir ___ (wissen, 'to know (a fact)': present tense)"));
    assertTrue(engine.clueRevealsAnswer('ESSEN', "wir ___ (essen, 'to eat': present tense)"));
    assertTrue(engine.clueRevealsAnswer('SNOW', 'Perfect for building a snowman'));
  });

  test('clueRevealsAnswer() catches the answer with an ending still attached', () => {
    assertTrue(engine.clueRevealsAnswer('MIETE', "ich ___ (mieten, 'to rent': present tense)"));
    assertTrue(engine.clueRevealsAnswer('HABE', "ich ___ (haben, 'to have': present tense)"));
  });

  test('clueRevealsAnswer() does not fire on short answers hiding inside ordinary words', () => {
    // The reason for the length floors: two- and three-letter answers are substrings of half the
    // dictionary, and treating that as a giveaway would throw away perfectly good clues.
    assertTrue(!engine.clueRevealsAnswer('EI', 'Sein Freund kam vorbei'));
    assertTrue(!engine.clueRevealsAnswer('IN', 'Inside a place'));
    assertTrue(!engine.clueRevealsAnswer('ER', 'A male person'));
    assertTrue(!engine.clueRevealsAnswer('HAUS', 'Where a family lives'));
  });

  test('pickClue() skips a giveaway and takes the next clue instead', () => {
    const word = { answer: 'WISSEN', clues: ['wir ___ (wissen, ...)', 'To have knowledge of a fact'] };
    // whatever the draw lands on, the clean clue is what comes back
    for(const value of [0, 0.4, 0.6, 0.99]){
      assertEqual(pickWith(word, value), 'To have knowledge of a fact');
    }
  });

  test('pickClue() keeps the drawn clue when every clue gives the answer away', () => {
    // A revealed answer still beats no clue at all.
    const word = { answer: 'STAND', clues: ['a stand', 'the stand'] };
    assertEqual(pickWith(word, 0), 'a stand');
    assertEqual(pickWith(word, 0.99), 'the stand');
  });

  test('pickClue() takes exactly one draw, so seeds keep meaning the same puzzle', () => {
    // The draw is scaled by clues.length. Filtering the list first, or drawing more than once,
    // would shift every later word's clue and change what an already-shared seed opens.
    let draws = 0;
    const rnd = () => { draws++; return 0.5; };
    engine.pickClue({ answer: 'WISSEN', clues: ['wir ___ (wissen, ...)', 'ok', 'also ok'] }, rnd);
    assertEqual(draws, 1);
  });
}
