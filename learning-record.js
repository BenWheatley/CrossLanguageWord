/**
 * learning-record.js
 *
 * What the trainer remembers about each word, and how that memory chooses the next puzzle's
 * words. Pure data in, pure data out: no DOM, no storage, no clock of its own - the caller
 * passes `now`, so every rule here can be tested against a fixed date.
 *
 * Loaded the same two ways as crossword-engine.js: as `window.LearningRecord` in the browser,
 * or with require() in Node.
 *
 * The scheme is Leitner boxes. A word starts in box 1. Solving it unaided moves it up a box;
 * a miss sends it back to box 1; a hint leaves it where it is. Each box has a waiting time,
 * and a word is *due* once that time has passed since it was last in a puzzle. Box 1 waits no
 * time at all, so a word just missed is eligible for the very next puzzle - which is the
 * point of missing it.
 */
(function(root, factory){
  if(typeof module === 'object' && module.exports){
    module.exports = factory();
  } else {
    root.LearningRecord = factory();
  }
})(typeof self !== 'undefined' ? self : this, function(){

  const BOXES = 5;
  const DAY_MS = 24 * 60 * 60 * 1000;
  // Days a word waits in each box before it is due again. Index 0 is unused.
  const WAIT_DAYS = [null, 0, 1, 3, 7, 14];

  /** How much of a draw goes to due words. The rest is uniform, so variety survives. */
  const DUE_SHARE = 2 / 3;

  function emptyRecord(){
    return { version: 1, words: {} };
  }

  function entryFor(record, answer){
    return record.words[answer] || null;
  }

  function ensureEntry(record, answer){
    if(!record.words[answer]){
      record.words[answer] = { box: 1, seen: 0, unaided: 0, hinted: 0, missed: 0, skipped: 0, last: 0 };
    }
    return record.words[answer];
  }

  /**
   * Records how a word went in a puzzle. `outcome` is one of 'unaided', 'hinted' or 'missed'.
   * Returns the entry after the change.
   */
  function applyOutcome(record, answer, outcome, now){
    const e = ensureEntry(record, answer);
    if(outcome === 'unaided'){
      e.box = Math.min(BOXES, e.box + 1);
      e.unaided++;
    } else if(outcome === 'hinted'){
      e.hinted++;
    } else if(outcome === 'missed'){
      e.box = 1;
      e.missed++;
    } else {
      throw new Error('unknown outcome: ' + outcome);
    }
    e.seen++;
    e.last = now;
    return e;
  }

  /**
   * Records that a word was drawn for a puzzle but did not fit its grid. Leaves the box and
   * the date alone - the reader never saw it, so nothing about their knowledge has changed -
   * but counts it, so the draw can push the word forward next time rather than let awkward
   * vocabulary quietly drop out of sight.
   */
  function applySkip(record, answer){
    const e = ensureEntry(record, answer);
    e.skipped++;
    return e;
  }

  /** Days since the word was last in a puzzle; Infinity if never. */
  function daysSince(entry, now){
    if(!entry || !entry.last) return Infinity;
    return (now - entry.last) / DAY_MS;
  }

  /** Is the word's waiting time up? A word never seen is always due. */
  function isDue(entry, now){
    if(!entry || !entry.seen) return true;
    return daysSince(entry, now) >= WAIT_DAYS[entry.box];
  }

  /**
   * How urgently a word wants to be in the next puzzle, or -1 if it is not due at all.
   *
   * Tiers, highest first: a word missed or hinted last time (box 1 and seen) comes back
   * before anything else; then words whose waiting time is up, lowest box first and most
   * overdue first; then words never yet seen. Skips lift a word within its tier - a word the
   * grid keeps rejecting would otherwise sit in the never-seen tier forever, which is the bias
   * the skip count exists to correct. The gaps between tiers are wide enough that a small
   * random jitter, added by the caller, shuffles within a tier without crossing one.
   */
  function priority(entry, now){
    if(!entry || !entry.seen) return (entry && entry.skipped) ? 50 + 10 * entry.skipped : 0;
    if(!isDue(entry, now)) return -1;
    if(entry.box === 1) return 100 + 10 * entry.skipped;
    const overdue = Math.min(30, daysSince(entry, now) - WAIT_DAYS[entry.box]);
    return 60 + 5 * (BOXES - entry.box) + overdue + 10 * entry.skipped;
  }

  /**
   * Chooses `poolSize` words from `bank` for a smart puzzle.
   *
   * About two-thirds by priority - the words most in need of practice - and the remainder
   * uniformly from whatever is left, so a puzzle is never only the words you got wrong. Where
   * fewer words are due than that share allows, the uniform part grows to fill the pool.
   * `rnd` is a generator in [0, 1); handed a seeded one the choice is reproducible.
   */
  function pickPool(bank, record, poolSize, rnd, now){
    const size = Math.min(poolSize, bank.length);
    const dueSlots = Math.round(size * DUE_SHARE);
    const scored = bank.map((word, i) => ({
      word, i,
      score: priority(entryFor(record, word.answer), now),
      jitter: rnd()
    }));
    const due = scored.filter(s => s.score >= 0)
      .sort((a, b) => (b.score + b.jitter) - (a.score + a.jitter));
    const chosen = due.slice(0, dueSlots);
    const taken = new Set(chosen.map(s => s.i));
    const rest = scored.filter(s => !taken.has(s.i))
      .sort((a, b) => a.jitter - b.jitter);
    return chosen.concat(rest.slice(0, size - chosen.length)).map(s => s.word);
  }

  /** Headline numbers for a list: how many words have been met, and how many are in the top box. */
  function summarise(record, bank){
    let seen = 0, known = 0, due = 0;
    const now = Date.now();
    for(const word of bank){
      const e = entryFor(record, word.answer);
      if(e && e.seen){
        seen++;
        if(e.box === BOXES) known++;
        if(isDue(e, now)) due++;
      }
    }
    return { total: bank.length, seen, known, due };
  }

  return {
    BOXES,
    WAIT_DAYS,
    DUE_SHARE,
    emptyRecord,
    entryFor,
    applyOutcome,
    applySkip,
    isDue,
    daysSince,
    priority,
    pickPool,
    summarise
  };
});
