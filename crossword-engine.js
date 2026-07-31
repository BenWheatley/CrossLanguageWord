/**
 * crossword-engine.js
 *
 * The pure, DOM-independent crossword generation logic used by crossword-trainer.html.
 * No browser globals (document/window/DOM) are touched anywhere in this file — it's plain
 * data in, plain data out — which is what makes it possible to unit-test directly with Node,
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

  function key(r,c){ return r+','+c; }

  function attemptPlacement(candidates, target){
    const grid = new Map(); // key -> letter
    const placements = []; // {word, row, col, dir, letters}
    const first = candidates[0];
    const firstLetters = graphemes(first.answer);
    for(let i=0;i<firstLetters.length;i++) grid.set(key(0,i), firstLetters[i]);
    placements.push({word:first, row:0, col:0, dir:'across', letters:firstLetters});

    let remaining = candidates.slice(1);

    // Returns the number of crossing letters for this placement, or null if invalid.
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
          crossCount++;
        } else {
          if(dir === 'across'){
            if(grid.has(key(r-1,c)) || grid.has(key(r+1,c))) return null;
          } else {
            if(grid.has(key(r,c-1)) || grid.has(key(r,c+1))) return null;
          }
        }
      }
      return crossCount > 0 ? crossCount : null;
    }

    function place(letters, row, col, dir){
      for(let i=0;i<letters.length;i++){
        const r = dir==='across' ? row : row+i;
        const c = dir==='across' ? col+i : col;
        grid.set(key(r,c), letters[i]);
      }
    }

    let changed = true;
    while(placements.length < target && remaining.length > 0 && changed){
      changed = false;
      for(let idx=0; idx<remaining.length; idx++){
        const cand = remaining[idx];
        const letters = graphemes(cand.answer);
        // Scan every existing letter in the grid for a possible crossing, but instead of taking
        // the first valid spot, keep the one with the most crossing letters (a denser fit).
        let bestSpot = null; // {row, col, dir, crossCount}
        const tried = new Set();
        for(const [k, existingLetter] of grid){
          const [rStr,cStr] = k.split(',');
          const r0 = parseInt(rStr,10), c0 = parseInt(cStr,10);
          for(let i=0;i<letters.length;i++){
            if(letters[i] !== existingLetter) continue;
            const acrossRow = r0, acrossCol = c0-i;
            const aKey = 'A:'+acrossRow+','+acrossCol;
            if(!tried.has(aKey)){
              tried.add(aKey);
              const cc = evalPlacement(letters, acrossRow, acrossCol, 'across');
              if(cc !== null && (!bestSpot || cc > bestSpot.crossCount)){
                bestSpot = {row:acrossRow, col:acrossCol, dir:'across', crossCount:cc};
              }
            }
            const downRow = r0-i, downCol = c0;
            const dKey = 'D:'+downRow+','+downCol;
            if(!tried.has(dKey)){
              tried.add(dKey);
              const cc = evalPlacement(letters, downRow, downCol, 'down');
              if(cc !== null && (!bestSpot || cc > bestSpot.crossCount)){
                bestSpot = {row:downRow, col:downCol, dir:'down', crossCount:cc};
              }
            }
          }
        }
        if(bestSpot){
          place(letters, bestSpot.row, bestSpot.col, bestSpot.dir);
          placements.push({word:cand, row:bestSpot.row, col:bestSpot.col, dir:bestSpot.dir, letters});
          remaining.splice(idx,1);
          idx--;
          changed = true;
          if(placements.length >= target) break;
        }
      }
    }
    return { placements, grid };
  }

  // Counts how many grid cells are shared between an across word and a down word —
  // a rough measure of how "interlocked" (vs. tree-like/sparse) the puzzle is.
  // Builds a candidate pool for one attempt that mirrors a healthy crossword's length
  // distribution — mostly short/medium words with only a small share of long ones — so long
  // compound words (common in languages like German) don't dominate the grid or starve it of crossings.
  const LONG_WORD_THRESHOLD = 9; // letters
  function pickBalancedPool(bank, target){
    const shortMed = bank.filter(w => graphemes(w.answer).length <= LONG_WORD_THRESHOLD);
    const long = bank.filter(w => graphemes(w.answer).length > LONG_WORD_THRESHOLD);
    let desiredLong = Math.min(Math.floor(target * 0.12), long.length);
    let desiredShort = target - desiredLong;
    if(desiredShort > shortMed.length){
      const deficit = desiredShort - shortMed.length;
      desiredShort = shortMed.length;
      desiredLong = Math.min(long.length, desiredLong + deficit);
    }
    let pool = shuffle(shortMed).slice(0, desiredShort).concat(shuffle(long).slice(0, desiredLong));
    // Add reserve short/medium words beyond the target size, so the algorithm has alternatives
    // to reach for if some of the initially-picked words don't fit well.
    const already = new Set(pool);
    const extraNeeded = Math.max(0, Math.round(target * 0.5));
    const reserve = shuffle(bank.filter(w => !already.has(w) && graphemes(w.answer).length <= LONG_WORD_THRESHOLD)).slice(0, extraNeeded);
    return pool.concat(reserve);
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

  function buildCrossword(bank, targetCount){
    const target = Math.min(targetCount, bank.length);
    let candidates = []; // {result, placedCount, area}

    function tryAttempt(pool){
      pool = shuffle(pool);
      // among same-length words, order is already randomized above; sorting longest-first here
      // just gives the greedy placer a sturdier scaffold to start from.
      pool.sort((x,y) => graphemes(y.answer).length - graphemes(x.answer).length);
      const result = attemptPlacement(pool, target);
      const bounds = computeBounds(result.placements);
      candidates.push({ result, placedCount: result.placements.length, area: bounds.rows*bounds.cols });
      return result.placements.length >= target;
    }

    // Phase 1: length-balanced pool, purely for a nicer-looking grid (avoids long compound
    // words dominating). This is the common case and usually reaches the full requested count.
    let reachedTarget = false;
    for(let a=0; a<10; a++){
      if(tryAttempt(pickBalancedPool(bank, target))) reachedTarget = true;
    }

    // Phase 2: guaranteed fallback. If the balanced pool couldn't fit every requested word,
    // hitting the actual requested count matters more than the length aesthetic, so retry using
    // every word in the bank (no restriction) until we succeed — the full bank always has at
    // least as much crossing potential as any restricted subset of it.
    if(!reachedTarget){
      let successes = 0;
      for(let a=0; a<40 && successes<5; a++){
        if(tryAttempt(bank.slice())) successes++;
      }
    }

    candidates.sort((a,b) => b.placedCount - a.placedCount || a.area - b.area);
    return candidates[0].result;
  }

  function trimAndIndex(result){
    const { minR, minC, rows: R, cols: C } = computeBounds(result.placements);
    const g = [];
    for(let r=0;r<R;r++){ g.push(new Array(C).fill(null)); }
    for(const [k, letter] of result.grid){
      const [rStr,cStr] = k.split(',');
      const r = parseInt(rStr,10)-minR, c = parseInt(cStr,10)-minC;
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
    pickBalancedPool,
    computeBounds,
    buildCrossword,
    trimAndIndex,
    numberGrid,
    LONG_WORD_THRESHOLD
  };
});
