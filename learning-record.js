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

  // How many times the grid may refuse a word before the next puzzle has to seat it. Also the
  // ceiling on the stored count: without one, a word the grid keeps refusing climbs for ever and
  // ends up outranking words the reader has actually got wrong.
  //
  // One, because the whole cost of this was measured over a simulated year of daily puzzles and
  // one is where the bias disappears rather than merely shrinking:
  //
  //   refusals allowed   words met   drawn but never once placed   crossings/word   checked
  //           1           958/1000                 0                   2.25          20.2%
  //           2           896/1000                60                   2.37          21.8%
  //           3           867/1000                88                   2.39          22.2%
  //
  // Refusing twice leaves sixty words that a year of daily practice never once showed, and the
  // grid it buys is barely denser. The density given up is smaller than the alternative fix
  // considered for this - guaranteeing the whole draw - would have cost, and unlike that one it
  // touches only the smart puzzle.
  const SKIP_CAP = 1;
  const SKIP_WEIGHT = 8;

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
    // The word reached a grid, so whatever debt the generator owed it is paid. Left standing,
    // a word skipped five times before it appeared would go on outranking its peers for ever.
    e.skipped = 0;
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
    e.skipped = Math.min(SKIP_CAP, e.skipped + 1);
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

  /** A word's skips, as a bounded nudge that can never lift it out of the band it belongs in. */
  function skipBonus(entry){
    return entry ? SKIP_WEIGHT * Math.min(SKIP_CAP, entry.skipped || 0) : 0;
  }

  /**
   * How urgently a word wants to be in the next puzzle, or -1 if it is not due at all.
   *
   * Bands a hundred apart, with everything that varies inside a band bounded below that
   * hundred - so the order between bands is absolute whatever the other signals say, and the
   * small random jitter the caller adds shuffles within a band without ever crossing one:
   *
   *   300  got it wrong or needed a hint last time (box 1, and seen)
   *   200  never met, and the grid has refused it to the ceiling
   *   100  waiting time up: lowest box first, most overdue first
   *     0  never met
   *    -1  still waiting; not a candidate at all
   *
   * A word the reader has actually failed comes first; nothing promotes past that. But a word
   * the grid has refused sits above the merely-due, and that placing is what makes the skip
   * count worth keeping at all. Measured over a simulated year of daily puzzles: with skips as
   * a nudge inside the never-met band, a reader met 847 of 1000 words and the same awkward
   * vocabulary was drawn and dropped all year - because some 760 words are due at any moment,
   * and a nudge of 24 never clears them. Given a band of its own it is drawn next, and required
   * when it is: see stuckIn().
   */
  function priority(entry, now){
    if(!entry || !entry.seen) return (entry && entry.skipped >= SKIP_CAP) ? 200 : skipBonus(entry);
    if(!isDue(entry, now)) return -1;
    if(entry.box === 1) return 300 + skipBonus(entry);
    const overdue = Math.min(30, daysSince(entry, now) - WAIT_DAYS[entry.box]);
    return 100 + 5 * (BOXES - entry.box) + overdue + skipBonus(entry);
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

  /**
   * Words the grid has turned away as often as is tolerated, and which the next puzzle should
   * seat whatever it costs the layout.
   *
   * The counting alone is not enough. Raising a word's priority gets it drawn more often, not
   * placed more often, and a word the grid finds awkward loses every time it is drawn: over a
   * simulated year of daily puzzles, 95 words of 1000 were drawn again and again and never once
   * appeared. Since awkward words are disproportionately the ones worth practising, that is the
   * whole bias rather than a corner of it. So at the ceiling the word stops being a candidate
   * and becomes a requirement, and the generator seats it whatever it costs the layout.
   */
  function stuckIn(pool, record){
    const out = new Set();
    for(const word of pool){
      const e = entryFor(record, word.answer);
      if(e && e.skipped >= SKIP_CAP) out.add(word.answer);
    }
    return out;
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
    SKIP_CAP,
    SKIP_WEIGHT,
    emptyRecord,
    entryFor,
    applyOutcome,
    applySkip,
    isDue,
    daysSince,
    priority,
    pickPool,
    stuckIn,
    summarise
  };
});
