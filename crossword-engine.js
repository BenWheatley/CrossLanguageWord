/**
 * crossword-engine.js
 *
 * The pure, DOM-independent crossword generation logic used by crossword-trainer.html.
 * No browser globals (document/window/DOM) are touched anywhere in this file - it's plain
 * data in, plain data out - which is what makes it possible to unit-test directly with Node,
 * without spinning up a fake browser (see tests/engine.test.js).
 *
 * Loaded two ways:
 *   - In the browser: <script src="crossword-engine.js"></script> before the app's own inline
 *     script, exposing everything as `window.CrosswordEngine`.
 *   - In Node (tests, tooling): `const engine = require('./crossword-engine.js');`
 */
(function(root, factory){
  if(typeof module === 'object' && module.exports){
    module.exports = factory();
  } else {
    root.CrosswordEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function(){
  'use strict';

  // ---------- text handling ----------
  // Grapheme-aware helpers so multi-byte / combining characters (ü, π, emoji, etc.) are treated
  // as a single "letter" for crossword purposes rather than being split into raw UTF-16 code units.
  function toUpperGrapheme(str){
    return str.toLocaleUpperCase();
  }
  function graphemes(str){
    // Good-enough grapheme split: handles surrogate pairs (astral chars).
    return Array.from(str);
  }

  function shuffle(arr){
    const a = arr.slice();
    for(let i=a.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [a[i],a[j]] = [a[j],a[i]];
    }
    return a;
  }

  // Numeric encoding instead of string concatenation ("r,c") - Map operations with numeric keys
  // are meaningfully faster than with string keys, and this is the hottest of hot paths (called
  // many times per candidate placement check). OFFSET is comfortably larger than any real grid
  // could need (rows/cols stay well under a few hundred in practice), so there's no collision risk,
  // and the resulting values stay far inside JS's safe integer range.
  const KEY_OFFSET = 100000;
  function key(r,c){ return (r+KEY_OFFSET)*1000000 + (c+KEY_OFFSET); }
  function unkey(k){ return [Math.floor(k/1000000)-KEY_OFFSET, (k%1000000)-KEY_OFFSET]; }

  /**
   * @param {number} maxCols - if given, any placement that would make the grid's column span
   *   exceed this is rejected outright, so the finished grid never needs more columns than this,
   *   however tall it ends up needing to grow instead. No cap on rows.
   */
  function attemptPlacement(candidates, target, maxCols = Infinity){
    const grid = new Map(); // key -> letter
    // Tracks which direction(s) already run through each occupied cell. A cell can legitimately
    // belong to at most one across word AND at most one down word - if a new word's direction
    // already has a claim on a cell it passes through, that's an invalid same-direction overlap
    // (e.g. "RENT" running straight through the tail of "PARENT"), not a real crossing, even
    // though the letters happen to match and it looks "free" by area/crossing count alone.
    const dirsAt = new Map(); // key -> {across:bool, down:bool}
    const placements = []; // {word, row, col, dir, letters}
    const first = candidates[0];
    const firstLetters = graphemes(first.answer);
    // If the anchor word is itself longer than the column budget, lay it out vertically instead
    // (rows aren't capped) rather than immediately breaking the width constraint before anything
    // else is even placed.
    const firstDir = firstLetters.length > maxCols ? 'down' : 'across';
    for(let i=0;i<firstLetters.length;i++){
      const r = firstDir==='down' ? i : 0;
      const c = firstDir==='down' ? 0 : i;
      grid.set(key(r,c), firstLetters[i]);
      dirsAt.set(key(r,c), { across: firstDir==='across', down: firstDir==='down' });
    }
    placements.push({word:first, row:0, col:0, dir:firstDir, letters:firstLetters});

    // Track the grid's bounding box incrementally so each candidate placement can be scored by
    // how much it would grow the overall footprint, not just by how many letters it crosses.
    let minR = 0, maxR = firstDir==='down' ? firstLetters.length - 1 : 0;
    let minC = 0, maxC = firstDir==='across' ? firstLetters.length - 1 : 0;

    // Returns {crossCount, area} for this placement (area = the grid's bounding-box area *if*
    // this placement were added), or null if the placement is invalid.
    function evalPlacement(letters, row, col, dir){
      const len = letters.length;
      if(dir === 'across'){
        if(grid.has(key(row, col-1))) return null;
        if(grid.has(key(row, col+len))) return null;
      } else {
        if(grid.has(key(row-1, col))) return null;
        if(grid.has(key(row+len, col))) return null;
      }
      let crossCount = 0;
      for(let i=0;i<len;i++){
        const r = dir==='across' ? row : row+i;
        const c = dir==='across' ? col+i : col;
        const existing = grid.get(key(r,c));
        if(existing !== undefined){
          if(existing !== letters[i]) return null;
          const existingDirs = dirsAt.get(key(r,c));
          if(existingDirs && existingDirs[dir]) return null; // same-direction overlap, not a real crossing
          crossCount++;
        } else {
          if(dir === 'across'){
            if(grid.has(key(r-1,c)) || grid.has(key(r+1,c))) return null;
          } else {
            if(grid.has(key(r,c-1)) || grid.has(key(r,c+1))) return null;
          }
        }
      }
      if(crossCount === 0) return null;
      const endR = dir==='down' ? row+len-1 : row;
      const endC = dir==='across' ? col+len-1 : col;
      const newMinR = Math.min(minR, row), newMaxR = Math.max(maxR, endR);
      const newMinC = Math.min(minC, col), newMaxC = Math.max(maxC, endC);
      if(newMaxC - newMinC + 1 > maxCols) return null; // would make the grid too wide
      const area = (newMaxR-newMinR+1) * (newMaxC-newMinC+1);
      return { crossCount, area };
    }

    function place(letters, row, col, dir){
      for(let i=0;i<letters.length;i++){
        const r = dir==='across' ? row : row+i;
        const c = dir==='across' ? col+i : col;
        grid.set(key(r,c), letters[i]);
        const existingDirs = dirsAt.get(key(r,c)) || { across:false, down:false };
        existingDirs[dir] = true;
        dirsAt.set(key(r,c), existingDirs);
      }
      const endR = dir==='down' ? row+letters.length-1 : row;
      const endC = dir==='across' ? col+letters.length-1 : col;
      minR = Math.min(minR, row); maxR = Math.max(maxR, endR);
      minC = Math.min(minC, col); maxC = Math.max(maxC, endC);
    }

    // A placement beats another if it crosses more letters, or - for a tie on crossings -
    // if it results in a smaller overall grid. Crossings come first because a denser, more
    // interlocked grid also tends to end up more compact on its own; area only breaks ties.
    function better(a, b){
      if(!b) return true;
      if(a.crossCount !== b.crossCount) return a.crossCount > b.crossCount;
      return a.area < b.area;
    }

    // Scans a specific set of grid cells (as [r,c,letter] triples) for crossing opportunities for
    // this word, starting from (and possibly improving on) a known-so-far best spot. Used both
    // for a full initial scan (all current grid cells) and for cheap incremental updates (only
    // the cells a single newly-placed word just added).
    function scanCellsForSpots(letters, cells, currentBest){
      let best = currentBest;
      const tried = new Set();
      for(const [r0, c0, existingLetter] of cells){
        for(let i=0;i<letters.length;i++){
          if(letters[i] !== existingLetter) continue;
          const acrossRow = r0, acrossCol = c0-i;
          const aKey = 'A:'+acrossRow+','+acrossCol;
          if(!tried.has(aKey)){
            tried.add(aKey);
            const ev = evalPlacement(letters, acrossRow, acrossCol, 'across');
            if(ev && better(ev, best)) best = {row:acrossRow, col:acrossCol, dir:'across', crossCount:ev.crossCount, area:ev.area};
          }
          const downRow = r0-i, downCol = c0;
          const dKey = 'D:'+downRow+','+downCol;
          if(!tried.has(dKey)){
            tried.add(dKey);
            const ev = evalPlacement(letters, downRow, downCol, 'down');
            if(ev && better(ev, best)) best = {row:downRow, col:downCol, dir:'down', crossCount:ev.crossCount, area:ev.area};
          }
        }
      }
      return best;
    }

    function allGridCells(){
      const out = [];
      for(const [k, letter] of grid){
        const [r, c] = unkey(k);
        out.push([r, c, letter]);
      }
      return out;
    }

    // Each remaining candidate carries a cached best-known spot. A spot can only ever get better
    // (or stay the same) as more letters go on the grid - cells only get added, never removed -
    // so instead of rescanning every candidate against the whole grid at every step (expensive on
    // larger puzzles), we scan once up front and afterward only check each candidate against the
    // handful of cells the most recently placed word just added.
    const remainingEntries = candidates.slice(1).map(w => ({ word: w, letters: graphemes(w.answer), bestSpot: null }));
    {
      const initialCells = allGridCells();
      for(const entry of remainingEntries) entry.bestSpot = scanCellsForSpots(entry.letters, initialCells, null);
    }

    let placedCount = 1;
    let regionCount = 1; // how many disjoint regions have been started (the initial anchor is #1)
    const diagonalStep = 3;
    while(placedCount < target && remainingEntries.length > 0){
      // Refresh each candidate's cached spot against the *current* grid before comparing. Area
      // depends on the whole bounding box, so it goes stale after any placement at all, not just
      // ones that share letters with this candidate - the incremental "newCells" update below
      // wouldn't catch that on its own. Validity can go stale too (a neighboring cell may since
      // have been filled, breaking the "isolated word" boundary rule); if so, fall back to a full
      // rescan for just that one candidate so a still-good spot elsewhere isn't silently lost.
      for(const entry of remainingEntries){
        if(!entry.bestSpot) continue;
        const fresh = evalPlacement(entry.letters, entry.bestSpot.row, entry.bestSpot.col, entry.bestSpot.dir);
        if(fresh){
          entry.bestSpot.crossCount = fresh.crossCount;
          entry.bestSpot.area = fresh.area;
        } else {
          entry.bestSpot = scanCellsForSpots(entry.letters, allGridCells(), null);
        }
      }

      let bestIdx = -1;
      for(let i=0;i<remainingEntries.length;i++){
        if(remainingEntries[i].bestSpot && better(remainingEntries[i].bestSpot, bestIdx===-1 ? null : remainingEntries[bestIdx].bestSpot)){
          bestIdx = i;
        }
      }

      let spot, entry;
      if(bestIdx === -1){
        // No remaining word can cross anything already on the grid. Crosswords can legitimately
        // have more than one disjoint block of words, so start a new region instead of stopping
        // here and leaving words unplaced - staggered diagonally off the existing content (rather
        // than just stacked straight underneath) so multiple regions pack together reasonably.
        entry = remainingEntries.shift();
        const letters = entry.letters;
        const row = maxR + 2;
        let dir, col;
        if(letters.length > maxCols){
          dir = 'down';
          col = minC + (regionCount % Math.max(1, maxCols));
        } else {
          dir = 'across';
          const span = Math.max(1, maxCols - letters.length + 1);
          col = minC + ((regionCount * diagonalStep) % span);
          // The offset above is safe on its own, but combined with the grid's *existing* bounds
          // (which can extend further left/right than this new region alone) it could still push
          // the overall width past maxCols - fall back to flush-with-minC, which is always safe:
          // existing width is already <= maxCols, and this word's own length is <= maxCols too.
          const wouldBeMaxC = Math.max(maxC, col + letters.length - 1);
          const wouldBeMinC = Math.min(minC, col);
          if(wouldBeMaxC - wouldBeMinC + 1 > maxCols) col = minC;
        }
        regionCount++;
        spot = { row, col, dir };
      } else {
        entry = remainingEntries[bestIdx];
        spot = entry.bestSpot;
        remainingEntries.splice(bestIdx, 1);
      }

      place(entry.letters, spot.row, spot.col, spot.dir);
      placements.push({word:entry.word, row:spot.row, col:spot.col, dir:spot.dir, letters:entry.letters});
      placedCount++;

      // Only the word just placed could unlock a new (or better) crossing for anyone else -
      // no need to rescan the rest of the grid for them.
      const newCells = [];
      for(let i=0;i<entry.letters.length;i++){
        const r = spot.dir==='across' ? spot.row : spot.row+i;
        const c = spot.dir==='across' ? spot.col+i : spot.col;
        newCells.push([r, c, entry.letters[i]]);
      }
      for(const other of remainingEntries){
        other.bestSpot = scanCellsForSpots(other.letters, newCells, other.bestSpot);
      }
    }
    return { placements, grid };
  }

  // Which words end up in the puzzle should be as random as possible - not biased toward
  // whichever ones happen to be easier to interlock, or certain vocabulary would get shown far
  // more often than the rest across repeated generations. The only constraint is basic
  // feasibility: at least one word needs to fit within maxCols so there's a valid starting point.
  function pickRandomSubset(bank, target, maxCols){
    const pool = shuffle(bank);
    const subset = pool.slice(0, Math.min(target, pool.length));
    if(Number.isFinite(maxCols)){
      const fits = w => graphemes(w.answer).length <= maxCols;
      if(!subset.some(fits)){
        const replacement = pool.slice(subset.length).find(fits);
        if(replacement){
          let longestIdx = 0;
          for(let i=1;i<subset.length;i++){
            if(graphemes(subset[i].answer).length > graphemes(subset[longestIdx].answer).length) longestIdx = i;
          }
          subset[longestIdx] = replacement;
        }
      }
    }
    return subset;
  }

  // Shared bounding-box calculation, used both to size the final grid and to compare
  // candidate layouts by area.
  function computeBounds(placements){
    let minR=Infinity, minC=Infinity, maxR=-Infinity, maxC=-Infinity;
    for(const p of placements){
      const len = p.letters.length;
      const endR = p.dir==='down' ? p.row+len-1 : p.row;
      const endC = p.dir==='across' ? p.col+len-1 : p.col;
      minR = Math.min(minR, p.row); maxR = Math.max(maxR, endR);
      minC = Math.min(minC, p.col); maxC = Math.max(maxC, endC);
    }
    return { minR, minC, rows: maxR-minR+1, cols: maxC-minC+1 };
  }

  /**
   * @param {Array} bank - candidate words, each {answer, clue}
   * @param {number} targetCount - how many words to try to place
   * @param {number} timeBudgetMs - keep trying different arrangements of the same randomly
   *   chosen word subset for about this many milliseconds, keeping whichever arrangement came
   *   out smallest. Always runs at least one attempt regardless of the budget. Bigger puzzles
   *   naturally get fewer attempts (each one costs more), smaller puzzles get more - this adapts
   *   automatically rather than needing a fixed count tuned for one size.
   * @param {number} maxCols - if given, caps how many columns wide the finished grid can be
   *   (no cap on rows). The grid grows taller instead of wider once this limit is reached.
   */
  function buildCrossword(bank, targetCount, timeBudgetMs = 160, maxCols = Infinity){
    const target = Math.min(targetCount, bank.length);
    // Which words appear is decided once, uniformly at random - not re-rolled per attempt, or
    // whichever random sample happens to be easier to interlock would win more often, silently
    // favoring some vocabulary over the rest across repeated generations.
    const subset = pickRandomSubset(bank, target, maxCols);

    let best = null, bestArea = Infinity, bestPlacedCount = -1;
    const deadline = Date.now() + timeBudgetMs;
    do {
      // What varies between attempts is purely the processing order of this same fixed subset -
      // attemptPlacement's disjoint-region fallback means the whole subset gets placed regardless
      // of order, so different shuffles just explore different resulting layouts.
      const result = attemptPlacement(shuffle(subset), target, maxCols);
      const bounds = computeBounds(result.placements);
      const placedCount = result.placements.length;
      const area = bounds.rows * bounds.cols;
      if(!best || placedCount > bestPlacedCount || (placedCount === bestPlacedCount && area < bestArea)){
        best = result; bestPlacedCount = placedCount; bestArea = area;
      }
    } while(Date.now() < deadline);

    return best;
  }

  function trimAndIndex(result){
    const { minR, minC, rows: R, cols: C } = computeBounds(result.placements);
    const g = [];
    for(let r=0;r<R;r++){ g.push(new Array(C).fill(null)); }
    for(const [k, letter] of result.grid){
      const [kr, kc] = unkey(k);
      const r = kr-minR, c = kc-minC;
      if(r>=0 && r<R && c>=0 && c<C) g[r][c] = letter;
    }
    const placements = result.placements.map(p => ({
      answer: p.word.answer, clue: p.word.clue, dir: p.dir,
      row: p.row-minR, col: p.col-minC, len: p.letters.length
    }));
    return { grid: g, rows: R, cols: C, placements };
  }

  function numberGrid(built){
    const {grid, rows, cols, placements} = built;
    const numAt = {}; // key r,c -> number
    let n = 0;
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        if(grid[r][c] === null) continue;
        const startsAcross = (c===0 || grid[r][c-1]===null) && (c+1<cols && grid[r][c+1]!==null);
        const startsDown = (r===0 || grid[r-1][c]===null) && (r+1<rows && grid[r+1][c]!==null);
        if(startsAcross || startsDown){
          n++;
          numAt[key(r,c)] = n;
        }
      }
    }
    const indexed = placements.map(p => ({...p, number: numAt[key(p.row,p.col)]}));
    return { numAt, placements: indexed };
  }


  return {
    toUpperGrapheme,
    graphemes,
    shuffle,
    key,
    attemptPlacement,
    pickRandomSubset,
    computeBounds,
    buildCrossword,
    trimAndIndex,
    numberGrid
  };
});
