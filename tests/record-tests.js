/**
 * record-tests.js - unit tests for learning-record.js, the Leitner rules and the biased draw.
 * Run in the browser against window.LearningRecord, registered onto the shared runner.
 */
function registerRecordTests(test){
  const R = window.LearningRecord;
  const E = window.CrosswordEngine;
  const DAY = 24 * 60 * 60 * 1000;
  const T0 = Date.UTC(2026, 8, 15);
  const bankOf = (...answers) => answers.map(a => ({ answer: a }));

  test('a word starts in box 1 and an unaided solve moves it up one', () => {
    const r = R.emptyRecord();
    const e = R.applyOutcome(r, 'HAUS', 'unaided', T0);
    assertEqual(e.box, 2);
    assertEqual(e.seen, 1);
    assertEqual(e.unaided, 1);
    assertEqual(e.last, T0);
  });

  test('a hint leaves the box where it is', () => {
    const r = R.emptyRecord();
    R.applyOutcome(r, 'HAUS', 'unaided', T0);
    const e = R.applyOutcome(r, 'HAUS', 'hinted', T0 + DAY);
    assertEqual(e.box, 2, 'hinted should not move the box');
    assertEqual(e.hinted, 1);
    assertEqual(e.seen, 2);
  });

  test('a miss sends a word back to box 1 from anywhere', () => {
    const r = R.emptyRecord();
    for(let i = 0; i < 4; i++) R.applyOutcome(r, 'HAUS', 'unaided', T0 + i * 30 * DAY);
    assertEqual(R.entryFor(r, 'HAUS').box, 5);
    const e = R.applyOutcome(r, 'HAUS', 'missed', T0 + 200 * DAY);
    assertEqual(e.box, 1);
    assertEqual(e.missed, 1);
  });

  test('the top box is a ceiling', () => {
    const r = R.emptyRecord();
    for(let i = 0; i < 9; i++) R.applyOutcome(r, 'HAUS', 'unaided', T0 + i * 30 * DAY);
    assertEqual(R.entryFor(r, 'HAUS').box, R.BOXES);
  });

  test('an unknown outcome is an error, not a silent no-op', () => {
    let threw = false;
    try{ R.applyOutcome(R.emptyRecord(), 'HAUS', 'guessed', T0); }catch(e){ threw = true; }
    assertTrue(threw);
  });

  test('a skip counts but does not touch the box or the date', () => {
    const r = R.emptyRecord();
    R.applyOutcome(r, 'HAUS', 'unaided', T0);
    const e = R.applySkip(r, 'HAUS');
    assertEqual(e.skipped, 1);
    assertEqual(e.box, 2);
    assertEqual(e.last, T0);
    assertEqual(e.seen, 1, 'a skip is not a sighting');
  });

  test('a word just missed is due immediately; a promoted one waits its box out', () => {
    const r = R.emptyRecord();
    R.applyOutcome(r, 'MISS', 'missed', T0);
    R.applyOutcome(r, 'UP2', 'unaided', T0);                     // box 2 waits 1 day
    assertTrue(R.isDue(R.entryFor(r, 'MISS'), T0), 'box 1 waits no time');
    assertTrue(!R.isDue(R.entryFor(r, 'UP2'), T0), 'box 2 not due the same day');
    assertTrue(!R.isDue(R.entryFor(r, 'UP2'), T0 + DAY - 1), 'not due just short of a day');
    assertTrue(R.isDue(R.entryFor(r, 'UP2'), T0 + DAY), 'due once a day has passed');
  });

  test('waiting times grow with the box', () => {
    const r = R.emptyRecord();
    let t = T0;
    for(let box = 2; box <= R.BOXES; box++){
      R.applyOutcome(r, 'W', 'unaided', t);
      const e = R.entryFor(r, 'W');
      assertEqual(e.box, box);
      const wait = R.WAIT_DAYS[box];
      assertTrue(!R.isDue(e, t + (wait - 0.5) * DAY), `box ${box} should still be waiting at ${wait - 0.5} days`);
      assertTrue(R.isDue(e, t + wait * DAY), `box ${box} should be due at ${wait} days`);
      t += wait * DAY;
    }
  });

  test('a word never seen is due, and outranked by one that was missed', () => {
    const r = R.emptyRecord();
    R.applyOutcome(r, 'MISSED', 'missed', T0);
    assertTrue(R.priority(null, T0) >= 0, 'never seen is due');
    assertTrue(R.priority(R.entryFor(r, 'MISSED'), T0) > R.priority(null, T0));
  });

  test('a skipped-but-never-seen word ranks above a plain unseen one', () => {
    const r = R.emptyRecord();
    R.applySkip(r, 'AWKWARD');
    assertTrue(R.priority(R.entryFor(r, 'AWKWARD'), T0) > R.priority(null, T0));
  });

  test('among due words a lower box ranks higher, and being more overdue helps', () => {
    const r = R.emptyRecord();
    R.applyOutcome(r, 'B2', 'unaided', T0);                                  // box 2, waits 1 day
    R.applyOutcome(r, 'B3', 'unaided', T0); R.applyOutcome(r, 'B3', 'unaided', T0); // box 3, waits 3
    const later = T0 + 5 * DAY;    // both due by now
    const p2 = R.priority(R.entryFor(r, 'B2'), later);
    const p3 = R.priority(R.entryFor(r, 'B3'), later);
    assertTrue(p2 > p3, `box 2 (${p2}) should outrank box 3 (${p3})`);
    const muchLater = R.priority(R.entryFor(r, 'B2'), T0 + 20 * DAY);
    assertTrue(muchLater > p2, 'more overdue should rank higher');
  });

  test('a word still waiting is not due, and so ranks below everything due', () => {
    const r = R.emptyRecord();
    R.applyOutcome(r, 'FRESH', 'unaided', T0);
    assertEqual(R.priority(R.entryFor(r, 'FRESH'), T0), -1);
  });

  test('the pool takes about two-thirds by priority and the rest uniformly', () => {
    const r = R.emptyRecord();
    const bank = bankOf('M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'N1', 'N2', 'N3', 'N4', 'N5');
    for(const a of ['M1','M2','M3','M4','M5','M6','M7','M8','M9','M10']) R.applyOutcome(r, a, 'missed', T0);
    const pool = R.pickPool(bank, r, 9, E.makeRng('x'), T0);
    assertEqual(pool.length, 9);
    const missedInPool = pool.filter(w => /^M/.test(w.answer)).length;
    // 6 slots by priority, all of which the ten missed words claim. The remaining 3 are drawn
    // uniformly from the 9 left, of which 4 are missed and 5 never seen - so between 6 and 9
    // missed words in total, never fewer than the 6 the priority share guarantees.
    assertTrue(missedInPool >= 6 && missedInPool <= 9, `expected 6-9 missed words in the pool, got ${missedInPool}`);
  });

  test('missed words come back in the next draw ahead of unseen ones', () => {
    const r = R.emptyRecord();
    const bank = [];
    for(let i = 0; i < 200; i++) bank.push({ answer: 'W' + i });
    R.applyOutcome(r, 'W7', 'missed', T0);
    R.applyOutcome(r, 'W120', 'missed', T0);
    R.applyOutcome(r, 'W199', 'hinted', T0);   // hinted in box 1 = still box 1 = also comes back
    for(const seed of ['a', 'b', 'c', 'd']){
      const pool = R.pickPool(bank, r, 10, E.makeRng(seed), T0);
      const answers = pool.map(w => w.answer);
      for(const a of ['W7', 'W120', 'W199']) assertTrue(answers.includes(a), `${a} missing from pool with seed ${seed}`);
    }
  });

  test('when nothing is due, the pool is drawn uniformly and is still full', () => {
    const r = R.emptyRecord();
    const bank = bankOf('A', 'B', 'C', 'D', 'E', 'F');
    for(const w of bank) R.applyOutcome(r, w.answer, 'unaided', T0);   // all in box 2, all waiting
    const pool = R.pickPool(bank, r, 4, E.makeRng('x'), T0);
    assertEqual(pool.length, 4);
    assertEqual(new Set(pool.map(w => w.answer)).size, 4, 'no repeats');
  });

  test('the pool never repeats a word and never exceeds the bank', () => {
    const r = R.emptyRecord();
    const bank = bankOf('A', 'B', 'C');
    const pool = R.pickPool(bank, r, 10, E.makeRng('x'), T0);
    assertEqual(pool.length, 3);
    assertEqual(new Set(pool.map(w => w.answer)).size, 3);
  });

  test('the same seed draws the same pool from the same record', () => {
    const r = R.emptyRecord();
    const bank = [];
    for(let i = 0; i < 50; i++) bank.push({ answer: 'W' + i });
    R.applyOutcome(r, 'W3', 'missed', T0);
    const a = R.pickPool(bank, r, 12, E.makeRng('same'), T0).map(w => w.answer).join(',');
    const b = R.pickPool(bank, r, 12, E.makeRng('same'), T0).map(w => w.answer).join(',');
    const c = R.pickPool(bank, r, 12, E.makeRng('other'), T0).map(w => w.answer).join(',');
    assertEqual(a, b);
    assertNotEqual(a, c);
  });

  test('summarise counts seen, known and due against the bank, not the record', () => {
    const r = R.emptyRecord();
    const bank = bankOf('A', 'B', 'C', 'D');
    R.applyOutcome(r, 'A', 'missed', T0);
    for(let i = 0; i < 4; i++) R.applyOutcome(r, 'B', 'unaided', T0 + i * 30 * DAY);
    R.applyOutcome(r, 'ZZZ', 'unaided', T0);   // in the record but not in this bank
    const s = R.summarise(r, bank);
    assertEqual(s.total, 4);
    assertEqual(s.seen, 2);
    assertEqual(s.known, 1);
  });
}
